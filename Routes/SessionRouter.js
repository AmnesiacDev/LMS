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
  softDeleteSessionController,
  getCalendarController,
  getParentStudentSessionsController,
} from "../Controllers/SessionController.js";

const router = express.Router();

router.use(protectionController);

router.get("/me/calendar.ics", restrictedToController("student", "parent", "instructor"), getCalendarController);
router.get("/me/:id", restrictedToController("student", "parent"), getMySessionByIdController);
router.get("/me/", restrictedToController("student", "parent"), getMyAllSessionController);

// Parent: see upcoming sessions for a specific child
router.get("/parent/:studentProfileId", restrictedToController("parent"), getParentStudentSessionsController);

router.use(restrictedToController("admin", "instructor"));

router.get("/", getAllSessionsController);

router.get("/student/:id", getSessionsByStudentController);

router.get("/instructor/:id", getSessionsByInstructorController);

router.get("/:id", getSessionByIdController);

router.post("/", CreateSessionController);

router.route("/:id").patch(UpdateSessionByIdController).delete(deleteSessionByIdController);
router.patch("/:id/soft-delete", softDeleteSessionController);

export default router;
