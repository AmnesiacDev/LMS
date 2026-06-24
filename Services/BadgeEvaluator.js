import { Badge, StudentBadge } from "../Models/Badge.js";
import Gamification from "../Models/Gamification.js";
import { createNotificationService } from "./NotificationService.js";
import StudentProfile from "../Models/studentProfile.js";
import { emitToUser } from "../Utilities/SocketManager.js";

/**
 * Evaluate all badge conditions for a student and unlock any newly earned badges.
 * Called by GamificationService.awardXP() after every XP change.
 *
 * @param {string} studentProfileId
 * @returns {Array} Array of newly unlocked badge documents
 */
export const evaluateBadges = async (studentProfileId) => {
  const gamification = await Gamification.findOne({ studentProfileId });
  if (!gamification) return [];

  // All badge definitions
  const allBadges = await Badge.find({});

  // Badges the student already has
  const earnedBadgeIds = (await StudentBadge.find({ studentProfileId }))
    .map((sb) => sb.badge._id?.toString?.() || sb.badge.toString());

  const newlyUnlocked = [];

  for (const badge of allBadges) {
    // Skip if already earned
    if (earnedBadgeIds.includes(badge._id.toString())) continue;

    // Resolve the value to check against the threshold
    let currentValue;
    const stat = badge.condition.stat;

    if (stat === "level") {
      currentValue = gamification.level;
    } else if (stat === "currentStreak") {
      currentValue = gamification.currentStreak;
    } else if (gamification.stats && gamification.stats[stat] !== undefined) {
      currentValue = gamification.stats[stat];
    } else {
      continue; // Unknown stat — skip
    }

    if (currentValue >= badge.condition.threshold) {
      // Unlock the badge
      try {
        const studentBadge = await StudentBadge.create({
          studentProfileId,
          badge: badge._id,
        });

        newlyUnlocked.push(badge);

        // Award bonus XP for the badge (non-recursive — we only add to history,
        // not re-trigger evaluateBadges to avoid infinite loops)
        if (badge.xpReward > 0) {
          gamification.xp += badge.xpReward;
          gamification.lifetimeXP += badge.xpReward;
          gamification.xpHistory.push({
            amount: badge.xpReward,
            reason: "badge_bonus",
            sourceId: badge._id,
            awardedAt: new Date(),
          });
        }

        // Send real-time notification via socket + persist for student & parents.
        // Wrapped in its own try/catch so a notification failure is never
        // mislabeled as a badge-unlock failure by the outer catch below.
        try {
          const profile = await StudentProfile.findById(studentProfileId);
          if (profile?.user) {
            const userId = profile.user._id?.toString?.() || profile.user.toString();
            const studentName = profile.user.FullName || "Your child";

            emitToUser(userId, "badge:unlocked", {
              name: badge.name,
              icon: badge.icon,
              rarity: badge.rarity,
              description: badge.description,
              xpReward: badge.xpReward,
            });

            // Persist notification for the student
            await createNotificationService({
              recipient: userId,
              type: "badge_unlocked",
              title: `🏆 Badge Unlocked: ${badge.name}!`,
              message: `${badge.description} — You earned ${badge.xpReward} bonus XP!`,
              link: "/gamification/badges",
            });

            // Notify the parents too
            const parentIds = (profile.parents || [])
              .map((p) => p?._id?.toString?.() || p?.toString?.())
              .filter(Boolean);

            await Promise.allSettled(
              parentIds.map((parentId) =>
                createNotificationService({
                  recipient: parentId,
                  type: "badge_unlocked",
                  title: `🏆 ${studentName} unlocked a badge: ${badge.name}!`,
                  message: `${badge.description}${badge.xpReward > 0 ? ` — ${studentName} earned ${badge.xpReward} bonus XP!` : ""}`,
                  link: "/gamification/badges",
                }),
              ),
            );
          }
        } catch (notifyErr) {
          console.error("[BadgeEvaluator] Badge unlock notification failed:", notifyErr.message);
        }
      } catch (err) {
        // Duplicate key error (race condition) — badge already earned, skip
        if (err.code === 11000) continue;
        console.error(`[BadgeEvaluator] Failed to unlock badge "${badge.name}":`, err.message);
      }
    }
  }

  // Save any badge-bonus XP that was added
  if (newlyUnlocked.length > 0) {
    await gamification.save();
  }

  return newlyUnlocked;
};
