import Gamification from "../Models/Gamification.js";
import { StudentBadge } from "../Models/Badge.js";
import StudentProfile from "../Models/studentProfile.js";
import AppErrorHelper from "../Utilities/AppErrorHelper.js";
import mongoose from "mongoose";

/**
 * Build and execute the leaderboard aggregation pipeline.
 *
 * @param {Object} options
 * @param {string} [options.period]  - "weekly" | "monthly" | "all_time" (default)
 * @param {string} [options.metric]  - "xp" | "challenges" | "streak" (default: "xp")
 * @param {string} [options.grade]   - Filter by student grade
 * @param {number} [options.page]    - Page number (default: 1)
 * @param {number} [options.limit]   - Results per page (default: 20)
 * @param {string} [options.userId]  - Current user ID, for calculating "myRank"
 * @returns {{ leaderboard, myRank, totalStudents }}
 */
export const getLeaderboardService = async (options = {}) => {
  const {
    period = "all_time",
    metric = "xp",
    grade,
    page = 1,
    limit = 20,
    userId,
  } = options;

  const skip = (page - 1) * limit;

  // ─── Period filter ──────────────────────────────────────────────────
  let periodMatch = {};

  if (period === "weekly") {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    periodMatch = { "xpHistory.awardedAt": { $gte: weekAgo } };
  } else if (period === "monthly") {
    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    periodMatch = { "xpHistory.awardedAt": { $gte: monthAgo } };
  }

  // ─── Sort field based on metric ─────────────────────────────────────
  let sortField;
  let projectXPField;

  if (period !== "all_time") {
    // For time-based periods, we need to sum XP from xpHistory within the date range
    sortField = "periodXP";
    projectXPField = true;
  } else {
    switch (metric) {
      case "challenges":
        sortField = "stats.challengesSolved";
        break;
      case "streak":
        sortField = "longestStreak";
        break;
      default:
        sortField = "xp";
    }
  }

  // ─── Build pipeline ─────────────────────────────────────────────────
  const pipeline = [];

  // Stage 1: Base match
  pipeline.push({ $match: { xp: { $gt: 0 } } });

  // Stage 2: Period-based XP calculation
  if (period !== "all_time") {
    const dateThreshold = period === "weekly"
      ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    pipeline.push(
      {
        $addFields: {
          periodXP: {
            $reduce: {
              input: {
                $filter: {
                  input: "$xpHistory",
                  as: "entry",
                  cond: { $gte: ["$$entry.awardedAt", dateThreshold] },
                },
              },
              initialValue: 0,
              in: { $add: ["$$value", "$$this.amount"] },
            },
          },
        },
      },
      { $match: { periodXP: { $gt: 0 } } },
    );
  }

  // Stage 3: Join StudentProfile
  pipeline.push(
    {
      $lookup: {
        from: "studentprofiles",
        localField: "studentProfileId",
        foreignField: "_id",
        as: "profile",
      },
    },
    { $unwind: "$profile" },
  );

  // Stage 4: Grade filter
  if (grade) {
    pipeline.push({ $match: { "profile.grade": grade } });
  }

  // Stage 5: Join User
  pipeline.push(
    {
      $lookup: {
        from: "users",
        localField: "profile.user",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: "$user" },
    // Only include active users
    { $match: { "user.isActive": { $ne: false } } },
  );

  // Stage 6: Count badges
  pipeline.push(
    {
      $lookup: {
        from: "studentbadges",
        localField: "studentProfileId",
        foreignField: "studentProfileId",
        as: "badges",
      },
    },
  );

  // Stage 7: Sort
  pipeline.push({ $sort: { [sortField]: -1 } });

  // Stage 8: Add rank
  pipeline.push({
    $setWindowFields: {
      sortBy: { [sortField]: -1 },
      output: { rank: { $rank: {} } },
    },
  });

  // Stage 9: Project final shape
  pipeline.push({
    $project: {
      rank: 1,
      studentProfileId: 1,
      userId: "$user._id",
      studentName: "$user.FullName",
      userName: "$user.UserName",
      avatar: "$user.avatar",
      grade: "$profile.grade",
      xp: period !== "all_time" ? "$periodXP" : "$xp",
      level: 1,
      currentStreak: 1,
      longestStreak: 1,
      challengesSolved: "$stats.challengesSolved",
      puzzlesSolved: "$stats.puzzlesSolved",
      badgeCount: { $size: "$badges" },
    },
  });

  // ─── Run full pipeline for total count ──────────────────────────────
  const fullResults = await Gamification.aggregate(pipeline);
  const totalStudents = fullResults.length;

  // ─── Find current user's rank ───────────────────────────────────────
  let myRank = null;
  if (userId) {
    const myEntry = fullResults.find(
      (r) => r.userId && r.userId.toString() === userId.toString(),
    );
    myRank = myEntry?.rank || null;
  }

  // ─── Paginate ───────────────────────────────────────────────────────
  const leaderboard = fullResults.slice(skip, skip + limit);

  return {
    leaderboard,
    myRank,
    totalStudents,
    page,
    limit,
  };
};

/**
 * Get just the current user's rank without the full leaderboard.
 */
export const getMyRankService = async (userId) => {
  const profile = await StudentProfile.findOne({ user: userId });
  if (!profile) throw new AppErrorHelper("Student profile not found", 404);

  const result = await getLeaderboardService({
    period: "all_time",
    metric: "xp",
    userId,
    limit: 1000, // Need full list to find rank
  });

  if (!result.myRank) {
    return { rank: null, totalStudents: result.totalStudents, message: "No activity yet" };
  }

  const myEntry = result.leaderboard.find(
    (r) => r.userId && r.userId.toString() === userId.toString(),
  );

  return {
    rank: result.myRank,
    totalStudents: result.totalStudents,
    ...(myEntry || {}),
  };
};
