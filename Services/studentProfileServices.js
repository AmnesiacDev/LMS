import mongoose from "mongoose";
import StudentProfile from "../Models/studentProfile.js";
import User from "../Models/user.js";
import Session from "../Models/Session.js";
import AppErrorHelper from "../Utilities/AppErrorHelper.js";
import ApiFeatures from "../Utilities/ApiFeatures.js";

const createStudentProfileService = async (userId, profileData) => {
  if (!userId || !profileData) {
    throw new AppErrorHelper("Student information is missing ! ", 404);
  }

  const { parents, grade, notes } = profileData;

  const user = await User.findById(userId);
  if (!user || !user.isActive) {
    throw new AppErrorHelper("User not found ! ", 404);
  }
  if(user.role !== "student"){
    throw new AppErrorHelper("This user can't have a Student profile ", 404);
  }

  const studentProfile = await StudentProfile.create({
    user: user._id,
    parents: parents || [],
    grade: grade || "",
    notes: notes || "",
  });

  return studentProfile;
};

const updateStudentProfileService = async (profileId, updateData) => {
  if (!profileId || !updateData) {
    throw new AppErrorHelper("Profile ID and update data are required ! ", 400);
  }
  const options = {
    new: true,
    runValidators: true,
  };
  const updatedStudentProfile = await StudentProfile.findByIdAndUpdate(profileId, updateData, options);

  if (!updatedStudentProfile) {
    throw new AppErrorHelper("Student profile not found ! ", 404);
  }

  return updatedStudentProfile;
};

const getStudentProfileService = async (profileId) => {
  if (!profileId) {
    throw new AppErrorHelper("Profile ID is required ! ", 400);
  }

  const profile = await StudentProfile.findById(profileId);

  return profile;
};

const getMyStudentProfileServiceById = async (parent, childId) => {
  if (parent.role === "parent") {
    const profile = await StudentProfile.findOne({
      user: childId,
      parents: parent._id,
    }).lean();

    if (!profile) {
      throw new AppErrorHelper("Child not found or not authorized!", 404);
    }

    return profile;
  }

  throw new AppErrorHelper("Not allowed!", 403);
};

const getMyStudentProfileService = async (user) => {
  if (user.role === "student") {
    const profile = await StudentProfile.findOne({ user: user._id });

    if (!profile) {
      throw new AppErrorHelper("Profile not found!", 404);
    }

    return profile;
  } else if (user.role === "parent") {
    const profiles = await StudentProfile.find({ parents: user._id });

    if (profiles.length === 0) {
      return [];
    }

    return profiles;
  } else {
    throw new AppErrorHelper("Not allowed!", 403);
  }
};

const getAllStudentProfilesService = async (QueryString) => {
  const features = new ApiFeatures(StudentProfile.find({}), QueryString).filter().sort().fields().pagination();

  return await features.mongooseQuery;
};

/**
 * Recalculate and persist the attendance streak for a student profile.
 * A streak = consecutive sessions (sorted newest-first) where StudentAttended is true.
 * Called after any session create/update that touches StudentAttended.
 */
const recalculateAttendanceStreakService = async (studentProfileId) => {
  const sessions = await Session.find(
    { studentProfileId, deletedAt: null, status: { $ne: "canceled" } },
    { StudentAttended: 1, date: 1 },
    { sort: { date: -1 } }
  ).setOptions({ withDeleted: false }).lean();

  let streak = 0;
  for (const s of sessions) {
    if (s.StudentAttended) {
      streak++;
    } else {
      break;
    }
  }

  const profile = await StudentProfile.findById(studentProfileId);
  if (!profile) return;

  profile.attendanceStreak = streak;
  if (streak > (profile.longestStreak || 0)) {
    profile.longestStreak = streak;
  }
  await profile.save({ validateBeforeSave: false });

  return { attendanceStreak: profile.attendanceStreak, longestStreak: profile.longestStreak };
};

export { getStudentProfileService, updateStudentProfileService, createStudentProfileService, getMyStudentProfileService, getMyStudentProfileServiceById, getAllStudentProfilesService, recalculateAttendanceStreakService };
