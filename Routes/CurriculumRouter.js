import express from "express";
import { protectionController, restrictedToController } from "../Controllers/AuthController.js";
import {
  getAllCoursesController,
  getLessonDetailsController,
  completeLessonController,
} from "../Controllers/CurriculumController.js";

const router = express.Router();

// All curriculum routes require authentication
router.use(protectionController);

// Get all courses with student progress (available to student, parent, instructor, admin)
router.get("/courses", restrictedToController("student", "parent", "instructor", "admin"), getAllCoursesController);

// Get specific lesson content (available to student, parent, instructor, admin)
router.get("/lessons/:id", restrictedToController("student", "parent", "instructor", "admin"), getLessonDetailsController);

// Complete a lesson/quiz (only students can progress and earn XP)
router.post("/lessons/:id/complete", restrictedToController("student"), completeLessonController);

export default router;
