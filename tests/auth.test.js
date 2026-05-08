import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import app from "../App.js";

// ─── Setup / Teardown ─────────────────────────────────────────────────────────
let mongod;

beforeAll(async () => {
  process.env.NODE_ENV           = "test";
  process.env.JWT_TOKEN_SECRET   = "test-secret-32-characters-long!!";
  process.env.JWT_REFRESH_TOKEN_SECRET = "test-refresh-secret-32-characters!";
  process.env.JWT_TOKEN_EXPIRES_IN     = "120";
  process.env.JWT_REFRESH_EXPIRES_IN   = "7";
  process.env.SALT_ROUNDS        = "4"; // low rounds so tests are fast
  process.env.CLIENT_URL         = "http://localhost:5173";

  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
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

const signup = (body = validUser) =>
  request(app).post("/api/v1/auth/signup").send(body);

const login = (body = { email: validUser.Email, password: validUser.password }) =>
  request(app).post("/api/v1/auth/login").send(body);

// ─── Sign Up ──────────────────────────────────────────────────────────────────
describe("POST /api/v1/auth/signup", () => {
  it("creates a new user and returns 201", async () => {
    const res = await signup();
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("success");
    expect(res.body.data.user).toBeDefined();
    expect(res.body.data.user.password).toBeUndefined(); // never expose password
  });

  it("rejects duplicate email with 400/500", async () => {
    await signup();
    const res = await signup();
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("rejects missing required fields", async () => {
    const res = await signup({ Email: "bad@example.com" });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

// ─── Login ────────────────────────────────────────────────────────────────────
describe("POST /api/v1/auth/login", () => {
  beforeEach(async () => { await signup(); });

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
    const res = await request(app).post("/api/v1/auth/login").send({ email: validUser.Email });
    expect(res.status).toBe(400);
  });
});

// ─── Logout ───────────────────────────────────────────────────────────────────
describe("GET /api/v1/auth/logout", () => {
  it("logs out and clears cookies", async () => {
    await signup();
    const loginRes = await login();
    const cookies = loginRes.headers["set-cookie"];

    const res = await request(app)
      .get("/api/v1/auth/logout")
      .set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
  });
});

// ─── Refresh Token ────────────────────────────────────────────────────────────
describe("POST /api/v1/auth/refresh", () => {
  it("issues a new access token from a valid refresh token cookie", async () => {
    await signup();
    const loginRes = await login();
    const cookies = loginRes.headers["set-cookie"];

    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", cookies);

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
    const exists  = await request(app).post("/api/v1/auth/forgot-password").send({ email: validUser.Email });
    const missing = await request(app).post("/api/v1/auth/forgot-password").send({ email: "ghost@example.com" });

    expect(exists.status).toBe(200);
    expect(missing.status).toBe(200);
    expect(exists.body.message).toBe(missing.body.message);
  });
});

describe("POST /api/v1/auth/reset-password/:token", () => {
  it("rejects an invalid or expired token with 400", async () => {
    const res = await request(app)
      .post("/api/v1/auth/reset-password/invalidtoken123")
      .send({ password: "NewPass123!" });
    expect(res.status).toBe(400);
  });
});
