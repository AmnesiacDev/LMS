import mongoose from "mongoose";

/**
 * A whiteboard / draft board (Excalidraw scene) attached to a single session.
 *
 * The scene itself is stored as raw JSON *text*, not as a nested subdocument.
 * Three reasons:
 *   1. App.js runs a recursive NoSQL-injection sanitizer over every request
 *      body. On a structured 2-5 MB scene that deep-walk rebuilds tens of
 *      thousands of objects on every autosave and blocks the event loop; on a
 *      string it is a single type check.
 *   2. Excalidraw's own `.excalidraw` file format is exactly this JSON
 *      document, so the stored value round-trips to/from the editor and to
 *      disk with no translation layer.
 *   3. Nothing server-side ever queries *into* the scene, so there is no
 *      benefit to storing it structured.
 *
 * Everything the UI needs for list views (title, element count, thumbnail,
 * share state) is denormalized into real fields so lists never load sceneData.
 */
const sessionCanvasSchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.ObjectId,
      ref: "Session",
      required: true,
    },
    // Denormalized from the session at creation time so student/parent
    // authorization does not need a second lookup on every read.
    studentProfileId: {
      type: mongoose.Schema.ObjectId,
      ref: "StudentProfile",
      required: true,
    },
    // The instructor who owns the board. Also denormalized from the session.
    instructorId: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: [2, "Board title must be at least 2 characters"],
      maxlength: [120, "Board title must be at most 120 characters"],
    },
    // Raw Excalidraw scene JSON: { type, version, source, elements, appState, files }
    sceneData: {
      type: String,
      default: "",
      // Never ship the scene in list queries — it is the whole payload.
      select: true,
    },
    // Cached from sceneData on every save so the list view can show "12 shapes"
    // without parsing anything.
    elementCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Small PNG data URL rendered by the client for board cards. Optional.
    thumbnail: {
      type: String,
      default: "",
    },
    // Boards are private drafts until the instructor explicitly shares them.
    // Students and parents can only ever read a board with isShared === true.
    isShared: {
      type: Boolean,
      default: false,
    },
    sharedAt: {
      type: Date,
      default: null,
    },
    // Monotonic save counter used for optimistic concurrency. A client that
    // sends a stale expectedVersion is rejected with 409 instead of silently
    // clobbering a save made from another tab.
    version: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastEditedBy: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

sessionCanvasSchema.index({ sessionId: 1, createdAt: -1 });
sessionCanvasSchema.index({ instructorId: 1, updatedAt: -1 });
sessionCanvasSchema.index({ studentProfileId: 1, isShared: 1, updatedAt: -1 });

// Match the convention used by Session: soft-deleted docs are invisible unless
// a query explicitly opts in with .setOptions({ withDeleted: true }).
sessionCanvasSchema.pre(/^find/, function () {
  if (!this.getOptions().withDeleted) {
    this.find({ deletedAt: null });
  }
});

const SessionCanvas = mongoose.model("SessionCanvas", sessionCanvasSchema);

export default SessionCanvas;
