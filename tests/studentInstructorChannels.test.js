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

const { default: app } = await import("../App.js");
const { default: User } = await import("../Models/user.js");
const { default: StudentProfile } = await import("../Models/studentProfile.js");
const { default: Session } = await import("../Models/Session.js");

let mongod;
let actorSequence = 0;

const createActor = async (role) => {
  actorSequence += 1;
  const actor = {
    _id: new mongoose.Types.ObjectId(),
    FullName: `${role} Actor`,
    UserName: `${role}_channel_${actorSequence}`,
    Email: `${role}.channel.${actorSequence}@example.com`,
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

const assignInstructor = (admin, student, instructor) =>
  auth(request(app).post("/api/v1/StudentProfile/admin/link-instructor"), admin).send({
    studentUserId: student._id.toString(),
    instructorUserId: instructor._id.toString(),
  });

const createSession = (instructor, profile) =>
  auth(request(app).post("/api/v1/session"), instructor).send({
    title: "Assignment check session",
    description: "Verifies instructor assignment authorization",
    studentProfileId: profile._id.toString(),
    instructorId: instructor._id.toString(),
    date: new Date(Date.now() + 86_400_000).toISOString(),
  });

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
  await new Promise((resolve) => setTimeout(resolve, 25));
  for (const collection of Object.values(mongoose.connection.collections)) {
    await collection.deleteMany({});
  }
});

describe("student instructor assignments and learning-team channels", () => {
  it("shows an admin-assigned student before any session exists", async () => {
    const [admin, instructor, student] = await Promise.all([createActor("admin"), createActor("instructor"), createActor("student")]);
    const profile = await StudentProfile.create({ user: student._id, grade: "Grade 9" });

    await assignInstructor(admin, student, instructor).expect(200);

    const response = await auth(request(app).get("/api/v1/session/me/students"), instructor).expect(200);
    expect(response.body.data.students.map((item) => item._id)).toContain(profile._id.toString());
  });

  it("rejects a duplicate active instructor assignment without creating another channel", async () => {
    const [admin, instructor, student] = await Promise.all([createActor("admin"), createActor("instructor"), createActor("student")]);
    await StudentProfile.create({ user: student._id });

    await assignInstructor(admin, student, instructor).expect(200);
    await assignInstructor(admin, student, instructor).expect(409);

    const response = await auth(request(app).get("/api/v1/channels"), instructor).expect(200);
    expect(response.body.data.channels).toHaveLength(1);
  });

  it("rejects session creation for an unassigned instructor", async () => {
    const [instructor, student] = await Promise.all([createActor("instructor"), createActor("student")]);
    const profile = await StudentProfile.create({ user: student._id });

    await createSession(instructor, profile).expect(403);
  });

  it("rejects task creation from an old session when the instructor is not assigned", async () => {
    const [instructor, student] = await Promise.all([createActor("instructor"), createActor("student")]);
    const profile = await StudentProfile.create({ user: student._id });
    const oldSession = await Session.create({
      title: "Historical session",
      description: "Created before explicit assignments were introduced",
      studentProfileId: profile._id,
      instructorId: instructor._id,
      date: new Date(Date.now() + 86_400_000),
    });

    await auth(request(app).post("/api/v1/task"), instructor)
      .send({
        title: "Unauthorized task",
        description: "This old session must not grant current access",
        sessionId: oldSession._id.toString(),
        studentProfileId: profile._id.toString(),
        instructorId: instructor._id.toString(),
      })
      .expect(403);
  });

  it("creates a private learning-team channel for the assigned instructor, student, and parent", async () => {
    const [admin, instructor, student, parent] = await Promise.all([createActor("admin"), createActor("instructor"), createActor("student"), createActor("parent")]);
    await StudentProfile.create({ user: student._id, parents: [parent._id] });

    await assignInstructor(admin, student, instructor).expect(200);

    for (const member of [instructor, student, parent]) {
      const response = await auth(request(app).get("/api/v1/channels"), member).expect(200);
      expect(response.body.data.channels).toHaveLength(1);
      expect(response.body.data.channels[0].type).toBe("learning_team");
    }
  });

  it("adds a parent to an existing learning-team channel when linked later", async () => {
    const [admin, instructor, student, parent] = await Promise.all([createActor("admin"), createActor("instructor"), createActor("student"), createActor("parent")]);
    await StudentProfile.create({ user: student._id });
    await assignInstructor(admin, student, instructor).expect(200);

    const before = await auth(request(app).get("/api/v1/channels"), parent).expect(200);
    expect(before.body.data.channels).toHaveLength(0);

    await auth(request(app).post("/api/v1/StudentProfile/admin/link-parent"), admin)
      .send({
        studentUserId: student._id.toString(),
        parentUserId: parent._id.toString(),
      })
      .expect(200);

    const after = await auth(request(app).get("/api/v1/channels"), parent).expect(200);
    expect(after.body.data.channels).toHaveLength(1);
  });

  it("allows channel members to message while rejecting outsiders", async () => {
    const [admin, instructor, student, parent, outsider] = await Promise.all([createActor("admin"), createActor("instructor"), createActor("student"), createActor("parent"), createActor("parent")]);
    await StudentProfile.create({ user: student._id, parents: [parent._id] });
    await assignInstructor(admin, student, instructor).expect(200);

    const channelResponse = await auth(request(app).get("/api/v1/channels"), instructor).expect(200);
    const channelId = channelResponse.body.data.channels[0]._id;

    await auth(request(app).post(`/api/v1/channels/${channelId}/messages`), parent)
      .send({ content: "How is the student progressing?" })
      .expect(201);

    await auth(request(app).post(`/api/v1/channels/${channelId}/messages`), outsider)
      .send({ content: "I should not be able to post here." })
      .expect(404);
  });

  it("allows related direct messages and rejects unrelated receiver IDs", async () => {
    const [admin, instructor, student, parent, outsider] = await Promise.all([createActor("admin"), createActor("instructor"), createActor("student"), createActor("parent"), createActor("parent")]);
    await StudentProfile.create({ user: student._id, parents: [parent._id] });
    await assignInstructor(admin, student, instructor).expect(200);

    await auth(request(app).post("/api/v1/messages"), instructor).send({ receiverId: parent._id.toString(), content: "A legitimate progress update." }).expect(201);

    await auth(request(app).post("/api/v1/messages"), instructor).send({ receiverId: outsider._id.toString(), content: "This relationship does not exist." }).expect(403);
  });

  it("revokes active access when the admin unassigns the instructor", async () => {
    const [admin, instructor, student] = await Promise.all([createActor("admin"), createActor("instructor"), createActor("student")]);
    const profile = await StudentProfile.create({ user: student._id });
    await assignInstructor(admin, student, instructor).expect(200);

    await auth(request(app).post("/api/v1/StudentProfile/admin/unlink-instructor"), admin)
      .send({
        studentUserId: student._id.toString(),
        instructorUserId: instructor._id.toString(),
      })
      .expect(200);

    const studentsResponse = await auth(request(app).get("/api/v1/session/me/students"), instructor).expect(200);
    expect(studentsResponse.body.data.students).toHaveLength(0);

    await createSession(instructor, profile).expect(403);
    const channelsResponse = await auth(request(app).get("/api/v1/channels"), instructor).expect(200);
    expect(channelsResponse.body.data.channels).toHaveLength(0);
  });
});
