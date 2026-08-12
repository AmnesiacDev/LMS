import SessionCanvas from "../Models/SessionCanvas.js";
import Session from "../Models/Session.js";
import StudentProfile from "../Models/studentProfile.js";
import AppErrorHelper from "../Utilities/AppErrorHelper.js";
import ApiFeatures from "../Utilities/ApiFeatures.js";
import { notifyStudentAndParents } from "./NotificationHelpers.js";
import { assertInstructorAssignedToProfile } from "./StudentInstructorAssignmentService.js";
import { MAX_ELEMENTS } from "../Validation/sessionCanvasValidation.js";

const documentId = (value) => value?._id || value;
const sameId = (a, b) => documentId(a)?.toString() === documentId(b)?.toString();

const LIST_FIELDS = "-sceneData";

const boardPopulation = [
  { path: "sessionId", select: "title date status" },
  { path: "instructorId", select: "FullName UserName" },
];

// ─── Scene handling ───────────────────────────────────────────────────────────

/**
 * Validate a raw Excalidraw scene JSON string and derive its element count.
 *
 * The string is stored verbatim, so this is the only place its shape is
 * checked. An empty string is a legitimate value: a board is created before
 * anything is drawn on it.
 *
 * @param {string} raw - Scene JSON text from the client.
 * @returns {{ sceneData: string, elementCount: number }}
 */
const parseScene = (raw) => {
  if (!raw) return { sceneData: "", elementCount: 0 };

  let scene;
  try {
    scene = JSON.parse(raw);
  } catch {
    throw new AppErrorHelper("sceneData is not valid JSON", 400);
  }

  if (!scene || typeof scene !== "object" || Array.isArray(scene)) {
    throw new AppErrorHelper("sceneData must be an Excalidraw scene object", 400);
  }
  if (!Array.isArray(scene.elements)) {
    throw new AppErrorHelper("sceneData.elements must be an array", 400);
  }
  if (scene.elements.length > MAX_ELEMENTS) {
    throw new AppErrorHelper(`A board cannot hold more than ${MAX_ELEMENTS} elements`, 400);
  }

  // Deleted elements stay in the scene as tombstones so undo works; they should
  // not be counted in the "12 shapes" label on a board card.
  const elementCount = scene.elements.filter((el) => el && el.isDeleted !== true).length;

  return { sceneData: raw, elementCount };
};

// ─── Authorization ────────────────────────────────────────────────────────────

/**
 * The student profile ids a student or parent is allowed to see boards for.
 * Returns null for staff roles, which are authorized by a different rule.
 */
const getViewerProfileIds = async (user) => {
  if (user?.role === "student") {
    const profile = await StudentProfile.findOne({ user: user._id }).select("_id").lean();
    return profile ? [profile._id] : [];
  }
  if (user?.role === "parent") {
    const children = await StudentProfile.find({ parents: user._id }).select("_id").lean();
    return children.map((child) => child._id);
  }
  return null;
};

/**
 * Decide what `currentUser` may do with a board (or with the session a board
 * would be created under).
 *
 * Deliberately returns 404 rather than 403 when an instructor reaches for a
 * board on someone else's session: existence of another instructor's board is
 * itself information they should not have.
 *
 * @param {Object} currentUser - The authenticated user.
 * @param {Object} subject - A SessionCanvas or a Session document.
 * @returns {Promise<{ canEdit: boolean }>}
 */
const authorizeBoard = async (currentUser, subject) => {
  if (!currentUser) throw new AppErrorHelper("Not allowed", 403);

  if (currentUser.role === "admin") return { canEdit: true };

  if (currentUser.role === "instructor") {
    if (!sameId(subject.instructorId, currentUser._id)) {
      throw new AppErrorHelper("Board not found", 404);
    }
    await assertInstructorAssignedToProfile(currentUser._id, documentId(subject.studentProfileId));
    return { canEdit: true };
  }

  if (currentUser.role === "student" || currentUser.role === "parent") {
    const profileIds = await getViewerProfileIds(currentUser);
    const owns = profileIds.some((id) => sameId(id, subject.studentProfileId));
    if (!owns) throw new AppErrorHelper("Board not found", 404);
    // A private draft must be indistinguishable from a board that isn't there.
    if (subject.isShared !== true) throw new AppErrorHelper("Board not found", 404);
    return { canEdit: false };
  }

  throw new AppErrorHelper("Not allowed", 403);
};

/** Load a session and confirm the caller may author boards on it. */
const loadSessionForAuthoring = async (sessionId, currentUser) => {
  const session = await Session.findById(sessionId).select("_id title studentProfileId instructorId");
  if (!session) throw new AppErrorHelper("Session not found", 404);

  if (currentUser.role !== "admin" && currentUser.role !== "instructor") {
    throw new AppErrorHelper("Only instructors can create boards", 403);
  }
  // Reuse the board rule: a board inherits the session's owner and student.
  await authorizeBoard(currentUser, session);

  return session;
};

// ─── Services ─────────────────────────────────────────────────────────────────

/**
 * Create an empty (or pre-filled) board attached to a session.
 * The board's owner and student profile are taken from the session, never from
 * the request body, so a caller cannot attach a board to someone else's student.
 */
const createSessionCanvasService = async (data, currentUser) => {
  const session = await loadSessionForAuthoring(data.sessionId, currentUser);

  const { sceneData, elementCount } = parseScene(data.sceneData);

  return SessionCanvas.create({
    sessionId: session._id,
    studentProfileId: session.studentProfileId,
    instructorId: session.instructorId,
    title: data.title,
    sceneData,
    elementCount,
    thumbnail: data.thumbnail || "",
    isShared: data.isShared === true,
    sharedAt: data.isShared === true ? new Date() : null,
    version: 0,
    lastEditedBy: currentUser._id,
  });
};

/**
 * List every board attached to one session, newest first, without scene data.
 * Students and parents see only shared boards.
 */
const getSessionCanvasesService = async (sessionId, queryString = {}, currentUser) => {
  const session = await Session.findById(sessionId).select("_id studentProfileId instructorId");
  if (!session) throw new AppErrorHelper("Session not found", 404);

  const filter = { sessionId: session._id };

  if (currentUser.role === "student" || currentUser.role === "parent") {
    const profileIds = await getViewerProfileIds(currentUser);
    if (!profileIds.some((id) => sameId(id, session.studentProfileId))) {
      throw new AppErrorHelper("Session not found", 404);
    }
    filter.isShared = true;
  } else if (currentUser.role === "instructor") {
    if (!sameId(session.instructorId, currentUser._id)) {
      throw new AppErrorHelper("Session not found", 404);
    }
    await assertInstructorAssignedToProfile(currentUser._id, session.studentProfileId);
  } else if (currentUser.role !== "admin") {
    throw new AppErrorHelper("Not allowed", 403);
  }

  const mongooseQuery = SessionCanvas.find(filter).select(LIST_FIELDS).populate(boardPopulation);

  // Deliberately no .filter()/.fields(): a caller-supplied `fields=sceneData`
  // would turn the exclusion projection above into a mixed projection and leak
  // the scene into a list response, and a caller-supplied filter could be used
  // to probe for boards the isShared rule above is meant to hide.
  const features = new ApiFeatures(mongooseQuery, { sort: "-createdAt", ...queryString })
    .sort()
    .pagination();

  return features.mongooseQuery;
};

/**
 * Boards visible to the signed-in user across all of their sessions.
 * Instructors get their own boards; students and parents get shared boards for
 * their own (or their children's) sessions.
 */
const getMySessionCanvasesService = async (currentUser, queryString = {}) => {
  let filter;

  if (currentUser.role === "instructor") {
    filter = { instructorId: currentUser._id };
  } else if (currentUser.role === "admin") {
    filter = {};
  } else {
    const profileIds = await getViewerProfileIds(currentUser);
    if (!profileIds || profileIds.length === 0) return [];
    filter = { studentProfileId: { $in: profileIds }, isShared: true };
  }

  const mongooseQuery = SessionCanvas.find(filter).select(LIST_FIELDS).populate(boardPopulation);

  const features = new ApiFeatures(mongooseQuery, { sort: "-updatedAt", ...queryString })
    .sort()
    .pagination();

  return features.mongooseQuery;
};

/** Load one board including its scene, with a `canEdit` flag for the client. */
const getSessionCanvasByIdService = async (canvasId, currentUser) => {
  const canvas = await SessionCanvas.findById(canvasId).populate(boardPopulation);
  if (!canvas) throw new AppErrorHelper("Board not found", 404);

  const { canEdit } = await authorizeBoard(currentUser, canvas);

  return { canvas, canEdit };
};

/**
 * Save a board. `expectedVersion` implements optimistic concurrency: if the
 * board has moved on since the client loaded it, the save is refused rather
 * than silently overwriting the other tab's work.
 */
const updateSessionCanvasService = async (canvasId, data, currentUser) => {
  const canvas = await SessionCanvas.findById(canvasId);
  if (!canvas) throw new AppErrorHelper("Board not found", 404);

  const { canEdit } = await authorizeBoard(currentUser, canvas);
  if (!canEdit) throw new AppErrorHelper("You do not have permission to edit this board", 403);

  if (data.expectedVersion !== undefined && data.expectedVersion !== canvas.version) {
    throw new AppErrorHelper(
      "This board was changed somewhere else since you opened it. Reload before saving again.",
      409,
    );
  }

  if (data.title !== undefined) canvas.title = data.title;
  if (data.thumbnail !== undefined) canvas.thumbnail = data.thumbnail;

  if (data.sceneData !== undefined) {
    const { sceneData, elementCount } = parseScene(data.sceneData);
    canvas.sceneData = sceneData;
    canvas.elementCount = elementCount;
  }

  const wasShared = canvas.isShared;
  if (data.isShared !== undefined) {
    canvas.isShared = data.isShared;
    if (data.isShared && !wasShared) canvas.sharedAt = new Date();
  }

  canvas.version += 1;
  canvas.lastEditedBy = currentUser._id;

  await canvas.save();

  if (canvas.isShared && !wasShared) {
    notifyBoardShared(canvas, currentUser);
  }

  return canvas;
};

/** Flip a board between private draft and shared-with-student. */
const shareSessionCanvasService = async (canvasId, isShared, currentUser) => {
  const canvas = await SessionCanvas.findById(canvasId);
  if (!canvas) throw new AppErrorHelper("Board not found", 404);

  const { canEdit } = await authorizeBoard(currentUser, canvas);
  if (!canEdit) throw new AppErrorHelper("You do not have permission to share this board", 403);

  const wasShared = canvas.isShared;
  canvas.isShared = isShared;
  if (isShared && !wasShared) canvas.sharedAt = new Date();
  canvas.lastEditedBy = currentUser._id;

  await canvas.save();

  if (isShared && !wasShared) {
    notifyBoardShared(canvas, currentUser);
  }

  return canvas;
};

/** Soft delete, matching the convention used for sessions. */
const deleteSessionCanvasService = async (canvasId, currentUser) => {
  const canvas = await SessionCanvas.findById(canvasId);
  if (!canvas) throw new AppErrorHelper("Board not found", 404);

  const { canEdit } = await authorizeBoard(currentUser, canvas);
  if (!canEdit) throw new AppErrorHelper("You do not have permission to delete this board", 403);

  canvas.deletedAt = new Date();
  await canvas.save();

  return canvas;
};

// Best-effort: a notification failure must never fail the save that triggered it.
const notifyBoardShared = (canvas, currentUser) => {
  notifyStudentAndParents(canvas.studentProfileId, {
    type: "canvas_shared",
    link: `/dashboard/canvas/${canvas._id}`,
    sender: currentUser._id,
    studentTitle: "🎨 A new board was shared with you",
    studentMessage: `Your instructor shared the board "${canvas.title}".`,
    parentTitle: (name) => `🎨 A new board was shared with ${name}`,
    parentMessage: (name) => `An instructor shared the board "${canvas.title}" with ${name}.`,
  }).catch(() => {});
};

export {
  createSessionCanvasService,
  getSessionCanvasesService,
  getMySessionCanvasesService,
  getSessionCanvasByIdService,
  updateSessionCanvasService,
  shareSessionCanvasService,
  deleteSessionCanvasService,
};
