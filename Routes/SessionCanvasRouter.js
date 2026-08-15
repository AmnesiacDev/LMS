import express from "express";

import { protectionController, restrictedToController } from "../Controllers/AuthController.js";
import { validate } from "../Middleware/validate.js";
import {
  createSessionCanvasSchema,
  updateSessionCanvasSchema,
  shareSessionCanvasSchema,
} from "../Validation/sessionCanvasValidation.js";
import {
  createSessionCanvasController,
  getSessionCanvasesController,
  getMySessionCanvasesController,
  getSessionCanvasByIdController,
  updateSessionCanvasController,
  shareSessionCanvasController,
  deleteSessionCanvasController,
} from "../Controllers/SessionCanvasController.js";

const router = express.Router();
const authorOnly = restrictedToController("admin", "instructor");

router.use(protectionController);

// Boards visible to the caller across every session they can see.
// Students and parents get shared boards only; the service applies that rule.
router.get("/me", getMySessionCanvasesController);

// Every board attached to one session.
router.get("/session/:sessionId", getSessionCanvasesController);

router.post("/", authorOnly, validate(createSessionCanvasSchema), createSessionCanvasController);

router
  .route("/:id")
  .get(getSessionCanvasByIdController)
  .patch(authorOnly, validate(updateSessionCanvasSchema), updateSessionCanvasController)
  .delete(authorOnly, deleteSessionCanvasController);

router.patch("/:id/share", authorOnly, validate(shareSessionCanvasSchema), shareSessionCanvasController);

export default router;
