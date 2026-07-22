import { jest } from "@jest/globals";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import request from "supertest";

jest.setTimeout(30_000);

Object.assign(process.env, {
  NODE_ENV: "test",
  JWT_TOKEN_SECRET: "test-access-secret-at-least-32-chars",
  JWT_REFRESH_TOKEN_SECRET: "test-refresh-secret-at-least-32-chars",
  JWT_TOKEN_EXPIRES_IN: "1h",
  JWT_REFRESH_EXPIRES_IN: "7d",
  SALT_ROUNDS: "4",
  CLIENT_URL: "http://localhost:5173",
  LOG_TO_DISK: "false",
  SCHEDULER_ENABLED: "false",
});

// Import sequentially because App.js already loads these models/services. Jest's
// ESM linker can otherwise try to link the same module concurrently when the
// entire test suite runs in one process.
const { default: app } = await import("../App.js");
const { default: User } = await import("../Models/user.js");
const { default: StudentProfile } = await import("../Models/studentProfile.js");
const { default: Notification } = await import("../Models/Notification.js");
const { linkChildToParentService, createStudentProfileService } = await import("../Services/studentProfileServices.js");

let mongod;
let actorSequence = 0;

const createActor = async (role) => {
  actorSequence += 1;
  const actor = {
    _id: new mongoose.Types.ObjectId(),
    FullName: `${role} Actor`,
    UserName: `${role}_actor_${actorSequence}`,
    Email: `${role}.${actorSequence}@example.com`,
    password: "not-used-by-this-test",
    role,
    isActive: true,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await User.collection.insertOne(actor);
  actor.token = jwt.sign({ id: actor._id.toString(), role }, process.env.JWT_TOKEN_SECRET, {
    expiresIn: "1h",
  });

  return actor;
};

const auth = (testRequest, actor) => testRequest.set("Authorization", `Bearer ${actor.token}`);
const linkChild = (parent, childIdentifier) => auth(request(app).post("/api/v1/studentprofile/link-child").send({ childIdentifier }), parent);
const referenceId = (reference) => (reference?._id || reference)?.toString();

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await StudentProfile.syncIndexes();
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  // Audit logging runs from the response finish event. Give it a tick before
  // clearing collections so it cannot race the next test's teardown.
  await new Promise((resolve) => setTimeout(resolve, 25));
  for (const collection of Object.values(mongoose.connection.collections)) {
    await collection.deleteMany({});
  }
});

describe("parent-student linking", () => {
  it("stores one pending request and rejects a sequential duplicate", async () => {
    const parent = await createActor("parent");
    const student = await createActor("student");

    const firstResponse = await linkChild(parent, student.Email);
    const duplicateResponse = await linkChild(parent, student.Email);

    expect(firstResponse.status).toBe(200);
    expect(duplicateResponse.status).toBe(409);

    const profile = await StudentProfile.findOne({ user: student._id });
    expect(profile.pendingParentRequests).toHaveLength(1);
    expect(referenceId(profile.pendingParentRequests[0])).toBe(parent._id.toString());
    expect(profile.parents).toHaveLength(0);
    expect(await Notification.countDocuments({ title: "Parent Link Request", type: "system_alert" })).toBe(1);
  });

  it("allows only one of two concurrent duplicate requests to succeed", async () => {
    const parent = await createActor("parent");
    const student = await createActor("student");

    const responses = await Promise.all([linkChild(parent, student.Email), linkChild(parent, student.Email)]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const profile = await StudentProfile.findOne({ user: student._id });
    expect(profile.pendingParentRequests).toHaveLength(1);
    expect(await Notification.countDocuments({ title: "Parent Link Request" })).toBe(1);
  });

  it("accepts a request atomically and rejects repeated acceptance or relinking", async () => {
    const parent = await createActor("parent");
    const student = await createActor("student");
    await linkChild(parent, student.Email);

    const acceptUrl = `/api/v1/studentprofile/me/parent-requests/${parent._id}/accept`;
    const acceptedResponse = await auth(request(app).post(acceptUrl), student);
    const repeatedAcceptResponse = await auth(request(app).post(acceptUrl), student);
    const repeatedLinkResponse = await linkChild(parent, student.Email);

    expect(acceptedResponse.status).toBe(200);
    expect(repeatedAcceptResponse.status).toBe(404);
    expect(repeatedLinkResponse.status).toBe(409);

    const profile = await StudentProfile.findOne({ user: student._id });
    expect(profile.pendingParentRequests).toHaveLength(0);
    expect(profile.parents).toHaveLength(1);
    expect(referenceId(profile.parents[0])).toBe(parent._id.toString());
    expect(await Notification.countDocuments({ title: "Link Request Accepted" })).toBe(1);
  });

  it("blocks admins at both the parent request route and service boundary", async () => {
    const admin = await createActor("admin");
    const student = await createActor("student");

    const routeResponse = await linkChild(admin, student.Email);

    expect(routeResponse.status).toBe(403);
    await expect(linkChildToParentService(student.Email, admin)).rejects.toMatchObject({ statusCode: 403 });
    expect(await StudentProfile.countDocuments({ user: student._id })).toBe(0);
  });

  it("prevents parents from bypassing approval through profile creation", async () => {
    const parent = await createActor("parent");
    const student = await createActor("student");

    const routeResponse = await auth(request(app).post(`/api/v1/studentprofile/${student._id}`).send({ grade: "Grade 8" }), parent);

    expect(routeResponse.status).toBe(403);
    await expect(createStudentProfileService(student._id, { grade: "Grade 8" }, parent)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(await StudentProfile.countDocuments({ user: student._id })).toBe(0);
  });

  it("does not accept a stale request whose requester is not a parent", async () => {
    const admin = await createActor("admin");
    const student = await createActor("student");
    await StudentProfile.create({ user: student._id, pendingParentRequests: [admin._id] });

    const response = await auth(request(app).post(`/api/v1/studentprofile/me/parent-requests/${admin._id}/accept`), student);

    expect(response.status).toBe(404);
    const profile = await StudentProfile.findOne({ user: student._id });
    expect(profile.parents).toHaveLength(0);
    expect(profile.pendingParentRequests).toHaveLength(1);
  });

  it("deduplicates bulk identifiers case-insensitively", async () => {
    const parent = await createActor("parent");
    const student = await createActor("student");

    const response = await auth(
      request(app)
        .post("/api/v1/studentprofile/link-children-bulk")
        .send({ childIdentifiers: [student.Email.toUpperCase(), student.Email] }),
      parent,
    );

    expect(response.status).toBe(200);
    expect(response.body.data.totalLinked).toBe(1);
    expect(response.body.data.totalFailed).toBe(0);
    expect(await Notification.countDocuments({ title: "Parent Link Request" })).toBe(1);
  });
});
