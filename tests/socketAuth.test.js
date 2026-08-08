import { jest } from "@jest/globals";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

jest.setTimeout(30_000);

Object.assign(process.env, {
  NODE_ENV: "test",
  JWT_TOKEN_SECRET: "test-secret-32-characters-long!!",
  JWT_REFRESH_TOKEN_SECRET: "test-refresh-secret-32-characters!",
  JWT_TOKEN_EXPIRES_IN: "2h",
  JWT_REFRESH_EXPIRES_IN: "7d",
  SALT_ROUNDS: "4",
  CLIENT_URL: "http://localhost:5173",
});

let mongod;
let authenticateSocket;
let User;

beforeAll(async () => {
  ({ authenticateSocket } = await import("../Utilities/SocketManager.js"));
  ({ default: User } = await import("../Models/user.js"));
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
const makeUser = (overrides = {}) =>
  User.create({
    FullName: "Socket User",
    UserName: `socket_user_${Math.random().toString(36).slice(2, 10)}`,
    Email: `socket.${Math.random().toString(36).slice(2, 10)}@example.com`,
    password: "Password123!",
    role: "student",
    isActive: true,
    approvalStatus: "approved",
    emailVerified: true,
    ...overrides,
  });

const tokenFor = (user, overrides = {}) =>
  jwt.sign({ id: user._id, role: user.role, ...overrides }, process.env.JWT_TOKEN_SECRET, {
    expiresIn: "2h",
  });

// A stub standing in for the real Socket.IO socket. Only the handshake and the
// fields the middleware assigns matter here.
const stubSocket = (token) => ({
  handshake: token === undefined ? {} : { auth: { token } },
});

const run = async (socket) => {
  let called = false;
  let error = null;
  await authenticateSocket(socket, (err) => {
    called = true;
    error = err ?? null;
  });
  return { called, error };
};

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("Socket handshake authentication", () => {
  it("rejects a handshake with no token", async () => {
    const { error } = await run(stubSocket(undefined));
    expect(error?.message).toBe("Authentication required");
  });

  it("rejects a token signed with the wrong secret", async () => {
    const user = await makeUser();
    const forged = jwt.sign({ id: user._id, role: "admin" }, "not-the-real-secret", { expiresIn: "2h" });

    const { error } = await run(stubSocket(forged));
    expect(error?.message).toBe("Invalid token");
  });

  it("rejects an expired token", async () => {
    const user = await makeUser();
    const expired = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_TOKEN_SECRET, {
      expiresIn: "-1s",
    });

    const { error } = await run(stubSocket(expired));
    expect(error?.message).toBe("Invalid token");
  });

  it("accepts an active, approved user", async () => {
    const user = await makeUser();
    const socket = stubSocket(tokenFor(user));

    const { error } = await run(socket);

    expect(error).toBeNull();
    expect(socket.userId).toBe(user._id.toString());
    expect(socket.userRole).toBe("student");
    expect(typeof socket.tokenExpiresAt).toBe("number");
  });

  it("rejects a deactivated user holding a still-valid token", async () => {
    const user = await makeUser();
    const token = tokenFor(user);

    // Admin deactivates the account after the token was issued.
    await User.updateOne({ _id: user._id }, { isActive: false });

    const { error } = await run(stubSocket(token));
    expect(error?.message).toBe("Account is not active");
  });

  it("rejects a student still awaiting admin approval", async () => {
    const user = await makeUser({ approvalStatus: "pending" });

    const { error } = await run(stubSocket(tokenFor(user)));
    expect(error?.message).toBe("Account is not active");
  });

  it("rejects a token whose user no longer exists", async () => {
    const user = await makeUser();
    const token = tokenFor(user);
    await User.deleteOne({ _id: user._id });

    const { error } = await run(stubSocket(token));
    expect(error?.message).toBe("Account is not active");
  });

  it("takes the role from the database, not the token claim", async () => {
    const user = await makeUser({ role: "student" });
    // A token that claims admin — either forged after a role downgrade, or
    // simply stale. The database is the authority.
    const socket = stubSocket(tokenFor(user, { role: "admin" }));

    const { error } = await run(socket);

    expect(error).toBeNull();
    expect(socket.userRole).toBe("student");
  });
});
