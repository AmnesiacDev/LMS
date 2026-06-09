import CatchAsync from "../Utilities/CatchAsync.js";
import {
  getLeaderboardService,
  getMyRankService,
} from "../Services/LeaderboardService.js";

// ─── Get Leaderboard ──────────────────────────────────────────────────────────
const getLeaderboardController = CatchAsync(async (req, res, next) => {
  const { period, metric, grade, page, limit } = req.query;

  const result = await getLeaderboardService({
    period,
    metric,
    grade,
    page: parseInt(page, 10) || 1,
    limit: parseInt(limit, 10) || 20,
    userId: req.user._id,
  });

  res.status(200).json({
    status: "success",
    ...result,
  });
});

// ─── Get My Rank ──────────────────────────────────────────────────────────────
const getMyRankController = CatchAsync(async (req, res, next) => {
  const data = await getMyRankService(req.user._id);

  res.status(200).json({
    status: "success",
    data,
  });
});

export {
  getLeaderboardController,
  getMyRankController,
};
