import Joi from "joi";

// ─── Size budget ──────────────────────────────────────────────────────────────
// A scene is one JSON document containing every element plus any embedded
// images (Excalidraw base64-encodes pasted images into scene.files). These caps
// are deliberately generous for drawings and deliberately hostile to someone
// using the board as free file storage.
//
// MAX_BODY_BYTES has to leave headroom above the two field caps for JSON
// escaping and the rest of the envelope, and is what the router hands to
// express.json() so an oversized body is rejected at the parser instead of
// being buffered all the way into Joi.
export const MAX_SCENE_CHARS = 4 * 1024 * 1024; // ~4 MB of scene JSON
export const MAX_THUMBNAIL_CHARS = 400 * 1024; // ~400 KB PNG data URL
export const MAX_ELEMENTS = 20_000;
export const MAX_BODY_BYTES = 6 * 1024 * 1024;

const objectId = Joi.string().hex().length(24);

// A data: PNG/JPEG/WEBP URL and nothing else. Without this an instructor could
// store `javascript:` or a remote `https://tracker/...` URL that the board card
// would then render as an <img src>.
const thumbnail = Joi.string()
  .allow("")
  .max(MAX_THUMBNAIL_CHARS)
  .pattern(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/)
  .messages({
    "string.pattern.base": "thumbnail must be a base64 data URL for a png, jpeg, or webp image",
    "string.max": "thumbnail is too large",
  });

const sceneData = Joi.string().allow("").max(MAX_SCENE_CHARS).messages({
  "string.max": "The board is too large to save. Try removing large embedded images.",
});

export const createSessionCanvasSchema = Joi.object({
  sessionId: objectId.required(),
  title: Joi.string().trim().min(2).max(120).required(),
  sceneData,
  thumbnail,
  isShared: Joi.boolean().default(false),
});

export const updateSessionCanvasSchema = Joi.object({
  title: Joi.string().trim().min(2).max(120),
  sceneData,
  thumbnail,
  isShared: Joi.boolean(),
  // Optimistic concurrency. Omitted means "I do not care, last write wins".
  expectedVersion: Joi.number().integer().min(0),
})
  .min(1)
  .messages({ "object.min": "Nothing to update" });

export const shareSessionCanvasSchema = Joi.object({
  isShared: Joi.boolean().required(),
});
