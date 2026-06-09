import express from "express";
import { protectionController } from "../Controllers/AuthController.js";
import {
  getLeaderboardController,
  getMyRankController,
} from "../Controllers/LeaderboardController.js";

const router = express.Router();

// All leaderboard routes require authentication
router.use(protectionController);

// ─── Leaderboard ──────────────────────────────────────────────────────────────
// GET /api/v1/leaderboard?period=weekly&metric=xp&grade=10&page=1&limit=20
router.get("/", getLeaderboardController);

// GET /api/v1/leaderboard/my-rank
router.get("/my-rank", getMyRankController);

export default router;
