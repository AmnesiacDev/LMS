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

const [{ default: app }, { default: User }, { default: StudentProfile }, { default: ExternalCourse }, { default: ExternalHW }, { updateExternalHwService }] = await Promise.all([
  import("../App.js"),
  import("../Models/user.js"),
  import("../Models/studentProfile.js"),
  import("../Models/externalCourse.js"),
  import("../Models/externalHw.js"),
  import("../Services/ExternalCourseHwService.js"),
]);

let mongod;
let actorSequence = 0;

const createActor = async (role) => {
  actorSequence += 1;
  const _id = new mongoose.Types.ObjectId();

  await User.collection.insertOne({
    _id,
    FullName: `${role} Homework User`,
    UserName: `${role}_homework_user_${actorSequence}`,
    Email: `${role}.homework.${actorSequence}@example.com`,
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

const insertProfile = async (student, parent) => {
  const _id = new mongoose.Types.ObjectId();
  await StudentProfile.collection.insertOne({
    _id,
    user: student._id,
    parents: [parent._id],
    grade: "Grade 6",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { _id };
};

const insertCourse = async (profile, createdBy) => {
  const _id = new mongoose.Types.ObjectId();
  await ExternalCourse.collection.insertOne({
    _id,
    teacher: "Homework Teacher",
    subject: "Mathematics",
    createdBy: createdBy._id,
    studentProfileId: profile._id,
    color: "#654321",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { _id };
};

const insertHomework = async (course) => {
  const _id = new mongoose.Types.ObjectId();
  await ExternalHW.collection.insertOne({
    _id,
    title: "Algebra worksheet",
    description: "Complete the worksheet",
    dueDate: new Date(Date.now() + 86_400_000),
    externalCourse: course._id,
    status: "Pending",
    isSubmitted: false,
    category: "Project",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { _id };
};

const auth = (testRequest, actor) => testRequest.set("Authorization", `Bearer ${actor.token}`);

const createTwoFamilies = async () => {
  const [parentA, parentB, studentA, studentB] = await Promise.all([createActor("parent"), createActor("parent"), createActor("student"), createActor("student")]);
  const [profileA, profileB] = await Promise.all([insertProfile(studentA, parentA), insertProfile(studentB, parentB)]);
  const [courseA, courseB] = await Promise.all([insertCourse(profileA, parentA), insertCourse(profileB, parentB)]);
  const homeworkA = await insertHomework(courseA);

  return {
    parentA,
    parentB,
    studentA,
    studentB,
    courseA,
    courseB,
    homeworkA,
  };
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

describe("external-homework ownership authorization", () => {
  it("denies a parent access to the unscoped course endpoint", async () => {
    const { parentB, courseA } = await createTwoFamilies();

    const response = await auth(request(app).get(`/api/v1/external-hw/course/${courseA._id}`), parentB);

    expect(response.status).toBe(403);
  });

  it("denies a student access to an unscoped homework by id", async () => {
    const { studentB, homeworkA } = await createTwoFamilies();

    const response = await auth(request(app).get(`/api/v1/external-hw/${homeworkA._id}`), studentB);

    expect(response.status).toBe(403);
  });

  it("denies a parent creating homework for another family's course", async () => {
    const { parentB, courseA } = await createTwoFamilies();

    const response = await auth(request(app).post("/api/v1/external-hw"), parentB).send({
      title: "Unauthorized homework",
      dueDate: new Date(Date.now() + 86_400_000).toISOString(),
      externalCourse: courseA._id.toString(),
      category: "Project",
    });

    expect(response.status).toBe(403);
  });

  it("denies a parent updating another family's homework", async () => {
    const { parentB, homeworkA } = await createTwoFamilies();

    const response = await auth(request(app).patch(`/api/v1/external-hw/${homeworkA._id}`), parentB).send({ title: "Unauthorized update" });

    expect(response.status).toBe(403);
  });

  it("denies moving owned homework to another family's course", async () => {
    const { parentA, courseB, homeworkA } = await createTwoFamilies();

    const response = await auth(request(app).patch(`/api/v1/external-hw/${homeworkA._id}`), parentA).send({ externalCourse: courseB._id.toString() });

    expect(response.status).toBe(403);
  });

  it("rejects Mongo update operators at the service boundary", async () => {
    const { parentA, courseB, homeworkA } = await createTwoFamilies();

    await expect(
      updateExternalHwService(parentA, homeworkA._id, {
        $set: { externalCourse: courseB._id },
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    const unchangedHomework = await ExternalHW.findById(homeworkA._id);
    expect(unchangedHomework.externalCourse._id.toString()).not.toBe(courseB._id.toString());
  });

  it("denies a parent deleting another family's homework", async () => {
    const { parentB, homeworkA } = await createTwoFamilies();

    const response = await auth(request(app).delete(`/api/v1/external-hw/${homeworkA._id}`), parentB);

    expect(response.status).toBe(403);
    expect(await ExternalHW.exists({ _id: homeworkA._id })).not.toBeNull();
  });

  it("denies a student completing another student's homework", async () => {
    const { studentB, homeworkA } = await createTwoFamilies();

    const response = await auth(request(app).patch(`/api/v1/external-hw/${homeworkA._id}/complete`), studentB);

    expect(response.status).toBe(403);
    const unchangedHomework = await ExternalHW.findById(homeworkA._id);
    expect(unchangedHomework.status).toBe("Pending");
  });

  it("preserves a parent's create, update, and delete flow for their child", async () => {
    const { parentA, courseA } = await createTwoFamilies();

    const created = await auth(request(app).post("/api/v1/external-hw"), parentA).send({
      title: "Parent homework",
      dueDate: new Date(Date.now() + 86_400_000).toISOString(),
      externalCourse: courseA._id.toString(),
      category: "Project",
    });
    expect(created.status).toBe(201);

    const homeworkId = created.body.data.hw._id;
    const updated = await auth(request(app).patch(`/api/v1/external-hw/${homeworkId}`), parentA).send({ title: "Parent homework updated" });
    expect(updated.status).toBe(200);
    expect(updated.body.data.hw.title).toBe("Parent homework updated");

    const deleted = await auth(request(app).delete(`/api/v1/external-hw/${homeworkId}`), parentA);
    expect(deleted.status).toBe(200);
  });

  it("preserves a student's completion flow for their own homework", async () => {
    const { studentA, homeworkA } = await createTwoFamilies();

    const response = await auth(request(app).patch(`/api/v1/external-hw/${homeworkA._id}/complete`), studentA);

    expect(response.status).toBe(200);
    expect(response.body.data.hw.status).toBe("Completed");
    expect(response.body.data.hw.isSubmitted).toBe(true);
  });

  it.each(["student", "parent"])("preserves the %s scoped collection", async (role) => {
    const family = await createTwoFamilies();
    const actor = role === "student" ? family.studentA : family.parentA;

    const response = await auth(request(app).get("/api/v1/external-hw/my"), actor);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]._id).toBe(family.homeworkA._id.toString());
  });

  it("does not let query filters override a parent's course scope", async () => {
    const { parentA, courseB } = await createTwoFamilies();
    const homeworkB = await insertHomework(courseB);

    const response = await auth(request(app).get("/api/v1/external-hw/my").query({ externalCourse: courseB._id.toString() }), parentA);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(response.body.data.map((homework) => homework._id)).not.toContain(homeworkB._id.toString());
  });

  it.each(["admin", "instructor"])("preserves %s access to homework by id", async (role) => {
    const staff = await createActor(role);
    const { homeworkA } = await createTwoFamilies();

    const response = await auth(request(app).get(`/api/v1/external-hw/${homeworkA._id}`), staff);

    expect(response.status).toBe(200);
  });
});
