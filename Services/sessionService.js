import mongoose from "mongoose";
import Session from "../Models/Session.js";
import User from "../Models/user.js";
import StudentProfile from "../Models/studentProfile.js";
import AppErrorHelper from "../Utilities/AppErrorHelper.js";
import ApiFeatures from "../Utilities/ApiFeatures.js";
import { recalculateAttendanceStreakService } from "./studentProfileServices.js";

const createSessionService = async (data) => {
  const { title, description, recapVideoLinks, attachmentsLinks, studentProfileId, instructorId, date, StudentAttended } = data;

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

  const session = await Session.create({
    title: title,
    description: description,
    recapVideoLinks: recapVideoLinks || [],
    attachmentsLinks: attachmentsLinks || [],
    studentProfileId: studentProfile._id,
    instructorId: instructor._id,
    date: date,
    StudentAttended: StudentAttended ?? true,
  });

  recalculateAttendanceStreakService(session.studentProfileId).catch(() => {});

  return session;
};

const getSessionByIdService = async (SessionId) => {
  const session = await Session.findById(SessionId).populate([
    { path: "studentProfileId" },
    { path: "instructorId", select: "FullName Email" },
  ]);

  if (!session) {
    throw new AppErrorHelper("Session not found!", 404);
  }
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
    mongooseQuery = Session.find({ instructorId: user._id })
      .populate({
        path: "studentProfileId",
        populate: { path: "user", select: "FullName Email UserName" }
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
    return session;
  }

  throw new AppErrorHelper("Not allowed!", 403);
};

const getMyStudentsService = async (user) => {
  if (user.role === "admin") {
    return await StudentProfile.find({}).populate({ path: "user", select: "FullName Email UserName" });
  }

  if (user.role !== "instructor") {
    throw new AppErrorHelper("Not allowed!", 403);
  }

  const profileIds = await Session.distinct("studentProfileId", { instructorId: user._id });
  if (!profileIds.length) return [];

  return await StudentProfile.find({ _id: { $in: profileIds } })
    .populate({ path: "user", select: "FullName Email UserName" });
};

const getAllSessionsService = async (queryString, user = null) => {
  let filter = {};

  if (user?.role === "instructor") {
    filter = { instructorId: user._id };
  }

  const mongooseQuery = Session.find(filter)
    .populate({
      path: "studentProfileId",
      populate: { path: "user", select: "FullName Email UserName" }
    })
    .populate({ path: "instructorId", select: "FullName Email" });

  const features = new ApiFeatures(mongooseQuery, queryString).filter().sort().fields().pagination();
  return await features.mongooseQuery;
};




const getSessionsByStudentService = async (studentProfileId, queryString = {}) => {
  const mongooseQuery = Session.find({ studentProfileId })
    .populate({
      path: "studentProfileId",
      populate: { path: "user", select: "FullName Email UserName" }
    })
    .populate({ path: "instructorId", select: "FullName Email" });
  const features = new ApiFeatures(mongooseQuery, queryString).sort().fields().pagination();
  return await features.mongooseQuery;
};

const getSessionsByInstructorService = async (instructorId, queryString = {}) => {
  const mongooseQuery = Session.find({ instructorId })
    .populate({
      path: "studentProfileId",
      populate: { path: "user", select: "FullName Email UserName" }
    })
    .populate({ path: "instructorId", select: "FullName Email" });
  const features = new ApiFeatures(mongooseQuery, queryString).sort().fields().pagination();
  return await features.mongooseQuery;
};





const UpdateSessionByIdService = async (SessionId, data) => {
  const options = { new: true, runValidators: true };
  const session = await Session.findByIdAndUpdate(SessionId, data, options);

  if (!session) {
    throw new AppErrorHelper("Session not found ! ", 404);
  }

  if ("StudentAttended" in data) {
    recalculateAttendanceStreakService(session.studentProfileId).catch(() => {});
  }

  return session;
};

const deleteSessionByIdService = async (SessionId) => {
  const session = await Session.findByIdAndDelete(SessionId);

  if (!session) {
    throw new AppErrorHelper("Session not found!", 404);
  }
  return session;
};

// ─── Soft delete ─────────────────────────────────────────────────────────────
const softDeleteSessionService = async (sessionId) => {
  const session = await Session.findByIdAndUpdate(
    sessionId,
    { deletedAt: new Date() },
    { new: true }
  );
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
      .select("title description date").lean();
  }

  if (user.role === "parent") {
    const profiles = await StudentProfile.find({ parents: user._id }, { _id: 1 });
    profileIds = profiles.map((p) => p._id);
    return await Session.find({ studentProfileId: { $in: profileIds }, date: { $gte: new Date() } })
      .select("title description date").lean();
  }

  if (user.role === "instructor") {
    return await Session.find({ instructorId: user._id, date: { $gte: new Date() } })
      .select("title description date").lean();
  }

  return [];
};

// ─── Auto-complete sessions that ended 2+ hours ago ──────────────────────────
const autoCompleteStaleSessionsService = async () => {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const result = await Session.updateMany(
    { status: "pending", date: { $lt: twoHoursAgo }, deletedAt: null },
    { $set: { status: "completed" } }
  );
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
