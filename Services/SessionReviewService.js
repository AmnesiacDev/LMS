import SessionReview from "../Models/SessionReview.js";
import User from "../Models/user.js";
import Session from "../Models/Session.js";
import StudentProfile from "../Models/studentProfile.js";
import AppErrorHelper from "../Utilities/AppErrorHelper.js";
import ApiFeatures from "../Utilities/ApiFeatures.js";
import mongoose from "mongoose";

const createSessionReviewService = async (data) => {
  if (!data) {
    throw new AppErrorHelper("Data is missing!", 400);
  }

  const { sessionId, studentProfileId, studentId, instructorId, notes, Behavior, underStanding, participation, coding } = data;

  const session = await Session.findById(sessionId);
  if (!session) {
    throw new AppErrorHelper("Session not found!", 404);
  }

  const instructor = await User.findById(instructorId);
  if (!instructor) {
    throw new AppErrorHelper("Instructor not found!", 404);
  }

  if (instructor.role !== "instructor") {
    throw new AppErrorHelper("Wrong assignment of roles!", 400);
  }

  let resolvedStudentProfileId = studentProfileId;
  if (!resolvedStudentProfileId && studentId) {
    const studentProfile = await StudentProfile.findOne({ user: studentId });
    if (!studentProfile) {
      throw new AppErrorHelper("Student profile not found!", 404);
    }
    resolvedStudentProfileId = studentProfile._id;
  }

  if (!resolvedStudentProfileId) {
    throw new AppErrorHelper("Student profile id is required!", 400);
  }

  const studentProfile = await StudentProfile.findById(resolvedStudentProfileId);
  if (!studentProfile) {
    throw new AppErrorHelper("Student profile not found!", 404);
  }

  if (!session.studentProfileId || session.studentProfileId.toString() !== resolvedStudentProfileId.toString()) {
    throw new AppErrorHelper("This session does not belong to this student profile", 400);
  }

  if (!session.StudentAttended) {
    throw new AppErrorHelper("Cannot review a session that student did not attend", 400);
  }

  const review = await SessionReview.create({
    session: sessionId,
    studentProfileId: resolvedStudentProfileId,
    Instructor: instructorId,
    notes,
    Behavior,
    underStanding,
    participation,
    coding,
  });

  return review;
};

const getAllSessionReviewsService = async (queryString, user = null) => {
  let filter = {};

  if (user?.role === "instructor") {
    filter = { Instructor: user._id };
  }

  const mongooseQuery = SessionReview.find(filter)
    .populate({
      path: "studentProfileId",
      populate: { path: "user", select: "FullName Email" }
    })
    .populate({ path: "session", select: "title date" })
    .populate({ path: "Instructor", select: "FullName" });

  const features = new ApiFeatures(mongooseQuery, queryString).filter().sort().fields().pagination();
  return await features.mongooseQuery;
};

const getSessionReviewsByStudentService = async (studentProfileId, queryString = {}) => {
  const mongooseQuery = SessionReview.find({ studentProfileId })
    .populate({
      path: "studentProfileId",
      populate: { path: "user", select: "FullName Email" }
    })
    .populate({ path: "session", select: "title date" })
    .populate({ path: "Instructor", select: "FullName" });

  const features = new ApiFeatures(mongooseQuery, queryString).sort().fields().pagination();

  return await features.mongooseQuery;
};

const getSessionReviewsByInstructorService = async (instructorId, queryString = {}) => {
  const features = new ApiFeatures(SessionReview.find({ Instructor: instructorId }), queryString).sort().fields().pagination();

  return await features.mongooseQuery;
};

const getSessionReviewsBySessionService = async (sessionId, queryString = {}) => {
  const features = new ApiFeatures(SessionReview.find({ session: sessionId }), queryString).sort().fields().pagination();

  return await features.mongooseQuery;
};

const updateSessionReviewByIdService = async (reviewId, data) => {
  const review = await SessionReview.findById(reviewId);

  if (!review) {
    throw new AppErrorHelper("Review not found!", 404);
  }

  if (data.Behavior !== undefined) review.Behavior = data.Behavior;
  if (data.underStanding !== undefined) review.underStanding = data.underStanding;
  if (data.participation !== undefined) review.participation = data.participation;
  if (data.coding !== undefined) review.coding = data.coding;
  if (data.notes !== undefined) review.notes = data.notes;

  return await review.save();
};

const deleteSessionReviewByIdService = async (reviewId) => {
  const review = await SessionReview.findByIdAndDelete(reviewId);

  if (!review) {
    throw new AppErrorHelper("Review not found!", 404);
  }

  return review;
};

const getAllMySessionReviewsService = async (userData, queryString = {}) => {
  let profileIds;

  if (userData.role === "student") {
    const studentProfile = await StudentProfile.findOne({ user: userData._id });
    if (!studentProfile) {
      throw new AppErrorHelper("Not allowed", 403);
    }
    profileIds = [studentProfile._id];
  } else if (userData.role === "parent") {
    const childrenProfiles = await StudentProfile.find({ parents: userData._id }, { _id: 1 });
    if (!childrenProfiles || childrenProfiles.length === 0) {
      return [];
    }
    profileIds = childrenProfiles.map((profile) => profile._id);
  } else {
    throw new AppErrorHelper("Not allowed", 403);
  }

  const features = new ApiFeatures(SessionReview.find({ studentProfileId: { $in: profileIds } }), queryString).sort().fields().pagination();
  return await features.mongooseQuery;
};

const getMySessionReviewService = async (userData, reviewId) => {
  let profileIds;

  if (userData.role === "student") {
    const studentProfile = await StudentProfile.findOne({ user: userData._id });
    if (!studentProfile) {
      throw new AppErrorHelper("Not allowed", 403);
    }
    profileIds = [studentProfile._id];
  } else if (userData.role === "parent") {
    const childrenProfiles = await StudentProfile.find({ parents: userData._id }, { _id: 1 });
    if (!childrenProfiles || childrenProfiles.length === 0) {
      return null;
    }
    profileIds = childrenProfiles.map((profile) => profile._id);
  } else {
    throw new AppErrorHelper("Not allowed", 403);
  }

  return await SessionReview.findOne({ _id: reviewId, studentProfileId: { $in: profileIds } });
};

const getMySessionReviewStatsService = async (userData) => {
  let profileIds;

  if (userData.role === "student") {
    const studentProfile = await StudentProfile.findOne({ user: userData._id });
    if (!studentProfile) {
      throw new AppErrorHelper("Not allowed", 403);
    }
    profileIds = [studentProfile._id];
  } else if (userData.role === "parent") {
    const childrenProfiles = await StudentProfile.find({ parents: userData._id }, { _id: 1 });
    if (!childrenProfiles || childrenProfiles.length === 0) {
      return {
        avgOverall: 0,
        avgBehavior: 0,
        avgUnderstanding: 0,
        avgParticipation: 0,
        avgCoding: 0,
        Count: 0,
      };
    }
    profileIds = childrenProfiles.map((profile) => profile._id);
  } else {
    throw new AppErrorHelper("Not allowed", 403);
  }

  const stats = await SessionReview.aggregate([
    {
      $match: { studentProfileId: { $in: profileIds } },
    },
    {
      $group: {
        _id: null,
        avgOverall: { $avg: "$overAllRating" },
        avgBehavior: { $avg: "$Behavior" },
        avgUnderstanding: { $avg: "$underStanding" },
        avgParticipation: { $avg: "$participation" },
        avgCoding: { $avg: "$coding" },
        Count: { $sum: 1 },
      },
    },
  ]);

  return stats[0] || {
    avgOverall: 0,
    avgBehavior: 0,
    avgUnderstanding: 0,
    avgParticipation: 0,
    avgCoding: 0,
    Count: 0,
  };
};

const getStudentReviewStatsService = async (studentProfileId) => {
  const stats = await SessionReview.aggregate([
    {
      $match: { studentProfileId: new mongoose.Types.ObjectId(studentProfileId) },
    },
    {
      $group: {
        _id: null,
        avgOverall: { $avg: "$overAllRating" },
        avgBehavior: { $avg: "$Behavior" },
        avgUnderstanding: { $avg: "$underStanding" },
        avgParticipation: { $avg: "$participation" },
        avgCoding: { $avg: "$coding" },
        Count: { $sum: 1 },
      },
    },
  ]);

  return stats[0] || {}
};

export {
  createSessionReviewService,
  getAllSessionReviewsService,
  getSessionReviewsByStudentService,
  getSessionReviewsByInstructorService,
  getSessionReviewsBySessionService,
  getAllMySessionReviewsService,
  getMySessionReviewService,
  getMySessionReviewStatsService,
  updateSessionReviewByIdService,
  deleteSessionReviewByIdService,
  getStudentReviewStatsService,
};

// const stats = await SessionReview.aggregate([
//   {
//     $match: { Student: mongoose.Types.ObjectId(studentId) }
//   },
//   {
//     $group: {
//       _id: "$Student",
//       avgOverall: { $avg: "$overAllRating" },
//       avgBehavior: { $avg: "$Behavior" },
//       avgUnderstanding: { $avg: "$underStanding" },
//       avgParticipation: { $avg: "$participation" },
//       avgCoding: { $avg: "$coding" },
//       totalSessions: { $sum: 1 }
//     }
//   }
// ]);

// return stats[0] || {};
