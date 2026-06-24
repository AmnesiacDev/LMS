import Gamification, { XP_PER_LEVEL } from "../Models/Gamification.js";
import { StudentBadge } from "../Models/Badge.js";
import { evaluateBadges } from "./BadgeEvaluator.js";
import { createNotificationService } from "./NotificationService.js";
import StudentProfile from "../Models/studentProfile.js";
import { emitToUser } from "../Utilities/SocketManager.js";
import AppErrorHelper from "../Utilities/AppErrorHelper.js";
import ApiFeatures from "../Utilities/ApiFeatures.js";

// Human-friendly phrasing for XP reasons, used in notification messages.
const XP_REASON_LABELS = {
  task_submit: "submitting a task",
  task_submit_late: "a late task submission",
  review_perfect: "a perfect review score",
  review_excellent: "an excellent review score",
  session_attended: "attending a session",
  streak_bonus: "a streak bonus",
  challenge_solved: "solving a challenge",
  puzzle_solved: "solving a puzzle",
  exam_passed: "passing an exam",
  badge_bonus: "a badge bonus",
  lesson_completed: "completing a lesson",
};

// ─── Ensure Profile ──────────────────────────────────────────────────────────
/**
 * Lazily creates a Gamification document on first interaction.
 * Returns the existing or newly created document.
 */
export const ensureProfile = async (studentProfileId) => {
  let profile = await Gamification.findOne({ studentProfileId });
  if (!profile) {
    profile = await Gamification.create({ studentProfileId });
  }
  return profile;
};

// ─── Award XP ────────────────────────────────────────────────────────────────
/**
 * Central XP award function. All gamification XP flows through here.
 *
 * @param {string} studentProfileId
 * @param {number} amount - XP to award
 * @param {string} reason - One of the xpHistory.reason enum values
 * @param {string} [sourceId] - ObjectId of the source document
 * @returns {{ gamification, leveledUp, newlyUnlockedBadges }}
 */
export const awardXP = async (studentProfileId, amount, reason, sourceId = null) => {
  if (amount <= 0) return { gamification: null, leveledUp: false, newlyUnlockedBadges: [] };

  const gamification = await ensureProfile(studentProfileId);
  const previousLevel = gamification.level;

  // Add XP
  gamification.xp += amount;
  gamification.lifetimeXP += amount;

  // Log to history
  gamification.xpHistory.push({
    amount,
    reason,
    sourceId,
    awardedAt: new Date(),
  });

  // Update streak
  await _updateStreakInternal(gamification);

  // Increment stat counters based on reason
  _incrementStat(gamification, reason);

  // Save (triggers pre-save level calculation)
  await gamification.save();

  const leveledUp = gamification.level > previousLevel;

  // Resolve the student's user id + parents once for all notifications below.
  // (auto-populated by StudentProfile's pre-find hook). Best-effort — a profile
  // load failure must not break XP awarding.
  let studentUserId = null;
  let studentName = "Your child";
  let parentIds = [];
  try {
    const profile = await StudentProfile.findById(studentProfileId);
    if (profile?.user) {
      studentUserId = profile.user._id?.toString?.() || profile.user.toString();
      studentName = profile.user.FullName || studentName;
    }
    parentIds = (profile?.parents || [])
      .map((p) => p?._id?.toString?.() || p?.toString?.())
      .filter(Boolean);
  } catch (err) {
    console.error("[Gamification] Failed to load profile for notifications:", err.message);
  }

  // Notify on level-up (student + parents)
  if (leveledUp && studentUserId) {
    emitToUser(studentUserId, "level:up", {
      newLevel: gamification.level,
      totalXP: gamification.xp,
    });

    try {
      await createNotificationService({
        recipient: studentUserId,
        type: "level_up",
        title: `🎉 Level Up! You're now Level ${gamification.level}!`,
        message: `You've reached ${gamification.xp} XP. Keep going!`,
        link: "/gamification",
      });

      await Promise.allSettled(
        parentIds.map((parentId) =>
          createNotificationService({
            recipient: parentId,
            type: "level_up",
            title: `🎉 ${studentName} reached Level ${gamification.level}!`,
            message: `${studentName} has reached ${gamification.xp} XP. Keep encouraging them!`,
            link: "/gamification",
          }),
        ),
      );
    } catch (err) {
      console.error("[Gamification] Level-up notification failed:", err.message);
    }
  }

  // Evaluate badges (may unlock new ones)
  const newlyUnlockedBadges = await evaluateBadges(studentProfileId);

  // Emit XP earned event + notify student and parents
  if (studentUserId) {
    emitToUser(studentUserId, "xp:earned", {
      amount,
      reason,
      totalXP: gamification.xp,
      level: gamification.level,
    });

    const reasonLabel = XP_REASON_LABELS[reason] || reason?.replace(/_/g, " ") || "your progress";

    try {
      await createNotificationService({
        recipient: studentUserId,
        type: "xp_earned",
        title: `⭐ You earned ${amount} XP!`,
        message: `You earned ${amount} XP for ${reasonLabel}. Total: ${gamification.xp} XP (Level ${gamification.level}).`,
        link: "/gamification",
      });

      await Promise.allSettled(
        parentIds.map((parentId) =>
          createNotificationService({
            recipient: parentId,
            type: "xp_earned",
            title: `⭐ ${studentName} earned ${amount} XP!`,
            message: `${studentName} earned ${amount} XP for ${reasonLabel}. Total: ${gamification.xp} XP (Level ${gamification.level}).`,
            link: "/gamification",
          }),
        ),
      );
    } catch (err) {
      console.error("[Gamification] XP notification failed:", err.message);
    }
  }

  return { gamification, leveledUp, newlyUnlockedBadges };
};

// ─── Increment Stat ──────────────────────────────────────────────────────────
/**
 * Bumps the relevant stats counter based on the XP reason.
 */
const _incrementStat = (gamification, reason) => {
  const map = {
    task_submit: "tasksSubmitted",
    task_submit_late: "tasksSubmitted",
    session_attended: "sessionsAttended",
    challenge_solved: "challengesSolved",
    puzzle_solved: "puzzlesSolved",
    exam_passed: "examsAbovePassing",
    review_perfect: "perfectScores",
  };

  // tasksOnTime is only for on-time submissions
  if (reason === "task_submit") {
    gamification.stats.tasksOnTime = (gamification.stats.tasksOnTime || 0) + 1;
  }

  const statKey = map[reason];
  if (statKey && gamification.stats[statKey] !== undefined) {
    gamification.stats[statKey] += 1;
  }
};

// ─── Internal Streak Update ──────────────────────────────────────────────────
/**
 * Updates the streak on the gamification document (in memory, not saved).
 */
const _updateStreakInternal = async (gamification) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (!gamification.lastActivityDate) {
    // First activity ever
    gamification.currentStreak = 1;
    gamification.lastActivityDate = today;
    return;
  }

  const lastDate = new Date(gamification.lastActivityDate);
  lastDate.setHours(0, 0, 0, 0);

  const diffDays = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    // Same day — no streak change
    return;
  } else if (diffDays === 1) {
    // Consecutive day — extend streak
    gamification.currentStreak += 1;
  } else {
    // Streak broken — reset
    gamification.currentStreak = 1;
  }

  gamification.lastActivityDate = today;

  // Update longest streak record
  if (gamification.currentStreak > gamification.longestStreak) {
    gamification.longestStreak = gamification.currentStreak;
  }
};

// ─── Get Profile Stats ───────────────────────────────────────────────────────
/**
 * Returns full gamification profile with badge count.
 */
export const getProfileStats = async (studentProfileId) => {
  const gamification = await ensureProfile(studentProfileId);

  const badgeCount = await StudentBadge.countDocuments({ studentProfileId });

  return {
    xp: gamification.xp,
    level: gamification.level,
    lifetimeXP: gamification.lifetimeXP,
    currentStreak: gamification.currentStreak,
    longestStreak: gamification.longestStreak,
    lastActivityDate: gamification.lastActivityDate,
    stats: gamification.stats,
    badgeCount,
    xpToNextLevel: XP_PER_LEVEL - (gamification.xp % XP_PER_LEVEL),
  };
};

// ─── Get XP History ──────────────────────────────────────────────────────────
export const getXPHistory = async (studentProfileId, queryString = {}) => {
  const gamification = await Gamification.findOne({ studentProfileId });
  if (!gamification) return [];

  let history = [...gamification.xpHistory];

  // Sort newest first
  history.sort((a, b) => b.awardedAt - a.awardedAt);

  // Simple pagination
  const page = parseInt(queryString.page, 10) || 1;
  const limit = parseInt(queryString.limit, 10) || 20;
  const skip = (page - 1) * limit;

  return {
    total: history.length,
    page,
    limit,
    data: history.slice(skip, skip + limit),
  };
};

// ─── Get My Badges ───────────────────────────────────────────────────────────
export const getStudentBadges = async (studentProfileId) => {
  return StudentBadge.find({ studentProfileId }).sort({ unlockedAt: -1 });
};

// ─── Resolve Student Profile ID ──────────────────────────────────────────────
/**
 * For students: resolve their user ID to a studentProfileId.
 * For parents: resolve to their children's profile IDs.
 */
export const resolveStudentProfileId = async (user) => {
  if (user.role === "student") {
    const profile = await StudentProfile.findOne({ user: user._id });
    if (!profile) throw new AppErrorHelper("Student profile not found", 404);
    return profile._id;
  }
  if (user.role === "parent") {
    const childProfiles = await StudentProfile.find({ parents: user._id });
    if (!childProfiles.length) throw new AppErrorHelper("No children profiles found", 404);
    // Return first child for single-profile endpoints
    return childProfiles[0]._id;
  }
  throw new AppErrorHelper("Invalid role for this operation", 403);
};
