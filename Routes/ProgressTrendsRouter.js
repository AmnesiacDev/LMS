import express from "express";
import { protectionController, restrictedToController } from "../Controllers/AuthController.js";
import {
  getReviewTrendsController,
  getTaskTrendsController,
  getSubmissionTrendsController,
  getExamTrendsController,
  getAttendanceTrendsController,
  getFullProgressController,
  getChildrenComparisonController,
  getExamAnalyticsSummaryController,
  getParentDashboardController,
} from "../Controllers/ProgressTrendsController.js";

const router = express.Router();

// All progress routes require authentication
router.use(protectionController);

// ─── "My" routes (student sees own, parent sees all children) ─────────────────
router.get("/me", restrictedToController("student", "parent"), getFullProgressController);
router.get("/me/reviews", restrictedToController("student", "parent"), getReviewTrendsController);
router.get("/me/tasks", restrictedToController("student", "parent"), getTaskTrendsController);
router.get("/me/submissions", restrictedToController("student", "parent"), getSubmissionTrendsController);
router.get("/me/exams", restrictedToController("student", "parent"), getExamTrendsController);
router.get("/me/attendance", restrictedToController("student", "parent"), getAttendanceTrendsController);

// ─── Parent-only: compare children side by side ───────────────────────────────
router.get("/compare-children", restrictedToController("parent"), getChildrenComparisonController);

// ─── Per-profile routes (admin, instructor, parent with access check) ─────────
router.get("/child/:profileId", getFullProgressController);
router.get("/child/:profileId/reviews", getReviewTrendsController);
router.get("/child/:profileId/tasks", getTaskTrendsController);
router.get("/child/:profileId/submissions", getSubmissionTrendsController);
router.get("/child/:profileId/exams", getExamTrendsController);
router.get("/child/:profileId/attendance", getAttendanceTrendsController);

// ─── Exam analytics summary ───────────────────────────────────────────────────
// GET /progress/student/:profileId/summary?lastN=10
router.get("/student/:profileId/summary", getExamAnalyticsSummaryController);

// ─── Parent dashboard ─────────────────────────────────────────────────────────
// GET /progress/parent/:profileId/dashboard
router.get("/parent/:profileId/dashboard", restrictedToController("parent", "admin", "instructor"), getParentDashboardController);

export default router;
