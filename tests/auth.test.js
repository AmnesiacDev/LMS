import { jest } from "@jest/globals";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";

// Fail stalled requests quickly while allowing the one-time Mongo binary setup
// a larger budget in beforeAll below.
jest.setTimeout(15_000);

Object.assign(process.env, {
  NODE_ENV: "test",
  JWT_TOKEN_SECRET: "test-secret-32-characters-long!!",
  JWT_REFRESH_TOKEN_SECRET: "test-refresh-secret-32-characters!",
  JWT_TOKEN_EXPIRES_IN: "2h",
  JWT_REFRESH_EXPIRES_IN: "7d",
  SALT_ROUNDS: "4",
  CLIENT_URL: "http://localhost:5173",
});

const sendPasswordResetEmail = jest.fn().mockResolvedValue(undefined);

jest.unstable_mockModule("../Utilities/EmailHelper.js", () => ({
  sendPasswordResetEmail,
  sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
}));

// Sign-up notifications are intentionally fire-and-forget in production. Stub
// the helper so they cannot race database cleanup in this integration suite.
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

  // Wipe all collections between tests for isolation
  const collections = mongoose.connection.collections;
  for (const col of Object.values(collections)) {
    await col.deleteMany({});
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
const validUser = {
  FullName: "Ahmed Hassan",
  UserName: "ahmed_hassan",
  Email: "ahmed@example.com",
  password: "Password123!",
  role: "student",
};

let testIpSequence = 0;
let testIp;

beforeEach(() => {
  testIpSequence += 1;
  testIp = `203.0.113.${testIpSequence}`;
});

const signup = (body = validUser) => request(app).post("/api/v1/auth/signup").set("X-Forwarded-For", testIp).send(body);

const login = (body = { email: validUser.Email, password: validUser.password }) => request(app).post("/api/v1/auth/login").set("X-Forwarded-For", testIp).send(body);

const approveTestUser = async (email = validUser.Email) => User.findOneAndUpdate({ Email: email }, { approvalStatus: "approved" }, { returnDocument: "after" });

// ─── Sign Up ──────────────────────────────────────────────────────────────────
describe("POST /api/v1/auth/signup", () => {
  it("creates a pending user without issuing a session", async () => {
    const res = await signup();
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("success");
    expect(res.body.data.user).toBeDefined();
    expect(res.body.data.user.password).toBeUndefined(); // never expose password
    expect(res.body.data.user.approvalStatus).toBe("pending");
    expect(res.body.data.requiresApproval).toBe(true);
    expect(res.body.data.token).toBeUndefined();
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("rejects duplicate email with 400/500", async () => {
    await signup();
    await User.init();
    const res = await signup();
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("rejects missing required fields", async () => {
    const res = await signup({ Email: "bad@example.com" });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("does not allow a pending account to log in", async () => {
    await signup();
    const res = await login();

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/waiting for admin approval/i);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("lets an admin approve a pending account, then the account can log in", async () => {
    await signup();
    const pendingUser = await User.findOne({ Email: validUser.Email });
    const adminPassword = "AdminPass123!";
    await User.create({
      FullName: "Admin User",
      UserName: "admin_user",
      Email: "admin@example.com",
      password: adminPassword,
      role: "admin",
      emailVerified: true,
    });

    const adminLogin = await request(app).post("/api/v1/auth/login").set("X-Forwarded-For", testIp).send({ email: "admin@example.com", password: adminPassword });

    const review = await request(app).patch(`/api/v1/user/${pendingUser._id}/approval`).set("Authorization", `Bearer ${adminLogin.body.data.token}`).send({ approvalStatus: "approved" });

    expect(review.status).toBe(200);
    expect(review.body.data.user.approvalStatus).toBe("approved");

    const approvedLogin = await login();
    expect(approvedLogin.status).toBe(200);
    expect(approvedLogin.body.data.token).toBeDefined();
  });
});

// ─── Login ────────────────────────────────────────────────────────────────────
describe("POST /api/v1/auth/login", () => {
  beforeEach(async () => {
    await signup();
    await approveTestUser();
  });

  it("returns 200 and sets cookies on valid credentials", async () => {
    const res = await login();
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.data.token).toBeDefined();
    const cookies = res.headers["set-cookie"];
    expect(cookies).toBeDefined();
    expect(cookies.some((c) => c.startsWith("accessToken="))).toBe(true);
    expect(cookies.some((c) => c.startsWith("refreshToken="))).toBe(true);
  });

  it("returns 401 for wrong password — same message as missing user (no enumeration)", async () => {
    const wrong = await login({ email: validUser.Email, password: "WrongPass!" });
    const noUser = await login({ email: "nobody@example.com", password: "anything" });
    expect(wrong.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(wrong.body.message).toBe(noUser.body.message); // same generic message
  });

  it("rejects missing email or password with 400", async () => {
    const res = await request(app).post("/api/v1/auth/login").set("X-Forwarded-For", testIp).send({ email: validUser.Email });
    expect(res.status).toBe(400);
  });
});

// ─── Logout ───────────────────────────────────────────────────────────────────
describe("GET /api/v1/auth/logout", () => {
  it("logs out and clears cookies", async () => {
    await signup();
    await approveTestUser();
    const loginRes = await login();
    const cookies = loginRes.headers["set-cookie"];

    const res = await request(app).get("/api/v1/auth/logout").set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
  });
});

// ─── Refresh Token ────────────────────────────────────────────────────────────
describe("POST /api/v1/auth/refresh", () => {
  it("issues a new access token from a valid refresh token cookie", async () => {
    await signup();
    await approveTestUser();
    const loginRes = await login();
    const cookies = loginRes.headers["set-cookie"];

    const res = await request(app).post("/api/v1/auth/refresh").set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeDefined();
  });

  it("returns 401 when no refresh token cookie is present", async () => {
    const res = await request(app).post("/api/v1/auth/refresh");
    expect(res.status).toBe(401);
  });
});

// ─── Forgot / Reset Password ──────────────────────────────────────────────────
describe("POST /api/v1/auth/forgot-password", () => {
  it("returns 200 with the same message whether email exists or not", async () => {
    await signup();
    const exists = await request(app).post("/api/v1/auth/forgot-password").send({ email: validUser.Email });
    const missing = await request(app).post("/api/v1/auth/forgot-password").send({ email: "ghost@example.com" });

    expect(exists.status).toBe(200);
    expect(missing.status).toBe(200);
    expect(exists.body.message).toBe(missing.body.message);
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/v1/auth/reset-password/:token", () => {
  it("rejects an invalid or expired token with 400", async () => {
    const res = await request(app).post("/api/v1/auth/reset-password/invalidtoken123").send({ password: "NewPass123!" });
    expect(res.status).toBe(400);
  });
});
