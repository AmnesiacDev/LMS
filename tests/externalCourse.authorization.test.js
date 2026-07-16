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

const [{ default: app }, { default: User }, { default: StudentProfile }, { default: ExternalCourse }, { updateExternalCourseService }] = await Promise.all([
  import("../App.js"),
  import("../Models/user.js"),
  import("../Models/studentProfile.js"),
  import("../Models/externalCourse.js"),
  import("../Services/ExternalCourseService.js"),
]);

let mongod;
let actorSequence = 0;

const createActor = async (role) => {
  actorSequence += 1;
  const _id = new mongoose.Types.ObjectId();

  await User.collection.insertOne({
    _id,
    FullName: `${role} Course User`,
    UserName: `${role}_course_user_${actorSequence}`,
    Email: `${role}.course.${actorSequence}@example.com`,
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

  return { _id, token, role };
};

const createStudentProfile = async (student, parents = []) => {
  const _id = new mongoose.Types.ObjectId();
  await StudentProfile.collection.insertOne({
    _id,
    user: student._id,
    parents: parents.map((parent) => parent._id),
    grade: "Grade 6",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { _id };
};

const createCourse = async (studentProfile, createdBy) => {
  const _id = new mongoose.Types.ObjectId();
  await ExternalCourse.collection.insertOne({
    _id,
    teacher: "Course Teacher",
    subject: "Mathematics",
    createdBy: createdBy._id,
    studentProfileId: studentProfile._id,
    color: "#123456",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { _id };
};

const auth = (testRequest, actor) => testRequest.set("Authorization", `Bearer ${actor.token}`);

const createTwoFamilies = async () => {
  const [parentA, parentB, studentA, studentB] = await Promise.all([createActor("parent"), createActor("parent"), createActor("student"), createActor("student")]);
  const [profileA, profileB] = await Promise.all([createStudentProfile(studentA, [parentA]), createStudentProfile(studentB, [parentB])]);
  const courseA = await createCourse(profileA, parentA);

  return { parentA, parentB, studentA, profileA, profileB, courseA };
};

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  for (const collection of Object.values(mongoose.connection.collections)) {
    await collection.deleteMany({});
  }
});

describe("external-course parent ownership authorization", () => {
  it("denies a parent access to the staff-wide collection", async () => {
    const { parentA } = await createTwoFamilies();

    const response = await auth(request(app).get("/api/v1/external-course"), parentA);

    expect(response.status).toBe(403);
  });

  it("denies a parent access to another family's course by id", async () => {
    const { parentB, courseA } = await createTwoFamilies();

    const response = await auth(request(app).get(`/api/v1/external-course/${courseA._id}`), parentB);

    expect(response.status).toBe(403);
  });

  it("denies creating a course for another parent's child", async () => {
    const { parentB, profileA } = await createTwoFamilies();

    const response = await auth(request(app).post("/api/v1/external-course"), parentB).send({
      subject: "Physics",
      studentProfileId: profileA._id.toString(),
    });

    expect(response.status).toBe(403);
  });

  it("denies the studentId alias when it identifies another parent's child", async () => {
    const { parentB, studentA } = await createTwoFamilies();

    const response = await auth(request(app).post("/api/v1/external-course"), parentB).send({
      subject: "Physics",
      studentId: studentA._id.toString(),
    });

    expect(response.status).toBe(403);
  });

  it("denies updating another family's course", async () => {
    const { parentB, courseA } = await createTwoFamilies();

    const response = await auth(request(app).patch(`/api/v1/external-course/${courseA._id}`), parentB).send({ subject: "Changed Subject" });

    expect(response.status).toBe(403);
  });

  it("denies moving an owned course to another parent's child", async () => {
    const { parentA, profileB, courseA } = await createTwoFamilies();

    const response = await auth(request(app).patch(`/api/v1/external-course/${courseA._id}`), parentA).send({ studentProfileId: profileB._id.toString() });

    expect(response.status).toBe(403);
    const unchangedCourse = await ExternalCourse.findById(courseA._id);
    expect(unchangedCourse.studentProfileId.toString()).not.toBe(profileB._id.toString());
  });

  it("rejects Mongo update operators at the service boundary", async () => {
    const { parentA, profileB, courseA } = await createTwoFamilies();

    await expect(
      updateExternalCourseService(parentA, courseA._id, {
        $set: { studentProfileId: profileB._id },
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    const unchangedCourse = await ExternalCourse.findById(courseA._id);
    expect(unchangedCourse.studentProfileId.toString()).not.toBe(profileB._id.toString());
  });

  it("rejects dotted update keys through the HTTP boundary", async () => {
    const { parentA, profileB, courseA } = await createTwoFamilies();

    const response = await auth(request(app).patch(`/api/v1/external-course/${courseA._id}`), parentA).send({ "studentProfileId.value": profileB._id.toString() });

    expect(response.status).toBe(400);
    const unchangedCourse = await ExternalCourse.findById(courseA._id);
    expect(unchangedCourse.studentProfileId.toString()).not.toBe(profileB._id.toString());
  });

  it("denies deleting another family's course", async () => {
    const { parentB, courseA } = await createTwoFamilies();

    const response = await auth(request(app).delete(`/api/v1/external-course/${courseA._id}`), parentB);

    expect(response.status).toBe(403);
    expect(await ExternalCourse.exists({ _id: courseA._id })).not.toBeNull();
  });

  it("lets a parent create for their child and derives createdBy from authentication", async () => {
    const { parentA, parentB, profileA } = await createTwoFamilies();

    const response = await auth(request(app).post("/api/v1/external-course"), parentA).send({
      subject: "Physics",
      studentProfileId: profileA._id.toString(),
      createdBy: parentB._id.toString(),
    });

    expect(response.status).toBe(201);
    expect(response.body.data.course.createdBy).toBe(parentA._id.toString());
  });

  it("preserves parent updates for their own child's course", async () => {
    const { parentA, parentB, courseA } = await createTwoFamilies();

    const response = await auth(request(app).patch(`/api/v1/external-course/${courseA._id}`), parentA).send({
      subject: "Updated Mathematics",
      createdBy: parentB._id.toString(),
    });

    expect(response.status).toBe(200);
    expect(response.body.data.course.subject).toBe("Updated Mathematics");
    expect(response.body.data.course.createdBy).toBe(parentA._id.toString());
  });

  it("preserves parent deletion for their own child's course", async () => {
    const { parentA, courseA } = await createTwoFamilies();

    const response = await auth(request(app).delete(`/api/v1/external-course/${courseA._id}`), parentA);

    expect(response.status).toBe(200);
    expect(await ExternalCourse.exists({ _id: courseA._id })).toBeNull();
  });

  it("preserves a parent's scoped course collection", async () => {
    const { parentA, courseA } = await createTwoFamilies();

    const response = await auth(request(app).get("/api/v1/external-course/my-course"), parentA);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]._id).toBe(courseA._id.toString());
  });

  it("does not let query filters override a parent's child scope", async () => {
    const { parentA, parentB, profileB } = await createTwoFamilies();
    const courseB = await createCourse(profileB, parentB);

    const response = await auth(request(app).get("/api/v1/external-course/my-course").query({ studentProfileId: profileB._id.toString() }), parentA);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(response.body.data.map((course) => course._id)).not.toContain(courseB._id.toString());
  });

  it.each(["admin", "instructor"])("preserves %s staff-wide reads", async (role) => {
    const staff = await createActor(role);

    const response = await auth(request(app).get("/api/v1/external-course"), staff);

    expect(response.status).toBe(200);
  });

  it("preserves instructor updates across student profiles", async () => {
    const instructor = await createActor("instructor");
    const { courseA } = await createTwoFamilies();

    const response = await auth(request(app).patch(`/api/v1/external-course/${courseA._id}`), instructor).send({ subject: "Instructor Update" });

    expect(response.status).toBe(200);
    expect(response.body.data.course.subject).toBe("Instructor Update");
  });
});
