import CatchAsync from "../Utilities/CatchAsync.js";
import AppErrorHelper from "../Utilities/AppErrorHelper.js";
import StudentProfile from "../Models/studentProfile.js";
import {
  getProfileStats,
  getXPHistory,
  getStudentBadges,
  resolveStudentProfileId,
} from "../Services/GamificationService.js";

// ─── Get My Gamification Profile ──────────────────────────────────────────────
const getMyGamificationProfileController = CatchAsync(async (req, res, next) => {
  const profileId = await resolveStudentProfileId(req.user);
  const data = await getProfileStats(profileId);

  res.status(200).json({
    status: "success",
    data,
  });
});

// ─── Get Student Gamification Profile (instructor/admin) ──────────────────────
const getStudentGamificationProfileController = CatchAsync(async (req, res, next) => {
  const { profileId } = req.params;

  if (!profileId) {
    return next(new AppErrorHelper("Profile ID is required", 400));
  }

  const profile = await StudentProfile.findById(profileId);
  if (!profile) {
    return next(new AppErrorHelper("Student profile not found", 404));
  }

  const data = await getProfileStats(profileId);

  res.status(200).json({
    status: "success",
    data,
  });
});

// ─── Get My XP History ────────────────────────────────────────────────────────
const getMyXPHistoryController = CatchAsync(async (req, res, next) => {
  const profileId = await resolveStudentProfileId(req.user);
  const data = await getXPHistory(profileId, req.query);

  res.status(200).json({
    status: "success",
    ...data,
  });
});

// ─── Get My Badges ────────────────────────────────────────────────────────────
const getMyBadgesController = CatchAsync(async (req, res, next) => {
  const profileId = await resolveStudentProfileId(req.user);
  const badges = await getStudentBadges(profileId);

  res.status(200).json({
    status: "success",
    results: badges.length,
    data: { badges },
  });
});

export {
  getMyGamificationProfileController,
  getStudentGamificationProfileController,
  getMyXPHistoryController,
  getMyBadgesController,
};
