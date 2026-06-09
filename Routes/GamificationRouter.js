import express from "express";
import { protectionController, restrictedToController } from "../Controllers/AuthController.js";
import {
  getMyGamificationProfileController,
  getStudentGamificationProfileController,
  getMyXPHistoryController,
  getMyBadgesController,
} from "../Controllers/GamificationController.js";

const router = express.Router();

// All gamification routes require authentication
router.use(protectionController);

// ─── Student / Parent routes ──────────────────────────────────────────────────
router.get("/me", restrictedToController("student", "parent"), getMyGamificationProfileController);
router.get("/me/history", restrictedToController("student", "parent"), getMyXPHistoryController);
router.get("/me/badges", restrictedToController("student", "parent"), getMyBadgesController);

// ─── Instructor / Admin routes ────────────────────────────────────────────────
router.get(
  "/:profileId",
  restrictedToController("instructor", "admin"),
  getStudentGamificationProfileController,
);

export default router;
