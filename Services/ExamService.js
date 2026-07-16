import AppErrorHelper from "../Utilities/AppErrorHelper.js";
import ApiFeatures from "../Utilities/ApiFeatures.js";
import Exam from "../Models/exam.js";
import StudentProfile from "../Models/studentProfile.js";
import { notifyStudentAndParents } from "./NotificationHelpers.js";
import mongoose from "mongoose";

// Shared exam-result notification to student + parents (best-effort)
const notifyExamResult = (studentProfileId, exam, sender) => {
  const scoreText =
    exam.score !== undefined && exam.score !== null
      ? ` — score ${exam.score}${exam.totalMark ? `/${exam.totalMark}` : ""}`
      : "";
  notifyStudentAndParents(studentProfileId, {
    type: "exam_result",
    link: "/exams",
    sender,
    studentTitle: `📊 Exam result: ${exam.title}`,
    studentMessage: `Your exam "${exam.title}" has been recorded${scoreText}.`,
    parentTitle: (name) => `📊 Exam result for ${name}`,
    parentMessage: (name) => `${name}'s exam "${exam.title}" has been recorded${scoreText}.`,
  }).catch(() => {});
};

const createExamService = async (data) => {
  const { title, description, totalMark, passingMark, score, date, createdBy, studentProfileId, studentId } = { ...data };

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

  const exam = await Exam.create({
    title,
    description,
    totalMark,
    passingMark,
    score,
    date,
    createdBy,
    studentProfileId: resolvedStudentProfileId,
  });

  notifyExamResult(resolvedStudentProfileId, exam, createdBy);

  return exam;
};

const getMyExamByIdService = async (user, examId) => {
  const exam = await Exam.findById(examId)
    .populate({ path: "studentProfileId", select: "user grade", populate: { path: "user", select: "FullName UserName" } })
    .populate("createdBy", "FullName UserName");

  if (!exam) {
    throw new AppErrorHelper("Exam not found", 404);
  }

  if (user.role === "student") {
    const studentProfile = await StudentProfile.findOne({ user: user._id });
    if (!studentProfile || exam.studentProfileId._id.toString() !== studentProfile._id.toString()) {
      throw new AppErrorHelper("Not allowed !", 403);
    }
  } else if (user.role === "parent") {
    const childProfile = await StudentProfile.findOne({
      _id: exam.studentProfileId._id,
      parents: new mongoose.Types.ObjectId(user._id),
    });

    if (!childProfile) {
      throw new AppErrorHelper("Not allowed !", 403);
    }
  } else {
    throw new AppErrorHelper("Not allowed", 403);
  }

  return exam;
};

const getMyExamsService = async (user, queryString) => {
  let mongooseQuery;

  if (user.role === "student") {
    const studentProfile = await StudentProfile.findOne({ user: user._id });
    if (!studentProfile) {
      return [];
    }
    mongooseQuery = Exam.find({ studentProfileId: studentProfile._id }).populate({ path: "studentProfileId", select: "user grade", populate: { path: "user", select: "FullName UserName" } });
  } else if (user.role === "parent") {
    const childrenProfiles = await StudentProfile.find({ parents: user._id }, { _id: 1 });

    if (!childrenProfiles.length) {
      return [];
    }

    const childrenIds = childrenProfiles.map((profile) => profile._id);

    mongooseQuery = Exam.find({ studentProfileId: { $in: childrenIds } }).populate({ path: "studentProfileId", select: "user grade", populate: { path: "user", select: "FullName UserName" } });
  } else {
    throw new AppErrorHelper("Not allowed", 403);
  }

  const features = new ApiFeatures(mongooseQuery, queryString).filter().sort().fields().pagination();

  return await features.mongooseQuery;
};

const getAllExamsService = async (queryString = {}) => {
  const features = new ApiFeatures(Exam.find({}), queryString).filter().sort().fields().pagination();
  return features.mongooseQuery;
};

const getExamByIdService = async (examId) => {
  const exam = await Exam.findById(examId);

  if (!exam) {
    throw new AppErrorHelper("Exam not found ! ", 404);
  }
  return exam;
};

const getExamsByStudentService = async (studentProfileId, queryString = {}) => {
  const features = new ApiFeatures(Exam.find({ studentProfileId }), queryString).sort().fields().pagination();
  return await features.mongooseQuery;
};

const updateExamService = async (examId, data) => {
  const options = {
    new: true,
    runValidators: true,
  };

  const updateData = { ...data };

  if (updateData.studentId) {
    const studentProfile = await StudentProfile.findOne({ user: updateData.studentId });
    if (!studentProfile) {
      throw new AppErrorHelper("Student profile not found!", 404);
    }
    updateData.studentProfileId = studentProfile._id;
    delete updateData.studentId;
  }

  if (updateData.student && !updateData.studentProfileId) {
    const studentProfile = await StudentProfile.findById(updateData.student);
    if (!studentProfile) {
      throw new AppErrorHelper("Student profile not found!", 404);
    }
    updateData.studentProfileId = studentProfile._id;
    delete updateData.student;
  }

  const exam = await Exam.findByIdAndUpdate(examId, updateData, options);

  if (!exam) {
    throw new AppErrorHelper("Exam not found ! ", 404);
  }

  // Re-notify when a score is (re)recorded on update
  if (updateData.score !== undefined && updateData.score !== null) {
    notifyExamResult(exam.studentProfileId, exam, exam.createdBy);
  }

  return exam;
};

const deleteExamService = async (examId) => {
  const deletedExam = await Exam.findByIdAndDelete(examId);

  if (!deletedExam) {
    throw new AppErrorHelper("Exam not found ! ", 404);
  }

  return deletedExam;
};

export {
  createExamService,
  getMyExamsService,
  getMyExamByIdService,
  getAllExamsService,
  getExamByIdService,
  getExamsByStudentService,
  updateExamService,
  deleteExamService,
};
