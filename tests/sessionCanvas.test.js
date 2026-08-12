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

const [
  { default: app },
  { default: User },
  { default: StudentProfile },
  { default: Session },
  { default: SessionCanvas },
  { default: StudentInstructorAssignment },
] = await Promise.all([
  import("../App.js"),
  import("../Models/user.js"),
  import("../Models/studentProfile.js"),
  import("../Models/Session.js"),
  import("../Models/SessionCanvas.js"),
  import("../Models/StudentInstructorAssignment.js"),
]);

let mongod;
let actorSequence = 0;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const createActor = async (role) => {
  actorSequence += 1;
  const _id = new mongoose.Types.ObjectId();

  await User.collection.insertOne({
    _id,
    FullName: `${role} Canvas`,
    UserName: `${role}_canvas_${actorSequence}`,
    Email: `${role}.canvas.${actorSequence}@example.com`,
    password: "not-used-by-this-test",
    role,
    isActive: true,
    approvalStatus: "approved",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const token = jwt.sign({ id: _id.toString(), role }, process.env.JWT_TOKEN_SECRET, {
    expiresIn: "1h",
  });

  return { _id, token, role };
};

const auth = (testRequest, actor) => testRequest.set("Authorization", `Bearer ${actor.token}`);

/**
 * Build a complete instructor → assignment → student-profile → session chain,
 * which is the minimum state every board authorization rule reads.
 */
const buildSessionWorld = async ({ withParent = false } = {}) => {
  const instructor = await createActor("instructor");
  const student = await createActor("student");
  const parent = withParent ? await createActor("parent") : null;

  const profile = await StudentProfile.create({
    user: student._id,
    grade: "Grade 7",
    ...(parent ? { parents: [parent._id] } : {}),
  });

  await StudentInstructorAssignment.create({
    studentProfileId: profile._id,
    instructorId: instructor._id,
    status: "active",
  });

  actorSequence += 1;
  const session = await Session.create({
    title: `Canvas Session ${actorSequence}`,
    description: "A session used by the canvas tests",
    studentProfileId: profile._id,
    instructorId: instructor._id,
    // The Session pre-save hook rejects dates in the past.
    date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  return { instructor, student, parent, profile, session };
};

const scene = (elementCount = 1, extra = {}) => ({
  type: "excalidraw",
  version: 2,
  source: "test",
  elements: Array.from({ length: elementCount }, (_, i) => ({
    id: `el-${i}`,
    type: "rectangle",
    x: i * 10,
    y: 0,
    width: 100,
    height: 50,
  })),
  appState: { viewBackgroundColor: "#ffffff" },
  files: {},
  ...extra,
});

const createBoard = (actor, body) => auth(request(app).post("/api/v1/session-canvas"), actor).send(body);

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  for (const collection of Object.values(mongoose.connection.collections)) {
    await collection.deleteMany({});
  }
});

// ─── Authoring ────────────────────────────────────────────────────────────────

describe("creating a board", () => {
  it("lets the session's own instructor create a board", async () => {
    const { instructor, session, profile } = await buildSessionWorld();

    const response = await createBoard(instructor, {
      sessionId: session._id.toString(),
      title: "Binary search walkthrough",
      sceneData: JSON.stringify(scene(3)),
    });

    expect(response.status).toBe(201);
    expect(response.body.data.canvas.title).toBe("Binary search walkthrough");
    expect(response.body.data.canvas.elementCount).toBe(3);
    expect(response.body.data.canvas.isShared).toBe(false);
    // Owner and student come from the session, never from the request body.
    expect(response.body.data.canvas.instructorId).toBe(instructor._id.toString());
    expect(response.body.data.canvas.studentProfileId).toBe(profile._id.toString());
  });

  it("refuses to attach a board to another instructor's session", async () => {
    const { session } = await buildSessionWorld();
    const outsider = await createActor("instructor");

    const response = await createBoard(outsider, {
      sessionId: session._id.toString(),
      title: "Not my session",
    });

    expect(response.status).toBe(404);
  });

  it.each(["student", "parent"])("refuses to let a %s create a board", async (role) => {
    const { session } = await buildSessionWorld();
    const actor = await createActor(role);

    const response = await createBoard(actor, {
      sessionId: session._id.toString(),
      title: "Student drawing",
    });

    expect(response.status).toBe(403);
  });

  it("rejects a scene that is not valid JSON", async () => {
    const { instructor, session } = await buildSessionWorld();

    const response = await createBoard(instructor, {
      sessionId: session._id.toString(),
      title: "Broken scene",
      sceneData: "{not json",
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/valid JSON/i);
  });

  it("rejects a scene whose elements are not an array", async () => {
    const { instructor, session } = await buildSessionWorld();

    const response = await createBoard(instructor, {
      sessionId: session._id.toString(),
      title: "Wrong shape",
      sceneData: JSON.stringify({ elements: { nope: true } }),
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/elements must be an array/i);
  });

  it("rejects a thumbnail that is not an image data URL", async () => {
    const { instructor, session } = await buildSessionWorld();

    const response = await createBoard(instructor, {
      sessionId: session._id.toString(),
      title: "Bad thumbnail",
      thumbnail: "javascript:alert(1)",
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/thumbnail/i);
  });

  it("does not count deleted elements toward elementCount", async () => {
    const { instructor, session } = await buildSessionWorld();
    const withTombstones = scene(2);
    withTombstones.elements[0].isDeleted = true;

    const response = await createBoard(instructor, {
      sessionId: session._id.toString(),
      title: "Undo history",
      sceneData: JSON.stringify(withTombstones),
    });

    expect(response.status).toBe(201);
    expect(response.body.data.canvas.elementCount).toBe(1);
  });
});

// ─── Reading ──────────────────────────────────────────────────────────────────

describe("reading a board", () => {
  it("hides a private draft from the student it belongs to", async () => {
    const { instructor, student, session } = await buildSessionWorld();
    const created = await createBoard(instructor, {
      sessionId: session._id.toString(),
      title: "Private draft",
      sceneData: JSON.stringify(scene()),
    });

    const response = await auth(
      request(app).get(`/api/v1/session-canvas/${created.body.data.canvas._id}`),
      student,
    );

    expect(response.status).toBe(404);
  });

  it("shows a shared board to the student, read-only", async () => {
    const { instructor, student, session } = await buildSessionWorld();
    const created = await createBoard(instructor, {
      sessionId: session._id.toString(),
      title: "Shared board",
      sceneData: JSON.stringify(scene(2)),
      isShared: true,
    });

    const response = await auth(
      request(app).get(`/api/v1/session-canvas/${created.body.data.canvas._id}`),
      student,
    );

    expect(response.status).toBe(200);
    expect(response.body.data.canEdit).toBe(false);
    expect(JSON.parse(response.body.data.canvas.sceneData).elements).toHaveLength(2);
  });

  it("shows a shared board to the student's parent", async () => {
    const { instructor, parent, session } = await buildSessionWorld({ withParent: true });
    const created = await createBoard(instructor, {
      sessionId: session._id.toString(),
      title: "Shared with parent",
      isShared: true,
    });

    const response = await auth(
      request(app).get(`/api/v1/session-canvas/${created.body.data.canvas._id}`),
      parent,
    );

    expect(response.status).toBe(200);
    expect(response.body.data.canEdit).toBe(false);
  });

  it("hides a shared board from an unrelated student", async () => {
    const { instructor, session } = await buildSessionWorld();
    const outsider = await createActor("student");
    await StudentProfile.create({ user: outsider._id, grade: "Grade 9" });

    const created = await createBoard(instructor, {
      sessionId: session._id.toString(),
      title: "Someone else's board",
      isShared: true,
    });

    const response = await auth(
      request(app).get(`/api/v1/session-canvas/${created.body.data.canvas._id}`),
      outsider,
    );

    expect(response.status).toBe(404);
  });

  it("keeps sceneData out of list responses", async () => {
    const { instructor, session } = await buildSessionWorld();
    await createBoard(instructor, {
      sessionId: session._id.toString(),
      title: "Listed board",
      sceneData: JSON.stringify(scene(5)),
    });

    const response = await auth(
      request(app).get(`/api/v1/session-canvas/session/${session._id}`),
      instructor,
    );

    expect(response.status).toBe(200);
    expect(response.body.data.docs).toHaveLength(1);
    expect(response.body.data.docs[0].sceneData).toBeUndefined();
    expect(response.body.data.docs[0].elementCount).toBe(5);
  });

  it("does not let a fields query pull sceneData into a list response", async () => {
    const { instructor, session } = await buildSessionWorld();
    await createBoard(instructor, {
      sessionId: session._id.toString(),
      title: "Projection probe",
      sceneData: JSON.stringify(scene(2)),
    });

    const response = await auth(
      request(app).get(`/api/v1/session-canvas/session/${session._id}`).query({ fields: "title,sceneData" }),
      instructor,
    );

    expect(response.status).toBe(200);
    expect(response.body.data.docs[0].sceneData).toBeUndefined();
  });

  it("returns only shared boards when a student lists a session", async () => {
    const { instructor, student, session } = await buildSessionWorld();
    await createBoard(instructor, { sessionId: session._id.toString(), title: "Draft" });
    await createBoard(instructor, {
      sessionId: session._id.toString(),
      title: "Shared",
      isShared: true,
    });

    const response = await auth(
      request(app).get(`/api/v1/session-canvas/session/${session._id}`),
      student,
    );

    expect(response.status).toBe(200);
    expect(response.body.data.docs.map((d) => d.title)).toEqual(["Shared"]);
  });

  it("scopes /me to the caller's own boards", async () => {
    const worldA = await buildSessionWorld();
    const worldB = await buildSessionWorld();

    await createBoard(worldA.instructor, { sessionId: worldA.session._id.toString(), title: "A board" });
    await createBoard(worldB.instructor, { sessionId: worldB.session._id.toString(), title: "B board" });

    const response = await auth(request(app).get("/api/v1/session-canvas/me"), worldA.instructor);

    expect(response.status).toBe(200);
    expect(response.body.data.docs.map((d) => d.title)).toEqual(["A board"]);
  });
});

// ─── Saving ───────────────────────────────────────────────────────────────────

describe("saving a board", () => {
  it("saves a new scene and bumps the version", async () => {
    const { instructor, session } = await buildSessionWorld();
    const created = await createBoard(instructor, {
      sessionId: session._id.toString(),
      title: "Work in progress",
      sceneData: JSON.stringify(scene(1)),
    });
    const id = created.body.data.canvas._id;

    const response = await auth(request(app).patch(`/api/v1/session-canvas/${id}`), instructor).send({
      sceneData: JSON.stringify(scene(4)),
    });

    expect(response.status).toBe(200);
    expect(response.body.data.canvas.elementCount).toBe(4);
    expect(response.body.data.canvas.version).toBe(1);
  });

  it("rejects a save made against a stale version", async () => {
    const { instructor, session } = await buildSessionWorld();
    const created = await createBoard(instructor, {
      sessionId: session._id.toString(),
      title: "Two tabs",
      sceneData: JSON.stringify(scene(1)),
    });
    const id = created.body.data.canvas._id;

    // First tab saves, taking the board to version 1.
    await auth(request(app).patch(`/api/v1/session-canvas/${id}`), instructor).send({
      sceneData: JSON.stringify(scene(2)),
      expectedVersion: 0,
    });

    // Second tab still believes it is on version 0.
    const response = await auth(request(app).patch(`/api/v1/session-canvas/${id}`), instructor).send({
      sceneData: JSON.stringify(scene(9)),
      expectedVersion: 0,
    });

    expect(response.status).toBe(409);
  });

  it("refuses a save from the student the board is shared with", async () => {
    const { instructor, student, session } = await buildSessionWorld();
    const created = await createBoard(instructor, {
      sessionId: session._id.toString(),
      title: "Read only for you",
      isShared: true,
    });

    const response = await auth(
      request(app).patch(`/api/v1/session-canvas/${created.body.data.canvas._id}`),
      student,
    ).send({ sceneData: JSON.stringify(scene(1)) });

    expect(response.status).toBe(403);
  });

  it("refuses a save from another instructor", async () => {
    const { instructor, session } = await buildSessionWorld();
    const outsider = await createActor("instructor");
    const created = await createBoard(instructor, {
      sessionId: session._id.toString(),
      title: "Mine",
    });

    const response = await auth(
      request(app).patch(`/api/v1/session-canvas/${created.body.data.canvas._id}`),
      outsider,
    ).send({ title: "Hijacked" });

    expect(response.status).toBe(404);
  });
});

// ─── Sharing and deleting ─────────────────────────────────────────────────────

describe("sharing and deleting", () => {
  it("flips a draft to shared and stamps sharedAt", async () => {
    const { instructor, student, session } = await buildSessionWorld();
    const created = await createBoard(instructor, {
      sessionId: session._id.toString(),
      title: "About to share",
    });
    const id = created.body.data.canvas._id;

    const shareResponse = await auth(
      request(app).patch(`/api/v1/session-canvas/${id}/share`),
      instructor,
    ).send({ isShared: true });

    expect(shareResponse.status).toBe(200);
    expect(shareResponse.body.data.canvas.isShared).toBe(true);
    expect(shareResponse.body.data.canvas.sharedAt).toBeTruthy();

    const studentView = await auth(request(app).get(`/api/v1/session-canvas/${id}`), student);
    expect(studentView.status).toBe(200);
  });

  it("hides the board again when sharing is turned off", async () => {
    const { instructor, student, session } = await buildSessionWorld();
    const created = await createBoard(instructor, {
      sessionId: session._id.toString(),
      title: "Unshare me",
      isShared: true,
    });
    const id = created.body.data.canvas._id;

    await auth(request(app).patch(`/api/v1/session-canvas/${id}/share`), instructor).send({
      isShared: false,
    });

    const studentView = await auth(request(app).get(`/api/v1/session-canvas/${id}`), student);
    expect(studentView.status).toBe(404);
  });

  it("refuses to let a student share a board", async () => {
    const { instructor, student, session } = await buildSessionWorld();
    const created = await createBoard(instructor, {
      sessionId: session._id.toString(),
      title: "Not yours to share",
      isShared: true,
    });

    const response = await auth(
      request(app).patch(`/api/v1/session-canvas/${created.body.data.canvas._id}/share`),
      student,
    ).send({ isShared: true });

    expect(response.status).toBe(403);
  });

  it("soft deletes a board so it disappears from reads but stays on disk", async () => {
    const { instructor, session } = await buildSessionWorld();
    const created = await createBoard(instructor, {
      sessionId: session._id.toString(),
      title: "Delete me",
    });
    const id = created.body.data.canvas._id;

    const deleteResponse = await auth(
      request(app).delete(`/api/v1/session-canvas/${id}`),
      instructor,
    );
    expect(deleteResponse.status).toBe(200);

    const afterDelete = await auth(request(app).get(`/api/v1/session-canvas/${id}`), instructor);
    expect(afterDelete.status).toBe(404);

    const raw = await SessionCanvas.findById(id).setOptions({ withDeleted: true });
    expect(raw).not.toBeNull();
    expect(raw.deletedAt).toBeInstanceOf(Date);
  });
});
