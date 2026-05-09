import Submission from "../Models/Submission.js";
import Task from "../Models/Task.js";
import User from "../Models/user.js";
import StudentProfile from "../Models/studentProfile.js";
import ApiFeatures from "../Utilities/ApiFeatures.js";
import AppErrorHelper from "../Utilities/AppErrorHelper.js";
import mongoose from "mongoose";
import { uploadToCloudinary, deleteFromCloudinary } from "../Configs/cloudinary.js";

const VALID_STATUSES = ["Pending", "Completed", "Reviewed", "Resubmitted", "Late submission"];

const getDocumentId = (value) => {
  if (!value) return null;
  if (value._id) return value._id.toString();
  return value.toString();
};

const createSubmissionService = async (data, userData) => {
  if (!data) {
    throw new AppErrorHelper("Data is missing!", 400);
  }

  const { taskId, studentProfileId, studentId, Task_links, note } = data;

  const task = await Task.findById(taskId);
  if (!task) {
    throw new AppErrorHelper("Task not found!", 404);
  }

  let resolvedStudentProfileId = studentProfileId;

  if (!resolvedStudentProfileId && studentId) {
    const studentProfile = await StudentProfile.findOne({ user: studentId });
    if (!studentProfile) {
      throw new AppErrorHelper("Student profile not found!", 404);
    }
    resolvedStudentProfileId = studentProfile._id;
  }

  if (userData?.role === "student") {
    const ownProfile = await StudentProfile.findOne({ user: userData._id }, { _id: 1 });
    if (!ownProfile) {
      throw new AppErrorHelper("Student profile not found!", 404);
    }

    if (resolvedStudentProfileId && getDocumentId(resolvedStudentProfileId) !== ownProfile._id.toString()) {
      throw new AppErrorHelper("You can only submit your own task!", 403);
    }

    resolvedStudentProfileId = ownProfile._id;
  } else if (userData?.role === "parent") {
    throw new AppErrorHelper("Parents can view homework, but students must submit it themselves.", 403);
  }

  if (!resolvedStudentProfileId) {
    throw new AppErrorHelper("Student profile id is required!", 400);
  }

  const studentProfile = await StudentProfile.findById(resolvedStudentProfileId);
  if (!studentProfile) {
    throw new AppErrorHelper("Student profile not found!", 404);
  }

  const taskStudentProfileId = getDocumentId(task.studentProfileId);
  const submissionStudentProfileId = getDocumentId(resolvedStudentProfileId);

  if (taskStudentProfileId && taskStudentProfileId !== submissionStudentProfileId) {
    throw new AppErrorHelper("Task does not belong to this student profile!", 400);
  }

  const existing = await Submission.findOne({
    task: taskId,
    studentProfileId: resolvedStudentProfileId,
  });

  if (existing) {
    throw new AppErrorHelper("Submission already exists!", 400);
  }

  const submission = await Submission.create({
    task: taskId,
    studentProfileId: resolvedStudentProfileId,
    Task_links: Task_links || [],
    note,
    status: "Pending",
  });

  // Auto-complete the task when a submission is created
  await Task.findByIdAndUpdate(taskId, { status: "completed" });

  return submission;
};

const getAllSubmissionsService = async (queryString = {}) => {
  const features = new ApiFeatures(Submission.find({}), queryString).filter().sort().fields().pagination();

  return await features.mongooseQuery;
};



const getSubmissionByIdService = async (submissionId) => {
  const submission = await Submission.findById(submissionId);

  if (!submission) {
    throw new AppErrorHelper("Submission not found!", 404);
  }

  return submission;
};


const getSubmissionsByTaskIdService = async (taskId, queryString = {}) => {
  const task = await Task.findById(taskId);
  if (!task) {
    throw new AppErrorHelper("Task not found!", 404);
  }

  const features = new ApiFeatures(Submission.find({ task: taskId }), queryString).filter().sort().fields().pagination();

  return await features.mongooseQuery;
};



const getSubmissionsByStudentIdService = async (studentProfileId, queryString = {}) => {
  if (!mongoose.Types.ObjectId.isValid(studentProfileId)) {
    throw new AppErrorHelper("Invalid student profile id!", 400);
  }

  const features = new ApiFeatures(Submission.find({ studentProfileId }), queryString).filter().sort().fields().pagination();

  return await features.mongooseQuery;
};



const updateSubmissionByIdService = async (submissionId, data) => {
  const { Task_links, note } = data;

  const safeUpdate = {};

  if (Task_links !== undefined) safeUpdate.Task_links = Task_links;

  if (note !== undefined) safeUpdate.note = note;

  const submission = await Submission.findByIdAndUpdate(submissionId, safeUpdate, { new: true, runValidators: true });

  if (!submission) {
    throw new AppErrorHelper("Submission not found!", 404);
  }

  return submission;
};

const deleteSubmissionByIdService = async (submissionId) => {
  const submission = await Submission.findByIdAndDelete(submissionId);

  if (!submission) {
    throw new AppErrorHelper("Submission not found!", 404);
  }

  return submission;
};

const updateSubmissionStatusService = async (id, status) => {
  if (!VALID_STATUSES.includes(status)) {
    throw new AppErrorHelper(`Invalid status. Allowed values: ${VALID_STATUSES.join(", ")}`, 400);
  }

  const submission = await Submission.findById(id);
  if (!submission) {
    throw new AppErrorHelper("Submission not found!", 404);
  }

  submission.status = status;
  return await submission.save();
};

// ─── Submit task (student action)
const submitTaskService = async (submissionId, links) => {
  const submission = await Submission.findById(submissionId);

  if (!submission) {
    throw new AppErrorHelper("Submission not found!", 404);
  }

  if (!links || links.length === 0) {
    throw new AppErrorHelper("Submission links are required!", 400);
  }

  submission.Task_links = links;
  submission.status = "Completed";

  return await submission.save();
};

const reviewSubmissionService = async (submissionId, reviewData) => {
  const submission = await Submission.findById(submissionId);
  if (!submission) {
    throw new AppErrorHelper("Submission not found!", 404);
  }

  submission.review.score = reviewData.score ?? submission.review.score;
  submission.review.comment = reviewData.comment ?? submission.review.comment;
  submission.review.reviewAt = new Date();

  submission.status = "Reviewed";
  return await submission.save();
};

const getSubmissionStatsByStudentIdService = async (studentProfileId) => {
  if (!mongoose.Types.ObjectId.isValid(studentProfileId)) {
    throw new AppErrorHelper("Invalid student profile id!", 400);
  }

  const stats = await Submission.aggregate([
    { $match: { studentProfileId: new mongoose.Types.ObjectId(studentProfileId) } },
    {
      $group: {
        _id: null,
        totalSubmissions: { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ["$status", "Completed"] }, 1, 0] } },
        pending: { $sum: { $cond: [{ $eq: ["$status", "Pending"] }, 1, 0] } },
        reviewed: { $sum: { $cond: [{ $eq: ["$status", "Reviewed"] }, 1, 0] } },
        resubmitted: { $sum: { $cond: [{ $eq: ["$status", "Resubmitted"] }, 1, 0] } },
        late: { $sum: { $cond: [{ $eq: ["$status", "Late submission"] }, 1, 0] } },
      },
    },
  ]);

  return stats[0] || {};
};

const getAllMySubmissionsService = async (userData, queryString = {}) => {
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

  const features = new ApiFeatures(Submission.find({ studentProfileId: { $in: profileIds } }), queryString)
    .filter()
    .sort()
    .fields()
    .pagination();

  return await features.mongooseQuery;
};

const getMySubmissionService = async (userData, submissionId) => {
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

  const submission = await Submission.findOne({ _id: submissionId, studentProfileId: { $in: profileIds } });
  if (!submission) {
    throw new AppErrorHelper("Submission not found!", 404);
  }
  return submission;
};

const getMySubmissionStatsService = async (userData) => {
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
      return {};
    }
    profileIds = childrenProfiles.map((profile) => profile._id);
  } else {
    throw new AppErrorHelper("Not allowed", 403);
  }

  const stats = await Submission.aggregate([
    { $match: { studentProfileId: { $in: profileIds } } },
    {
      $group: {
        _id: null,
        totalSubmissions: { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ["$status", "Completed"] }, 1, 0] } },
        pending: { $sum: { $cond: [{ $eq: ["$status", "Pending"] }, 1, 0] } },
        reviewed: { $sum: { $cond: [{ $eq: ["$status", "Reviewed"] }, 1, 0] } },
        resubmitted: { $sum: { $cond: [{ $eq: ["$status", "Resubmitted"] }, 1, 0] } },
        late: { $sum: { $cond: [{ $eq: ["$status", "Late submission"] }, 1, 0] } },
      },
    },
  ]);

  return stats[0] || {};
};

const getTasksDueDateBucketsService = async (studentProfileId) => {
  const now = new Date();
  const next3Days = new Date();
  next3Days.setDate(now.getDate() + 3);

  return await Task.aggregate([
    { $match: { studentProfileId: new mongoose.Types.ObjectId(studentProfileId) } },
    {
      $addFields: {
        category: {
          $switch: {
            branches: [
              { case: { $lt: ["$dueDate", now] }, then: "overdue" },
              { case: { $lte: ["$dueDate", next3Days] }, then: "dueSoon" },
            ],
            default: "future",
          },
        },
      },
    },
    {
      $group: {
        _id: "$category",
        tasks: { $push: "$$ROOT" },
        count: { $sum: 1 },
      },
    },
  ]);
};

// ─── Upload files to Cloudinary and attach to submission ─────────────────────
const uploadSubmissionFilesService = async (submissionId, files, userData) => {
  const submission = await Submission.findById(submissionId);
  if (!submission) throw new AppErrorHelper("Submission not found!", 404);

  // Students can only upload to their own submission
  if (userData.role === "student") {
    const profile = await StudentProfile.findOne({ user: userData._id }, { _id: 1 }).lean();
    if (!profile || submission.studentProfileId.toString() !== profile._id.toString()) {
      throw new AppErrorHelper("Not allowed to upload to this submission!", 403);
    }
  }

  if (!files || files.length === 0) throw new AppErrorHelper("No files provided!", 400);

  const uploaded = await Promise.all(
    files.map((file) =>
      uploadToCloudinary(file.buffer, "submissions", {
        public_id: `${submissionId}_${Date.now()}_${file.originalname.replace(/\s+/g, "_")}`,
      }).then((result) => ({
        name: file.originalname,
        url: result.url,
        publicId: result.publicId,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      }))
    )
  );

  submission.fileAttachments.push(...uploaded);
  await submission.save({ validateBeforeSave: false });

  return submission;
};

// ─── Remove a specific file attachment ───────────────────────────────────────
const deleteSubmissionFileService = async (submissionId, publicId) => {
  const submission = await Submission.findById(submissionId);
  if (!submission) throw new AppErrorHelper("Submission not found!", 404);

  const idx = submission.fileAttachments.findIndex((f) => f.publicId === publicId);
  if (idx === -1) throw new AppErrorHelper("File not found in this submission!", 404);

  await deleteFromCloudinary(publicId);
  submission.fileAttachments.splice(idx, 1);
  await submission.save({ validateBeforeSave: false });

  return submission;
};

export {
  createSubmissionService,
  getAllSubmissionsService,
  getSubmissionByIdService,
  getSubmissionsByTaskIdService,
  getSubmissionsByStudentIdService,
  getAllMySubmissionsService,
  getMySubmissionService,
  getMySubmissionStatsService,
  updateSubmissionByIdService,
  updateSubmissionStatusService,
  deleteSubmissionByIdService,
  submitTaskService,
  reviewSubmissionService,
  getSubmissionStatsByStudentIdService,
  getTasksDueDateBucketsService,
  uploadSubmissionFilesService,
  deleteSubmissionFileService,
};
