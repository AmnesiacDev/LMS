import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import request from "supertest";

process.env.NODE_ENV = "test";
process.env.JWT_TOKEN_SECRET = "test-access-secret-at-least-32-chars";
process.env.JWT_REFRESH_TOKEN_SECRET = "test-refresh-secret-at-least-32-chars";
process.env.JWT_TOKEN_EXPIRES_IN = "1h";
process.env.JWT_REFRESH_EXPIRES_IN = "7d";
process.env.SALT_ROUNDS = "4";
process.env.CLIENT_URL = "http://localhost:5173";

const [{ default: app }, { default: User }, { default: AuditLog }] = await Promise.all([
  import("../App.js"),
  import("../Models/user.js"),
  import("../Models/AuditLog.js"),
]);

let mongod;
let actorSequence = 0;

const createActor = async (role) => {
  actorSequence += 1;
  const _id = new mongoose.Types.ObjectId();

  await User.collection.insertOne({
    _id,
    FullName: `${role} Actor`,
    UserName: `${role}_actor_${actorSequence}`,
    Email: `${role}.${actorSequence}@example.com`,
    password: "not-used-by-this-test",
    role,
    isActive: true,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const token = jwt.sign({ id: _id.toString(), role }, process.env.JWT_TOKEN_SECRET, {
    expiresIn: "1h",
  });

  return { _id, token };
};

const auth = (testRequest, actor) => testRequest.set("Authorization", `Bearer ${actor.token}`);

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const collection of Object.values(collections)) {
    await collection.deleteMany({});
  }
});

describe("Global Audit Logging Middleware", () => {
  it("logs a successful POST request by an admin", async () => {
    const admin = await createActor("admin");
    const newUserPayload = {
      FullName: "Created User",
      UserName: "created_user",
      Email: "created@example.com",
      password: "TestPassword123!",
      role: "student",
      isActive: true,
    };

    const response = await auth(request(app).post("/api/v1/user").send(newUserPayload), admin);
    expect(response.status).toBe(201);

    // Give asynchronous event loop/finish event a tiny tick to execute db insertion
    await new Promise((resolve) => setTimeout(resolve, 100));

    const logs = await AuditLog.find({}).lean();
    expect(logs.length).toBe(1);
    expect(logs[0].actor.toString()).toBe(admin._id.toString());
    expect(logs[0].actorRole).toBe("admin");
    expect(logs[0].action).toBe("create_user");
    expect(logs[0].targetModel).toBe("User");
    expect(logs[0].meta.path).toBe("/api/v1/user");
    expect(logs[0].meta.body.FullName).toBe("Created User");
    expect(logs[0].meta.body.password).toBe("[REDACTED]"); // should redact password!
  });

  it("does not log GET requests", async () => {
    const admin = await createActor("admin");
    const response = await auth(request(app).get("/api/v1/user"), admin);
    expect(response.status).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 50));

    const logs = await AuditLog.find({}).lean();
    expect(logs.length).toBe(0);
  });

  it("does not log failed requests (e.g. invalid permissions/validation error)", async () => {
    const student = await createActor("student");
    // student is not allowed to POST to /api/v1/user
    const response = await auth(request(app).post("/api/v1/user").send({}), student);
    expect(response.status).toBe(403);

    await new Promise((resolve) => setTimeout(resolve, 50));

    const logs = await AuditLog.find({}).lean();
    expect(logs.length).toBe(0);
  });
});
