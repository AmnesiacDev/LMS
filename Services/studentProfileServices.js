import mongoose from "mongoose";
import StudentProfile from "../Models/studentProfile.js";
import User from "../Models/user.js";
import Session from "../Models/Session.js";
import AppErrorHelper from "../Utilities/AppErrorHelper.js";
import ApiFeatures from "../Utilities/ApiFeatures.js";

// Returns true when `currentUser` is allowed to read the given student profile.
// - admin       → always
// - student     → only their own profile
// - parent      → only profiles where they are listed in `parents`
// - instructor  → only profiles they have at least one session with
const canAccessStudentProfile = async (currentUser, profile) => {
  if (!currentUser || !profile) return false;
  if (currentUser.role === "admin") return true;

  if (currentUser.role === "student") {
    const ownUserId = profile.user?._id || profile.user;
    return ownUserId?.toString() === currentUser._id.toString();
  }

  if (currentUser.role === "parent") {
    return (profile.parents || []).some((p) => {
      const pid = p?._id || p;
      return pid?.toString() === currentUser._id.toString();
    });
  }

  if (currentUser.role === "instructor") {
    const isAssigned = (profile.instructors || []).some((i) => {
      const iid = i?._id || i;
      return iid?.toString() === currentUser._id.toString();
    });
    if (isAssigned) return true;

    const exists = await Session.exists({
      instructorId: currentUser._id,
      studentProfileId: profile._id,
    });
    return Boolean(exists);
  }

  return false;
};

const linkChildToParentService = async (childIdentifier, parentUser) => {
  if (!childIdentifier || typeof childIdentifier !== "string") {
    throw new AppErrorHelper("Please provide a valid child email or username!", 400);
  }

  const query = childIdentifier.includes("@")
    ? { Email: childIdentifier.trim().toLowerCase(), role: "student" }
    : { UserName: childIdentifier.trim(), role: "student" };

  const studentUser = await User.findOne(query);
  if (!studentUser) {
    throw new AppErrorHelper("No student user found with this email or username!", 404);
  }

  let profile = await StudentProfile.findOne({ user: studentUser._id });
  if (!profile) {
    profile = await StudentProfile.create({
      user: studentUser._id,
      parents: [parentUser._id],
    });
  } else {
    profile = await StudentProfile.findByIdAndUpdate(
      profile._id,
      { $addToSet: { parents: parentUser._id } },
      { new: true, runValidators: true }
    );
  }

  return profile;
};

const adminForceLinkParentService = async (studentUserId, parentUserId) => {
  const [studentUser, parentUser] = await Promise.all([
    User.findOne({ _id: studentUserId, role: "student" }),
    User.findOne({ _id: parentUserId, role: "parent" }),
  ]);

  if (!studentUser) throw new AppErrorHelper("Student user not found!", 404);
  if (!parentUser) throw new AppErrorHelper("Parent user not found!", 404);

  let profile = await StudentProfile.findOne({ user: studentUser._id });
  if (!profile) {
    profile = await StudentProfile.create({
      user: studentUser._id,
      parents: [parentUser._id],
    });
  } else {
    profile = await StudentProfile.findByIdAndUpdate(
      profile._id,
      { $addToSet: { parents: parentUser._id } },
      { new: true, runValidators: true }
    );
  }

  return profile;
};

const adminForceUnlinkParentService = async (studentUserId, parentUserId) => {
  const profile = await StudentProfile.findOneAndUpdate(
    { user: studentUserId },
    { $pull: { parents: parentUserId } },
    { new: true }
  );

  if (!profile) throw new AppErrorHelper("Student profile not found!", 404);
  return profile;
};

const adminForceLinkInstructorService = async (studentUserId, instructorUserId) => {
  const [studentUser, instructorUser] = await Promise.all([
    User.findOne({ _id: studentUserId, role: "student" }),
    User.findOne({ _id: instructorUserId, role: "instructor" }),
  ]);

  if (!studentUser) throw new AppErrorHelper("Student user not found!", 404);
  if (!instructorUser) throw new AppErrorHelper("Instructor user not found!", 404);

  let profile = await StudentProfile.findOne({ user: studentUser._id });
  if (!profile) {
    profile = await StudentProfile.create({
      user: studentUser._id,
      instructors: [instructorUser._id],
    });
  } else {
    profile = await StudentProfile.findByIdAndUpdate(
      profile._id,
      { $addToSet: { instructors: instructorUser._id } },
      { new: true, runValidators: true }
    );
  }

  return profile;
};

const adminForceUnlinkInstructorService = async (studentUserId, instructorUserId) => {
  const profile = await StudentProfile.findOneAndUpdate(
    { user: studentUserId },
    { $pull: { instructors: instructorUserId } },
    { new: true }
  );

  if (!profile) throw new AppErrorHelper("Student profile not found!", 404);
  return profile;
};

const createStudentProfileService = async (userId, profileData, currentUser) => {
  if (!userId || !profileData) {
    throw new AppErrorHelper("Student information is missing!", 400);
  }
  if (!currentUser) {
    throw new AppErrorHelper("You are not logged in!", 401);
  }

  const targetUser = await User.findById(userId);
  if (!targetUser || !targetUser.isActive) {
    throw new AppErrorHelper("User not found!", 404);
  }
  if (targetUser.role !== "student") {
    throw new AppErrorHelper("This user can't have a Student profile", 400);
  }

  // Authorization — prevent IDOR on the target user
  if (currentUser.role === "student") {
    if (targetUser._id.toString() !== currentUser._id.toString()) {
      throw new AppErrorHelper("You can only create your own profile!", 403);
    }
  } else if (currentUser.role === "parent") {
    // Parent may onboard any student-role user, but the parents list is
    // force-set to themselves so they can't slip in third-party "parents".
    profileData = { ...profileData, parents: [currentUser._id] };
  }
  // admin: unrestricted

  // Enforce one-profile-per-user (the schema's unique index is currently commented out)
  const existing = await StudentProfile.findOne({ user: targetUser._id });
  if (existing) {
    throw new AppErrorHelper("This user already has a Student profile", 409);
  }

  const { parents, grade, notes } = profileData;

  const studentProfile = await StudentProfile.create({
    user: targetUser._id,
    parents: parents || [],
    grade: grade || "",
    notes: notes || "",
  });

  return studentProfile;
};

const updateStudentProfileService = async (profileId, updateData, currentUser) => {
  if (!profileId || !updateData) {
    throw new AppErrorHelper("Profile ID and update data are required!", 400);
  }
  if (!currentUser) {
    throw new AppErrorHelper("You are not logged in!", 401);
  }

  const profile = await StudentProfile.findById(profileId);
  if (!profile) {
    throw new AppErrorHelper("Student profile not found!", 404);
  }

  // Authorization — prevent IDOR on the target profile.
  // Use 404 for mismatches so attackers can't enumerate which profile IDs exist.
  if (currentUser.role === "student") {
    const profileUserId = (profile.user?._id || profile.user)?.toString();
    if (profileUserId !== currentUser._id.toString()) {
      throw new AppErrorHelper("Student profile not found!", 404);
    }
  } else if (currentUser.role === "parent") {
    const isParent = (profile.parents || []).some((p) => {
      const pid = (p?._id || p)?.toString();
      return pid === currentUser._id.toString();
    });
    if (!isParent) {
      throw new AppErrorHelper("Student profile not found!", 404);
    }
  }
  // admin: unrestricted

  // Whitelist writable fields. Only admin can modify the parents array;
  // student / parent can update grade and notes only.
  const safeUpdate = {};
  if (updateData.grade !== undefined) safeUpdate.grade = updateData.grade;
  if (updateData.notes !== undefined) safeUpdate.notes = updateData.notes;
  if (currentUser.role === "admin" && updateData.parents !== undefined) {
    safeUpdate.parents = updateData.parents;
  }

  if (Object.keys(safeUpdate).length === 0) {
    throw new AppErrorHelper("No updatable fields provided!", 400);
  }

  const updated = await StudentProfile.findByIdAndUpdate(profileId, safeUpdate, {
    new: true,
    runValidators: true,
  });

  if (!updated) {
    throw new AppErrorHelper("Student profile not found!", 404);
  }

  return updated;
};

const getStudentProfileService = async (profileId, currentUser = null) => {
  if (!profileId) {
    throw new AppErrorHelper("Profile ID is required ! ", 400);
  }

  const profile = await StudentProfile.findById(profileId);
  if (!profile) {
    throw new AppErrorHelper("Student profile not found", 404);
  }

  if (currentUser && !(await canAccessStudentProfile(currentUser, profile))) {
    // Return the same 404 either way so an attacker can't probe which IDs exist.
    throw new AppErrorHelper("Student profile not found", 404);
  }

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

export {
  getStudentProfileService,
  updateStudentProfileService,
  createStudentProfileService,
  getMyStudentProfileService,
  getMyStudentProfileServiceById,
  getAllStudentProfilesService,
  recalculateAttendanceStreakService,
  canAccessStudentProfile,
  linkChildToParentService,
  adminForceLinkParentService,
  adminForceUnlinkParentService,
  adminForceLinkInstructorService,
  adminForceUnlinkInstructorService,
};
