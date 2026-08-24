import { jest } from "@jest/globals";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import bcrypt from "bcryptjs";

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
  getStudentRecipients: jest.fn().mockResolvedValue({ studentUserId: null, studentName: "Student", parentIds: [] }),
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
  return `198.18.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
};

/** Create an admin and return a bearer token for them. */
const makeAdmin = async () => {
  await User.create({
    FullName: "Admin User",
    UserName: "admin_user",
    Email: "admin@example.com",
    password: "AdminPass123!",
    role: "admin",
  });

  const res = await request(app)
    .post("/api/v1/auth/login")
    .set("X-Forwarded-For", freshIp())
    .send({ email: "admin@example.com", password: "AdminPass123!" });

  expect(res.status).toBe(200);
  return res.body.data.token;
};

const makeStudent = () =>
  User.create({
    FullName: "Target Student",
    UserName: "target_student",
    Email: "target@example.com",
    password: "OriginalPass1!",
    role: "student",
  });

describe("PATCH /api/v1/user/:id — password handling", () => {
  it("stores the new password as a bcrypt hash, never as plaintext", async () => {
    const token = await makeAdmin();
    const student = await makeStudent();

    const res = await request(app)
      .patch(`/api/v1/user/${student._id}`)
      .set("Authorization", `Bearer ${token}`)
      .set("X-Forwarded-For", freshIp())
      .send({ password: "test@1234" });

    expect(res.status).toBe(200);

    const stored = await User.findById(student._id).select("+password");

    // The exact regression: findByIdAndUpdate skipped the pre("save") hook and
    // wrote the plaintext straight to MongoDB.
    expect(stored.password).not.toBe("test@1234");
    expect(stored.password).toMatch(/^\$2[aby]\$/);
    expect(await bcrypt.compare("test@1234", stored.password)).toBe(true);
  });

  it("lets the user log in with the password the admin set", async () => {
    const token = await makeAdmin();
    const student = await makeStudent();

    await request(app)
      .patch(`/api/v1/user/${student._id}`)
      .set("Authorization", `Bearer ${token}`)
      .set("X-Forwarded-For", freshIp())
      .send({ password: "test@1234" });

    const login = await request(app)
      .post("/api/v1/auth/login")
      .set("X-Forwarded-For", freshIp())
      .send({ email: "target@example.com", password: "test@1234" });

    expect(login.status).toBe(200);
  });

  it("revokes the target's existing sessions when the password changes", async () => {
    const token = await makeAdmin();
    const student = await makeStudent();

    await request(app)
      .post("/api/v1/auth/login")
      .set("X-Forwarded-For", freshIp())
      .send({ email: "target@example.com", password: "OriginalPass1!" });

    expect(await Token.countDocuments({ userId: student._id })).toBeGreaterThan(0);

    await request(app)
      .patch(`/api/v1/user/${student._id}`)
      .set("Authorization", `Bearer ${token}`)
      .set("X-Forwarded-For", freshIp())
      .send({ password: "test@1234" });

    expect(await Token.countDocuments({ userId: student._id })).toBe(0);
  });

  it("updates ordinary fields without touching the password", async () => {
    const token = await makeAdmin();
    const student = await makeStudent();
    const before = await User.findById(student._id).select("+password");

    const res = await request(app)
      .patch(`/api/v1/user/${student._id}`)
      .set("Authorization", `Bearer ${token}`)
      .set("X-Forwarded-For", freshIp())
      .send({ FullName: "Renamed Student" });

    expect(res.status).toBe(200);

    const after = await User.findById(student._id).select("+password");
    expect(after.FullName).toBe("Renamed Student");
    // No re-hash of an unchanged password: the stored hash must be identical,
    // otherwise every profile edit would silently invalidate the login.
    expect(after.password).toBe(before.password);
  });

  it("ignores fields an admin is not allowed to set through this route", async () => {
    const token = await makeAdmin();
    const student = await makeStudent();

    await request(app)
      .patch(`/api/v1/user/${student._id}`)
      .set("Authorization", `Bearer ${token}`)
      .set("X-Forwarded-For", freshIp())
      .send({ FullName: "Renamed Student", apiKeyHash: "attacker-controlled", passwordResetToken: "nope" });

    const after = await User.findById(student._id).select("+apiKeyHash +passwordResetToken");
    expect(after.apiKeyHash).toBeUndefined();
    expect(after.passwordResetToken).toBeUndefined();
  });

  it("never returns the password hash in the response", async () => {
    const token = await makeAdmin();
    const student = await makeStudent();

    const res = await request(app)
      .patch(`/api/v1/user/${student._id}`)
      .set("Authorization", `Bearer ${token}`)
      .set("X-Forwarded-For", freshIp())
      .send({ password: "test@1234" });

    expect(res.body.data.password).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain("test@1234");
  });
});
