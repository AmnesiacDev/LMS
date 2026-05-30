import express from "express";
import { protectionController, restrictedToController } from "../Controllers/AuthController.js";
import {
  deleteSessionByIdController,
  UpdateSessionByIdController,
  getSessionByIdController,
  getSessionsByStudentController,
  getSessionsByInstructorController,
  getAllSessionsController,
  CreateSessionController,
  getMyAllSessionController,
  getMySessionByIdController,
  getMyStudentsController,
  softDeleteSessionController,
  getCalendarController,
  getParentStudentSessionsController,
  generateSessionAiSummaryController,
  getSessionAiSummaryController,
} from "../Controllers/SessionController.js";

const router = express.Router();

router.use(protectionController);

router.get("/me/calendar.ics", restrictedToController("student", "parent", "instructor"), getCalendarController);
router.get("/me/students", restrictedToController("instructor", "admin"), getMyStudentsController);
router.get("/me/:id", restrictedToController("student", "parent", "instructor"), getMySessionByIdController);
router.get("/me/", restrictedToController("student", "parent", "instructor"), getMyAllSessionController);

// Parent: see upcoming sessions for a specific child
router.get("/parent/:studentProfileId", restrictedToController("parent"), getParentStudentSessionsController);

// Read-only: view a session's AI summary. Students/parents see only their own
// (ownership enforced in the service); instructors their own; admins any.
router.get(
  "/:id/ai-summary",
  restrictedToController("student", "parent", "instructor", "admin"),
  getSessionAiSummaryController,
);

router.use(restrictedToController("admin", "instructor"));

router.get("/", getAllSessionsController);

router.get("/student/:id", getSessionsByStudentController);

router.get("/instructor/:id", getSessionsByInstructorController);

router.get("/:id", getSessionByIdController);

router.post("/", CreateSessionController);

router.route("/:id").patch(UpdateSessionByIdController).delete(deleteSessionByIdController);
router.patch("/:id/soft-delete", softDeleteSessionController);

// Generate (or regenerate) an AI summary for a session (instructor/admin only)
router.post("/:id/ai-summary", generateSessionAiSummaryController);

export default router;
