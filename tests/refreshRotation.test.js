import { jest } from "@jest/globals";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";

jest.setTimeout(60_000);

Object.assign(process.env, {
  NODE_ENV: "test",
  TRUST_PROXY: "1",
  JWT_TOKEN_SECRET: "test-secret-32-characters-long!!",
  JWT_REFRESH_TOKEN_SECRET: "test-refresh-secret-32-characters!",
  JWT_TOKEN_EXPIRES_IN: "2h",
  JWT_REFRESH_EXPIRES_IN: "7d",
  SALT_ROUNDS: "4",
  CLIENT_URL: "http://localhost:5173",
});

jest.unstable_mockModule("../Utilities/EmailHelper.js", () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule("../Services/NotificationHelpers.js", () => ({
  getAdminIds: jest.fn().mockResolvedValue([]),
  getStudentRecipients: jest.fn().mockResolvedValue({ studentUserId: null, studentName: "S", parentIds: [] }),
  notifyAdmins: jest.fn().mockResolvedValue(undefined),
  notifyStudentAndParents: jest.fn().mockResolvedValue(undefined),
  notifyUsers: jest.fn().mockResolvedValue(undefined),
}));

let mongod;
let app;
let User;
let Token;

beforeAll(async () => {
  ({ default: app } = await import("../App.js"));
  ({ default: User } = await import("../Models/user.js"));
  ({ default: Token } = await import("../Models/Token.js"));
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  for (const col of Object.values(mongoose.connection.collections)) {
    await col.deleteMany({});
  }
});

let ipCounter = 0;
const freshIp = () => {
  ipCounter += 1;
  return `203.0.113.${(ipCounter % 250) + 1}`;
};

const readRefreshCookie = (res) => {
  const raw = res.headers["set-cookie"].find((c) => c.startsWith("refreshToken="));
  return raw.split(";")[0];
};

/** Register + log in, returning the refresh cookie. */
const loginFresh = async () => {
  await User.create({
    FullName: "Race Target",
    UserName: "race_target",
    Email: "race@example.com",
    password: "RacePass123!",
    role: "instructor",
  });

  const res = await request(app)
    .post("/api/v1/auth/login")
    .set("X-Forwarded-For", freshIp())
    .send({ email: "race@example.com", password: "RacePass123!" });

  expect(res.status).toBe(200);
  return readRefreshCookie(res);
};

const refreshWith = (cookie) =>
  request(app).post("/api/v1/auth/refresh").set("X-Forwarded-For", freshIp()).set("Cookie", cookie);

describe("refresh token rotation", () => {
  it("lets two tabs refresh the same token concurrently without killing the session", async () => {
    const cookie = await loginFresh();

    // Both tabs hit /refresh with the identical cookie, as they do when their
    // proactive refresh timers fire at the same point in the token's lifetime.
    const [a, b] = await Promise.all([refreshWith(cookie), refreshWith(cookie)]);

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body.data.token).toBeTruthy();
    expect(b.body.data.token).toBeTruthy();
  });

  it("survives a burst of five simultaneous refreshes", async () => {
    const cookie = await loginFresh();

    const results = await Promise.all(Array.from({ length: 5 }, () => refreshWith(cookie)));

    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
  });

  it("still issues a working session after the concurrent refresh", async () => {
    const cookie = await loginFresh();
    const [a] = await Promise.all([refreshWith(cookie), refreshWith(cookie)]);

    const me = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${a.body.data.token}`)
      .set("X-Forwarded-For", freshIp());

    expect(me.status).toBe(200);
    expect(me.body.data.user.Email).toBe("race@example.com");
  });

  it("revokes the whole family when a token is replayed after the grace window", async () => {
    const cookie = await loginFresh();

    const first = await refreshWith(cookie);
    expect(first.status).toBe(200);

    // Backdate the rotation so the original token looks like an old one being
    // replayed — the stolen-token case the grace window must not cover.
    await Token.updateMany(
      { rotatedAt: { $ne: null } },
      { $set: { rotatedAt: new Date(Date.now() - 10 * 60 * 1000) } },
    );

    const replay = await refreshWith(cookie);
    expect(replay.status).toBe(401);

    // Theft response: every session for that user is gone.
    const user = await User.findOne({ Email: "race@example.com" });
    expect(await Token.countDocuments({ userId: user._id })).toBe(0);
  });

  it("rejects a refresh token that was never issued", async () => {
    await loginFresh();
    const res = await refreshWith("refreshToken=not-a-real-jwt");
    expect(res.status).toBe(401);
  });

  it("does not let rotated rows accumulate past the grace window", async () => {
    const cookie = await loginFresh();
    const user = await User.findOne({ Email: "race@example.com" });

    let current = cookie;
    for (let i = 0; i < 4; i++) {
      const res = await refreshWith(current);
      expect(res.status).toBe(200);
      current = readRefreshCookie(res);
      // Age every rotated row out of the window so the next refresh reaps it.
      await Token.updateMany(
        { rotatedAt: { $ne: null } },
        { $set: { rotatedAt: new Date(Date.now() - 10 * 60 * 1000) } },
      );
    }

    // Only the live token should remain; the rotated ones were reaped.
    expect(await Token.countDocuments({ userId: user._id, rotatedAt: null })).toBe(1);
  });
});
