import mongoose from "mongoose";
import Session from "../Models/Session.js";
import User from "../Models/user.js";
import StudentProfile from "../Models/studentProfile.js";
import AppErrorHelper from "../Utilities/AppErrorHelper.js";
import ApiFeatures from "../Utilities/ApiFeatures.js";

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

  return await Session.create({
    title: title,
    description: description,
    recapVideoLinks: recapVideoLinks || [],
    attachmentsLinks: attachmentsLinks || [],
    studentProfileId: studentProfile._id,
    instructorId: instructor._id,
    date: date,
    StudentAttended: StudentAttended ?? true,
  });
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

  throw new AppErrorHelper("Not allowed!", 403);
};

const getAllSessionsService = async (queryString) => {
  const mongooseQuery = Session.find({})
    .populate({
      path: "studentProfileId",
      populate: { path: "user", select: "FullName Email UserName" }
    })
    .populate({ path: "instructorId", select: "FullName Email" });
  const features = new ApiFeatures(mongooseQuery, queryString).filter().sort().fields().pagination();

  const sessions = await features.mongooseQuery;
  return sessions;
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
  const options = {
    new: true,
    runValidators: true,
  };
  const session = await Session.findByIdAndUpdate(SessionId, data, options);

  if (!session) {
    throw new AppErrorHelper("Session not found ! ", 404);
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
};
