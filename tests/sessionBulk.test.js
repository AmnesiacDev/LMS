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

const [{ default: app }, { default: User }, { default: StudentProfile }, { default: Session }] = await Promise.all([
  import("../App.js"),
  import("../Models/user.js"),
  import("../Models/studentProfile.js"),
  import("../Models/Session.js"),
]);

let mongod;
let actorSequence = 0;

const createActor = async (role) => {
  actorSequence += 1;
  const _id = new mongoose.Types.ObjectId();

  await User.collection.insertOne({
    _id,
    FullName: `${role} User ${actorSequence}`,
    UserName: `${role}_${actorSequence}`,
    Email: `${role}.${actorSequence}@example.com`,
    password: "password123",
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

const createStudentWithProfile = async () => {
  const studentUser = await createActor("student");
  const profile = await StudentProfile.create({
    user: studentUser._id,
    grade: "Grade 6",
  });
  return { ...studentUser, profileId: profile._id };
};

const auth = (req, actor) => req.set("Authorization", `Bearer ${actor.token}`);

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

describe("POST /api/v1/session/bulk", () => {
  test("allows instructor to create sessions for multiple students at once", async () => {
    const instructor = await createActor("instructor");
    const s1 = await createStudentWithProfile();
    const s2 = await createStudentWithProfile();

    const futureDate = new Date(Date.now() + 86400000).toISOString();

    const res = await auth(
      request(app).post("/api/v1/session/bulk").send({
        title: "Bulk Cohort Workshop",
        description: "Group session on advanced JS",
        studentProfileIds: [s1.profileId.toString(), s2.profileId.toString()],
        date: futureDate,
      }),
      instructor,
    );

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("success");
    expect(res.body.results).toBe(2);
    expect(res.body.data.sessions.length).toBe(2);

    const savedSessions = await Session.find({ title: "Bulk Cohort Workshop" });
    expect(savedSessions.length).toBe(2);
  });

  test("rejects bulk session creation if studentProfileIds array is empty", async () => {
    const instructor = await createActor("instructor");
    const futureDate = new Date(Date.now() + 86400000).toISOString();

    const res = await auth(
      request(app).post("/api/v1/session/bulk").send({
        title: "Invalid Bulk Session",
        description: "No students",
        studentProfileIds: [],
        date: futureDate,
      }),
      instructor,
    );

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/studentProfileIds array is required/i);
  });

  test("denies student role from creating bulk sessions", async () => {
    const student = await createStudentWithProfile();
    const futureDate = new Date(Date.now() + 86400000).toISOString();

    const res = await auth(
      request(app).post("/api/v1/session/bulk").send({
        title: "Student Attempt",
        description: "Not allowed",
        studentProfileIds: [student.profileId.toString()],
        date: futureDate,
      }),
      student,
    );

    expect(res.status).toBe(403);
  });
});
