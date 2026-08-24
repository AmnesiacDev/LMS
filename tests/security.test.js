import { jest } from "@jest/globals";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";

jest.setTimeout(30_000);

// Must be assigned before App.js is imported below — App.js reads NODE_ENV and
// TRUST_PROXY at module scope. TRUST_PROXY=1 mirrors the production topology
// (one Nginx hop), which is what makes X-Forwarded-For meaningful at all.
Object.assign(process.env, {
  NODE_ENV: "test",
  TRUST_PROXY: "1",
  JWT_TOKEN_SECRET: "test-secret-32-characters-long!!",
  JWT_REFRESH_TOKEN_SECRET: "test-refresh-secret-32-characters!",
  JWT_TOKEN_EXPIRES_IN: "2h",
  JWT_REFRESH_EXPIRES_IN: "7d",
  SALT_ROUNDS: "4",
  CLIENT_URL: "http://localhost:5173",
  // Pin the auth limits so these tests assert the *shape* of the buckets
  // (per-account vs per-IP, login vs signup) rather than whatever the
  // production defaults happen to be tuned to this week.
  LOGIN_ACCOUNT_RATE_MAX: "10",
  LOGIN_IP_RATE_MAX: "30",
  SIGNUP_RATE_MAX: "10",
  RESET_RATE_MAX: "10",
});

const sendPasswordResetEmail = jest.fn().mockResolvedValue(undefined);

jest.unstable_mockModule("../Utilities/EmailHelper.js", () => ({
  sendPasswordResetEmail,
  sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule("../Services/NotificationHelpers.js", () => ({
  getAdminIds: jest.fn().mockResolvedValue([]),
  getStudentRecipients: jest.fn().mockResolvedValue({
    studentUserId: null,
    studentName: "Student",
    parentIds: [],
  }),
  notifyAdmins: jest.fn().mockResolvedValue(undefined),
  notifyStudentAndParents: jest.fn().mockResolvedValue(undefined),
  notifyUsers: jest.fn().mockResolvedValue(undefined),
}));

// ─── Setup / Teardown ─────────────────────────────────────────────────────────
let mongod;
let app;
let User;

beforeAll(async () => {
  ({ default: app } = await import("../App.js"));
  ({ default: User } = await import("../Models/user.js"));
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  jest.clearAllMocks();
  for (const col of Object.values(mongoose.connection.collections)) {
    await col.deleteMany({});
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
// The rate limiters use an in-memory store that is NOT reset between tests, so
// every test claims its own slice of the IPv4 space and its own email addresses.
// Colliding on either would make one test's counters leak into the next.
let ipCounter = 0;
const freshIp = () => {
  ipCounter += 1;
  return `203.0.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
};

const login = (email, password, ip) =>
  request(app)
    .post("/api/v1/auth/login")
    .set("X-Forwarded-For", ip ?? freshIp())
    .send({ email, password });

// FullName is restricted to letters, spaces, hyphens and apostrophes, so the
// uniqueness suffix only goes on UserName/Email.
const signupBody = (n) => ({
  FullName: "Test User",
  UserName: `test_user_${n}`,
  Email: `test.user.${n}@example.com`,
  password: "Password123!",
  role: "student",
});

const signup = (body, ip) =>
  request(app)
    .post("/api/v1/auth/signup")
    .set("X-Forwarded-For", ip ?? freshIp())
    .send(body);

/* ══════════════════════════════════════════════════════════════════════════
   1. Auth rate limiting

   The limiters used to be mounted above express.json(), so req.body was
   undefined inside keyGenerator and the intended per-account key never got
   built. Every request — login and signup alike — fell through to a single
   IP-keyed bucket, which a caller could rotate at will.
   ══════════════════════════════════════════════════════════════════════════ */
describe("Auth rate limiting", () => {
  it("caps login attempts per account even when the source IP rotates", async () => {
    const email = "victim.rotate@example.com";
    const statuses = [];

    for (let i = 0; i < 14; i++) {
      const res = await login(email, `guess-${i}`);
      statuses.push(res.status);
    }

    // A botnet spraying one account from many addresses must still be stopped
    // by the per-account bucket.
    expect(statuses).toContain(429);
    expect(statuses.slice(0, 10)).not.toContain(429);
  });

  it("does not mint a new bucket when the email case changes", async () => {
    const statuses = [];
    const variants = ["victim.case@example.com", "Victim.Case@example.com", "VICTIM.CASE@EXAMPLE.COM"];

    for (let i = 0; i < 14; i++) {
      const res = await login(variants[i % variants.length], `guess-${i}`);
      statuses.push(res.status);
    }

    // Joi lowercases the address, but validation runs after the limiter, so the
    // limiter has to normalise the key itself.
    expect(statuses).toContain(429);
  });

  it("caps signup attempts from a single source IP", async () => {
    const ip = "198.51.100.7";
    const statuses = [];

    for (let i = 0; i < 12; i++) {
      const res = await signup(signupBody(`burst${i}`), ip);
      statuses.push(res.status);
    }

    expect(statuses).toContain(429);
  });

  it("keeps login and signup in separate buckets", async () => {
    // Distinct emails so no per-account bucket trips, distinct IPs so no
    // per-IP bucket trips: nothing here should have any effect on signup.
    for (let i = 0; i < 12; i++) {
      await login(`unrelated.${i}@example.com`, "wrong-password");
    }

    const res = await signup(signupBody("after_login_burst"));

    // Before the fix both routes shared one bucket, so failed logins locked
    // legitimate users out of registering.
    expect(res.status).not.toBe(429);
    expect(res.status).toBe(201);
  });

  it("rate limits password reset requests", async () => {
    const statuses = [];

    for (let i = 0; i < 8; i++) {
      const res = await request(app).post("/api/v1/auth/forgot-password").set("X-Forwarded-For", freshIp()).send({ email: "reset.target@example.com" });
      statuses.push(res.status);
    }

    // /forgot-password is an unauthenticated email trigger. Unlimited, it is a
    // spam amplifier pointed at whatever address the caller names.
    expect(statuses).toContain(429);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   2. Regression guards — these defences already work. They are pinned here so
   a future refactor cannot quietly remove them.
   ══════════════════════════════════════════════════════════════════════════ */
describe("Signup privilege escalation", () => {
  it("rejects a self-assigned admin role", async () => {
    const res = await signup({ ...signupBody("admin_try"), role: "admin" });

    expect(res.status).toBe(400);
    const stored = await User.findOne({ Email: "test.user.admin_try@example.com" }).setOptions({
      withInactive: true,
    });
    expect(stored).toBeNull();
  });

  it("rejects a self-assigned instructor role", async () => {
    const res = await signup({ ...signupBody("instructor_try"), role: "instructor" });

    expect(res.status).toBe(400);
    const stored = await User.findOne({ Email: "test.user.instructor_try@example.com" }).setOptions({
      withInactive: true,
    });
    expect(stored).toBeNull();
  });

  it("forces new accounts into the pending approval queue", async () => {
    const res = await signup({ ...signupBody("pending"), approvalStatus: "approved", isActive: true });

    expect(res.status).toBe(201);
    const stored = await User.findOne({ Email: "test.user.pending@example.com" }).setOptions({
      withInactive: true,
    });
    // Approval state is server-controlled; stripUnknown drops both fields.
    expect(stored.approvalStatus).toBe("pending");
  });
});

describe("NoSQL injection", () => {
  it("rejects a login where the password is a query operator", async () => {
    // Assert the account really exists, otherwise the login below would fail
    // for the boring reason and prove nothing.
    expect((await signup(signupBody("nosql1"))).status).toBe(201);

    const res = await request(app)
      .post("/api/v1/auth/login")
      .set("X-Forwarded-For", freshIp())
      .send({ email: "test.user.nosql1@example.com", password: { $ne: null } });

    expect(res.status).not.toBe(200);
    expect(res.body.data?.token).toBeUndefined();
  });

  it("rejects a login where the email is a query operator", async () => {
    expect((await signup(signupBody("nosql2"))).status).toBe(201);

    const res = await request(app)
      .post("/api/v1/auth/login")
      .set("X-Forwarded-For", freshIp())
      .send({ email: { $gt: "" }, password: { $gt: "" } });

    expect(res.status).not.toBe(200);
    expect(res.body.data?.token).toBeUndefined();
  });
});
