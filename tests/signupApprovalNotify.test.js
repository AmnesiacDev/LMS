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

// NotificationHelpers is deliberately NOT mocked here — this suite exists to
// prove the real signup -> notify-admins -> Notification document path works.
const emitToUser = jest.fn();
jest.unstable_mockModule("../Utilities/SocketManager.js", () => ({
  emitToUser,
  emitToAll: jest.fn(),
  getIo: jest.fn(),
  initSocket: jest.fn(),
  authenticateSocket: jest.fn(),
}));

let mongod;
let app;
let User;
let Notification;

beforeAll(async () => {
  ({ default: app } = await import("../App.js"));
  ({ default: User } = await import("../Models/user.js"));
  ({ default: Notification } = await import("../Models/Notification.js"));
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

let ipCounter = 0;
const freshIp = () => {
  ipCounter += 1;
  return `192.0.2.${(ipCounter % 250) + 1}`;
};

const signup = (n, role) =>
  request(app)
    .post("/api/v1/auth/signup")
    .set("X-Forwarded-For", freshIp())
    .send({
      FullName: "New Person",
      UserName: `new_person_${n}`,
      Email: `new.person.${n}@example.com`,
      password: "Password123!",
      role,
    });

/** notifyAdmins is fire-and-forget, so give its promise chain a tick to land. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 50));

describe("signup notifies admins that an account needs approval", () => {
  it("writes a new_user notification for every admin when a student signs up", async () => {
    await User.create([
      { FullName: "Admin One", UserName: "admin_one", Email: "a1@example.com", password: "AdminPass1!", role: "admin" },
      { FullName: "Admin Two", UserName: "admin_two", Email: "a2@example.com", password: "AdminPass2!", role: "admin" },
    ]);

    const res = await signup("student1", "student");
    expect(res.status).toBe(201);
    expect(res.body.data.requiresApproval).toBe(true);

    await flush();

    const notifs = await Notification.find({ type: "new_user" });
    expect(notifs).toHaveLength(2);
    expect(notifs[0].title).toContain("student");
  });

  it("does the same for a parent signup", async () => {
    await User.create({ FullName: "Admin One", UserName: "admin_one", Email: "a1@example.com", password: "AdminPass1!", role: "admin" });

    expect((await signup("parent1", "parent")).status).toBe(201);
    await flush();

    const notifs = await Notification.find({ type: "new_user" });
    expect(notifs).toHaveLength(1);
    expect(notifs[0].title).toContain("parent");
  });

  it("pushes the notification over the socket so an online admin sees it live", async () => {
    const admin = await User.create({ FullName: "Admin One", UserName: "admin_one", Email: "a1@example.com", password: "AdminPass1!", role: "admin" });

    await signup("student2", "student");
    await flush();

    expect(emitToUser).toHaveBeenCalledWith(admin._id.toString(), "notification", expect.objectContaining({ type: "new_user" }));
  });

  it("leaves the new account pending and blocks its login until approved", async () => {
    await User.create({ FullName: "Admin One", UserName: "admin_one", Email: "a1@example.com", password: "AdminPass1!", role: "admin" });

    await signup("student3", "student");
    await flush();

    const created = await User.findOne({ Email: "new.person.student3@example.com" });
    expect(created.approvalStatus).toBe("pending");

    const login = await request(app)
      .post("/api/v1/auth/login")
      .set("X-Forwarded-For", freshIp())
      .send({ email: "new.person.student3@example.com", password: "Password123!" });

    expect(login.status).toBe(403);
    expect(login.body.message).toMatch(/waiting for admin approval/i);
  });

  it("surfaces the pending account to the admin approvals endpoint", async () => {
    await User.create({ FullName: "Admin One", UserName: "admin_one", Email: "a1@example.com", password: "AdminPass1!", role: "admin" });
    await signup("student4", "student");

    const adminLogin = await request(app)
      .post("/api/v1/auth/login")
      .set("X-Forwarded-For", freshIp())
      .send({ email: "a1@example.com", password: "AdminPass1!" });

    const pending = await request(app)
      .get("/api/v1/user/pending-approvals")
      .set("Authorization", `Bearer ${adminLogin.body.data.token}`)
      .set("X-Forwarded-For", freshIp());

    expect(pending.status).toBe(200);
    expect(pending.body.data.users).toHaveLength(1);
    expect(pending.body.data.users[0].Email).toBe("new.person.student4@example.com");
  });
});
