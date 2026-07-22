import mongoose from "mongoose";
import Session from "../Models/Session.js";
import User from "../Models/user.js";
import StudentProfile from "../Models/studentProfile.js";
import AppErrorHelper from "../Utilities/AppErrorHelper.js";
import ApiFeatures from "../Utilities/ApiFeatures.js";
import { recalculateAttendanceStreakService } from "./studentProfileServices.js";
import { createNotificationService } from "./NotificationService.js";
import { assertInstructorAssignedToProfile, getAssignedStudentProfilesService } from "./StudentInstructorAssignmentService.js";

// ─── Notify student + parents when a meeting link is added/updated ───────────
// Best-effort: failures are logged, never thrown so the session flow is never
// broken by a notification problem. `studentProfile` is expected to be a doc
// fetched via StudentProfile.findById (auto-populates `user` and `parents`).
const notifyMeetingLink = async (studentProfile, session, { type, action }) => {
  try {
    if (!studentProfile) return;

    const studentUserId = studentProfile.user?._id || studentProfile.user;
    const studentName = studentProfile.user?.FullName || "your child";
    const senderId = session.instructorId?._id || session.instructorId;
    const sessionDate = session.date ? new Date(session.date).toLocaleString() : "";
    const when = sessionDate ? ` on ${sessionDate}` : "";

    const notifications = [];

    if (studentUserId) {
      notifications.push(
        createNotificationService({
          recipient: studentUserId,
          sender: senderId,
          type,
          title: `🔗 Meeting link ${action} for "${session.title}"`,
          message: `The meeting link for your session "${session.title}"${when} has been ${action}.`,
          link: `/sessions/${session._id}`,
        }),
      );
    }

    for (const parent of studentProfile.parents || []) {
      const parentId = parent?._id || parent;
      if (!parentId) continue;
      notifications.push(
        createNotificationService({
          recipient: parentId,
          sender: senderId,
          type,
          title: `🔗 Meeting link ${action} for "${session.title}"`,
          message: `The meeting link for ${studentName}'s session "${session.title}"${when} has been ${action}.`,
          link: `/sessions/${session._id}`,
        }),
      );
    }

    const results = await Promise.allSettled(notifications);
    results.forEach((r) => {
      if (r.status === "rejected") {
        console.error("[SessionService] Meeting link notification failed:", r.reason?.message);
      }
    });
  } catch (err) {
    console.error("[SessionService] Meeting link notification failed:", err.message);
  }
};

const createSessionService = async (data, currentUser) => {
  const { title, description, recapVideoLinks, attachmentsLinks, studentProfileId, instructorId, date, StudentAttended, meetingLink } = data;

  const studentProfile = await StudentProfile.findById(studentProfileId);
  if (!studentProfile) {
    throw new AppErrorHelper("Student profile not found!", 404);
  }

  const instructor = await User.findById(instructorId);
  if (!instructor) {
    throw new AppErrorHelper("Instructor not found!", 404);
  }

  const student = await User.findById(studentProfile.user);
  if (!student) {
    throw new AppErrorHelper("Student user not found!", 404);
  }

  if (student.role !== "student" || instructor.role !== "instructor") {
    throw new AppErrorHelper("Wrong assignment of roles!", 400);
  }

  if (currentUser?.role === "instructor" && instructor._id.toString() !== currentUser._id.toString()) {
    throw new AppErrorHelper("Instructors can only create their own sessions", 403);
  }
  await assertInstructorAssignedToProfile(instructor._id, studentProfile._id);

  const session = await Session.create({
    title: title,
    description: description,
    recapVideoLinks: recapVideoLinks || [],
    attachmentsLinks: attachmentsLinks || [],
    studentProfileId: studentProfile._id,
    instructorId: instructor._id,
    date: date,
    StudentAttended: StudentAttended ?? true,
    meetingLink: meetingLink,
  });

  recalculateAttendanceStreakService(session.studentProfileId).catch(() => {});

  // Notify student + parents if the session already has a meeting link on creation
  if (session.meetingLink) {
    await notifyMeetingLink(studentProfile, session, { type: "new_session", action: "added" });
  }

  return session;
};

const createBulkSessionsService = async (data) => {
  const { studentProfileIds, instructorId, title, description, date, meetingLink, recapVideoLinks, attachmentsLinks, StudentAttended, notes, summary, currentUser } = data;

  if (!studentProfileIds || !Array.isArray(studentProfileIds) || studentProfileIds.length === 0) {
    throw new AppErrorHelper("studentProfileIds array is required and must not be empty", 400);
  }

  if (!date) {
    throw new AppErrorHelper("Session date is required", 400);
  }

  const instructor = await User.findById(instructorId);
  if (!instructor || instructor.role !== "instructor") {
    throw new AppErrorHelper("Valid instructor required!", 400);
  }
  if (currentUser?.role === "instructor" && instructor._id.toString() !== currentUser._id.toString()) {
    throw new AppErrorHelper("Instructors can only create their own sessions", 403);
  }

  const profiles = await StudentProfile.find({ _id: { $in: studentProfileIds } }).populate("user parents");

  if (!profiles.length) {
    throw new AppErrorHelper("No valid student profiles found!", 404);
  }

  for (const profile of profiles) {
    await assertInstructorAssignedToProfile(instructor._id, profile._id);
  }

  const createdSessions = [];
  const parsedDate = new Date(date);

  for (const profile of profiles) {
    let studentUser = profile.user;
    if (studentUser && typeof studentUser === "object" && !studentUser.role && studentUser._id) {
      studentUser = await User.findById(studentUser._id);
    } else if (studentUser && typeof studentUser !== "object") {
      studentUser = await User.findById(studentUser);
    }

    if (!studentUser || studentUser.role !== "student") {
      continue;
    }

    const session = await Session.create({
      title,
      description,
      recapVideoLinks: recapVideoLinks || [],
      attachmentsLinks: attachmentsLinks || [],
      studentProfileId: profile._id,
      instructorId: instructor._id,
      date: parsedDate,
      StudentAttended: StudentAttended ?? true,
      meetingLink,
      notes,
      summary,
    });

    recalculateAttendanceStreakService(profile._id).catch(() => {});

    if (session.meetingLink) {
      await notifyMeetingLink(profile, session, { type: "new_session", action: "added" });
    }

    createdSessions.push(session);
  }

  if (!createdSessions.length) {
    throw new AppErrorHelper("No valid sessions could be created!", 400);
  }

  return createdSessions;
};

const getSessionByIdService = async (SessionId, currentUser) => {
  const session = await Session.findById(SessionId).populate([{ path: "studentProfileId" }, { path: "instructorId", select: "FullName Email" }]);

  if (!session) {
    throw new AppErrorHelper("Session not found!", 404);
  }
  await assertCanManageSession(currentUser, session);
  return session;
};

const getMyAllSessionsService = async (user, queryString) => {
  let mongooseQuery;

  if (user.role === "student") {
    const studentProfile = await StudentProfile.findOne({ user: user._id });

    if (!studentProfile) {
      throw new AppErrorHelper("Not allowed!", 403);
    }

    mongooseQuery = Session.find({ studentProfileId: studentProfile._id });
  } else if (user.role === "parent") {
    const childrenProfiles = await StudentProfile.find({ parents: user._id }, { _id: 1 });

    if (!childrenProfiles.length) {
      return [];
    }

    const childrenIds = childrenProfiles.map((profile) => profile._id);
    mongooseQuery = Session.find({ studentProfileId: { $in: childrenIds } });
  } else if (user.role === "instructor") {
    const profiles = await getAssignedStudentProfilesService(user);
    mongooseQuery = Session.find({
      instructorId: user._id,
      studentProfileId: { $in: profiles.map((profile) => profile._id) },
    })
      .populate({
        path: "studentProfileId",
        populate: { path: "user", select: "FullName Email UserName" },
      })
      .populate({ path: "instructorId", select: "FullName Email" });
  } else {
    throw new AppErrorHelper("Not allowed", 403);
  }

  const features = new ApiFeatures(mongooseQuery, queryString).filter().sort().fields().pagination();
  return await features.mongooseQuery;
};

const getMySessionByIdService = async (userData, sessionId) => {
  if (userData.role === "student") {
    const studentProfile = await StudentProfile.findOne({ user: userData._id });
    if (!studentProfile) {
      throw new AppErrorHelper("Not allowed!", 403);
    }

    const session = await Session.findOne({ studentProfileId: studentProfile._id, _id: sessionId });
    return session;
  }

  if (userData.role === "parent") {
    const childrenProfiles = await StudentProfile.find({ parents: userData._id }, { _id: 1 });

    if (!childrenProfiles.length) {
      throw new AppErrorHelper("Not allowed!", 403);
    }

    const childrenIds = childrenProfiles.map((profile) => profile._id);
    const session = await Session.findOne({ _id: sessionId, studentProfileId: { $in: childrenIds } });
    return session;
  }

  if (userData.role === "instructor") {
    const session = await Session.findOne({ _id: sessionId, instructorId: userData._id })
      .populate({
        path: "studentProfileId",
        populate: { path: "user", select: "FullName Email UserName" },
      })
      .populate({ path: "instructorId", select: "FullName Email" });
    if (session) await assertCanManageSession(userData, session);
    return session;
  }

  throw new AppErrorHelper("Not allowed!", 403);
};

const getMyStudentsService = async (user) => {
  return getAssignedStudentProfilesService(user);
};

const documentId = (value) => value?._id || value;

const assertCanManageSession = async (currentUser, session) => {
  if (currentUser?.role === "admin") return;
  if (currentUser?.role !== "instructor") {
    throw new AppErrorHelper("Not allowed", 403);
  }

  if (documentId(session.instructorId).toString() !== currentUser._id.toString()) {
    throw new AppErrorHelper("Session not found", 404);
  }

  await assertInstructorAssignedToProfile(currentUser._id, documentId(session.studentProfileId));
};

const getAllSessionsService = async (queryString, user = null) => {
  let filter = {};

  if (user?.role === "instructor") {
    const profiles = await getAssignedStudentProfilesService(user);
    filter = {
      instructorId: user._id,
      studentProfileId: { $in: profiles.map((profile) => profile._id) },
    };
  }

  const mongooseQuery = Session.find(filter)
    .populate({
      path: "studentProfileId",
      populate: { path: "user", select: "FullName Email UserName" },
    })
    .populate({ path: "instructorId", select: "FullName Email" });

  const features = new ApiFeatures(mongooseQuery, queryString).filter().sort().fields().pagination();
  return await features.mongooseQuery;
};

const getSessionsByStudentService = async (studentProfileId, queryString = {}, currentUser) => {
  if (currentUser?.role === "instructor") {
    await assertInstructorAssignedToProfile(currentUser._id, studentProfileId);
  }
  const mongooseQuery = Session.find({ studentProfileId })
    .populate({
      path: "studentProfileId",
      populate: { path: "user", select: "FullName Email UserName" },
    })
    .populate({ path: "instructorId", select: "FullName Email" });
  const features = new ApiFeatures(mongooseQuery, queryString).sort().fields().pagination();
  return await features.mongooseQuery;
};

const getSessionsByInstructorService = async (instructorId, queryString = {}, currentUser) => {
  let filter = { instructorId };
  if (currentUser?.role === "instructor") {
    if (currentUser._id.toString() !== instructorId.toString()) {
      throw new AppErrorHelper("Not allowed", 403);
    }
    const profiles = await getAssignedStudentProfilesService(currentUser);
    filter = {
      ...filter,
      studentProfileId: { $in: profiles.map((profile) => profile._id) },
    };
  }
  const mongooseQuery = Session.find(filter)
    .populate({
      path: "studentProfileId",
      populate: { path: "user", select: "FullName Email UserName" },
    })
    .populate({ path: "instructorId", select: "FullName Email" });
  const features = new ApiFeatures(mongooseQuery, queryString).sort().fields().pagination();
  return await features.mongooseQuery;
};

const UpdateSessionByIdService = async (SessionId, data, currentUser) => {
  // Fetch the current state first so we can detect a meeting-link add/change.
  const oldSession = await Session.findById(SessionId);
  if (!oldSession) {
    throw new AppErrorHelper("Session not found ! ", 404);
  }
  await assertCanManageSession(currentUser, oldSession);

  const options = { new: true, runValidators: true };
  const session = await Session.findByIdAndUpdate(SessionId, data, options);

  if (!session) {
    throw new AppErrorHelper("Session not found ! ", 404);
  }

  if ("StudentAttended" in data) {
    recalculateAttendanceStreakService(session.studentProfileId).catch(() => {});
  }

  // Notify student + parents when the meeting link is newly added or changed.
  const oldLink = oldSession.meetingLink || "";
  const newLink = session.meetingLink || "";
  if (newLink && newLink !== oldLink) {
    const studentProfile = await StudentProfile.findById(session.studentProfileId);
    await notifyMeetingLink(studentProfile, session, {
      type: "schedule_updated",
      action: oldLink ? "updated" : "added",
    });
  }

  return session;
};

const deleteSessionByIdService = async (SessionId, currentUser) => {
  const existingSession = await Session.findById(SessionId);
  if (!existingSession) {
    throw new AppErrorHelper("Session not found!", 404);
  }
  await assertCanManageSession(currentUser, existingSession);

  const session = await Session.findByIdAndDelete(SessionId);

  if (!session) {
    throw new AppErrorHelper("Session not found!", 404);
  }
  return session;
};

// ─── Soft delete ─────────────────────────────────────────────────────────────
const softDeleteSessionService = async (sessionId, currentUser) => {
  const existingSession = await Session.findById(sessionId);
  if (!existingSession) throw new AppErrorHelper("Session not found!", 404);
  await assertCanManageSession(currentUser, existingSession);

  const session = await Session.findByIdAndUpdate(sessionId, { deletedAt: new Date() }, { new: true });
  if (!session) throw new AppErrorHelper("Session not found!", 404);
  return session;
};

// ─── Calendar export (returns raw session list for ics conversion) ─────────────
const getCalendarSessionsService = async (user) => {
  let profileIds = [];

  if (user.role === "student") {
    const profile = await StudentProfile.findOne({ user: user._id });
    if (profile) profileIds = [profile._id];
    return await Session.find({ studentProfileId: { $in: profileIds }, date: { $gte: new Date() } })
      .select("title description date")
      .lean();
  }

  if (user.role === "parent") {
    const profiles = await StudentProfile.find({ parents: user._id }, { _id: 1 });
    profileIds = profiles.map((p) => p._id);
    return await Session.find({ studentProfileId: { $in: profileIds }, date: { $gte: new Date() } })
      .select("title description date")
      .lean();
  }

  if (user.role === "instructor") {
    const profiles = await getAssignedStudentProfilesService(user);
    return await Session.find({
      instructorId: user._id,
      studentProfileId: { $in: profiles.map((profile) => profile._id) },
      date: { $gte: new Date() },
    })
      .select("title description date")
      .lean();
  }

  return [];
};

// ─── Auto-complete sessions that ended 2+ hours ago ──────────────────────────
const autoCompleteStaleSessionsService = async () => {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const result = await Session.updateMany({ status: "pending", date: { $lt: twoHoursAgo }, deletedAt: null }, { $set: { status: "completed" } });
  return result.modifiedCount;
};

// ─── Parent: upcoming sessions for a specific child ──────────────────────────
const getParentStudentSessionsService = async (parentUserId, studentProfileId, queryString = {}) => {
  const allowed = await StudentProfile.findOne({ _id: studentProfileId, parents: parentUserId });
  if (!allowed) throw new AppErrorHelper("Not allowed to view this child's sessions", 403);

  const now = new Date();
  const query = Session.find({ studentProfileId, date: { $gte: now } })
    .populate({ path: "instructorId", select: "FullName" })
    .sort("date");

  const features = new ApiFeatures(query, queryString).pagination();
  return await features.mongooseQuery;
};

export {
  createSessionService,
  createBulkSessionsService,
  getAllSessionsService,
  getSessionsByInstructorService,
  getSessionByIdService,
  getSessionsByStudentService,
  UpdateSessionByIdService,
  deleteSessionByIdService,
  getMyAllSessionsService,
  getMySessionByIdService,
  getMyStudentsService,
  softDeleteSessionService,
  getCalendarSessionsService,
  autoCompleteStaleSessionsService,
  getParentStudentSessionsService,
};
