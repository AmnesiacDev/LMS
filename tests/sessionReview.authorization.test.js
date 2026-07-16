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

const [{ default: app }, { default: User }, { default: StudentProfile }, { default: SessionReview }] = await Promise.all([import("../App.js"), import("../Models/user.js"), import("../Models/studentProfile.js"), import("../Models/SessionReview.js")]);

let mongod;
let actorSequence = 0;

const createActor = async (role) => {
  actorSequence += 1;
  const _id = new mongoose.Types.ObjectId();

  await User.collection.insertOne({
    _id,
    FullName: `${role} Reviewer`,
    UserName: `${role}_reviewer_${actorSequence}`,
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

const getWithActor = (path, actor) => auth(request(app).get(path), actor);

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

describe("session-review collection authorization", () => {
  it.each(["student", "parent"])("denies %s access to the global review collection", async (role) => {
    const actor = await createActor(role);

    const response = await getWithActor("/api/v1/sessionReview", actor);

    expect(response.status).toBe(403);
  });

  it.each(["student", "parent"])("denies %s access to reviews for an arbitrary session", async (role) => {
    const actor = await createActor(role);
    const sessionId = new mongoose.Types.ObjectId();

    const response = await getWithActor(`/api/v1/sessionReview/session/${sessionId}`, actor);

    expect(response.status).toBe(403);
  });

  it.each(["instructor", "admin"])("allows %s access to the staff review collection", async (role) => {
    const actor = await createActor(role);

    const response = await getWithActor("/api/v1/sessionReview", actor);

    expect(response.status).toBe(200);
    expect(response.body.data.docs).toEqual([]);
  });

  it("does not let query filters override an instructor's review scope", async () => {
    const [instructorA, instructorB, student] = await Promise.all([createActor("instructor"), createActor("instructor"), createActor("student")]);
    const profile = await StudentProfile.create({ user: student._id, grade: "Grade 6" });

    await SessionReview.collection.insertMany([
      {
        session: new mongoose.Types.ObjectId(),
        studentProfileId: profile._id,
        Instructor: instructorA._id,
        Behavior: 4,
        underStanding: 4,
        participation: 4,
        coding: 4,
        overAllRating: 4,
      },
      {
        session: new mongoose.Types.ObjectId(),
        studentProfileId: profile._id,
        Instructor: instructorB._id,
        Behavior: 5,
        underStanding: 5,
        participation: 5,
        coding: 5,
        overAllRating: 5,
      },
    ]);

    const response = await auth(request(app).get("/api/v1/sessionReview").query({ Instructor: instructorB._id.toString() }), instructorA);

    expect(response.status).toBe(200);
    expect(response.body.data.docs).toEqual([]);
  });

  it("preserves the student's scoped /me endpoint", async () => {
    const student = await createActor("student");
    await StudentProfile.create({ user: student._id, grade: "Grade 6" });

    const response = await getWithActor("/api/v1/sessionReview/me", student);

    expect(response.status).toBe(200);
    expect(response.body.data.docs).toEqual([]);
  });

  it("preserves the parent's scoped /me endpoint", async () => {
    const parent = await createActor("parent");

    const response = await getWithActor("/api/v1/sessionReview/me", parent);

    expect(response.status).toBe(200);
    expect(response.body.data.docs).toEqual([]);
  });
});
