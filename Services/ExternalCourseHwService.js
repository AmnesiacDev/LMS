import AppErrorHelper from "../Utilities/AppErrorHelper.js";
import ApiFeatures from "../Utilities/ApiFeatures.js";
import ExternalCourse from "../Models/externalCourse.js";
import StudentProfile from "../Models/studentProfile.js";
import ExternalHW from "../Models/externalHw.js";
import mongoose from "mongoose";

const getAllExternalHWService = async (queryString = {}) => {
  const features = new ApiFeatures(ExternalHW.find({}), queryString) 
    .filter()
    .fields()
    .sort()
    .pagination();

  return await features.mongooseQuery;
};

const getExternalHwByIdService = async (hwId) => {
  const hw = await ExternalHW.findById(hwId);

  if (!hw) {
    throw new AppErrorHelper("Homework not found!", 404);
  }

  return hw;
};

// ─── Get MY HWs (student or parent) ───────────────────────────────────
const getMyExternalHWService = async (user, queryString = {}) => {
  let mongooseQuery;

  if (user.role === "student") {
    const studentProfile = await StudentProfile.findOne({ user: user._id }, { _id: 1 });
    if (!studentProfile) {
      return [];
    }

    const courses = await ExternalCourse.find({ studentProfileId: studentProfile._id }, { _id: 1 });
    const courseIds = courses.map((c) => c._id);

    mongooseQuery = ExternalHW.find({ externalCourse: { $in: courseIds } });
  } else if (user.role === "parent") {
    const childrenProfiles = await StudentProfile.find({ parents: user._id }, { _id: 1 });

    if (!childrenProfiles.length) {
      return [];
    }

    const childrenIds = childrenProfiles.map((profile) => profile._id);

    const courses = await ExternalCourse.find({ studentProfileId: { $in: childrenIds } }, { _id: 1 });

    const courseIds = courses.map((c) => c._id);

    mongooseQuery = ExternalHW.find({ externalCourse: { $in: courseIds } });
  } else {
    throw new AppErrorHelper("Not allowed", 403);
  }

  const features = new ApiFeatures(mongooseQuery, queryString).filter().sort().fields().pagination();

  return await features.mongooseQuery;
};

// ─── Get HWs by Course ID ─────────────────────────────────────────────
const getExternalHWByCourseService = async (courseId, queryString = {}) => {
  // Make sure the course exists first
  const course = await ExternalCourse.findById(courseId);
  if (!course) {
    throw new AppErrorHelper("Course not found!", 404);
  }

  const features = new ApiFeatures(ExternalHW.find({ externalCourse: courseId }), queryString).filter().sort().fields().pagination();

  return await features.mongooseQuery;
};

const createExternalHwService = async (data) => {
  const { title, description, dueDate, notes, externalCourse, submissionLinks, category } = data;

  const course = await ExternalCourse.findById(externalCourse);
  if (!course) {
    throw new AppErrorHelper("Course not found!", 404);
  }

  if (!dueDate) {
    throw new AppErrorHelper("Due date is required!", 400);
  }

  const hw = await ExternalHW.create({
    title,
    description,
    dueDate,
    notes,
    externalCourse,
    submissionLinks,
    category,
  });

  return hw;
};

const getMyExternalHwByIdService = async (user, hwId) => {
  const hw = await ExternalHW.findById(hwId);

  if (!hw) {
    throw new AppErrorHelper("Homework not found!", 404);
  }

  // Get the course this HW belongs to, so we can check ownership
  const course = await ExternalCourse.findById(hw.externalCourse);

  if (!course) {
    throw new AppErrorHelper("Course not found!", 404);
  }

  if (user.role === "student") {
    const studentProfile = await StudentProfile.findOne({ user: user._id }, { _id: 1 });
    if (!studentProfile || course.studentProfileId.toString() !== studentProfile._id.toString()) {
      throw new AppErrorHelper("Not allowed!", 403);
    }
  } else if (user.role === "parent") {
    const childProfile = await StudentProfile.findOne({
      _id: course.studentProfileId,
      parents: new mongoose.Types.ObjectId(user._id),
    });

    if (!childProfile) {
      throw new AppErrorHelper("Not allowed!", 403);
    }
  } else {
    throw new AppErrorHelper("Not allowed!", 403);
  }

  return hw;
};

const updateExternalHwService = async (hwId, data) => {
  // Prevent manually overriding these — the pre("save") hook manages them
  delete data.isSubmitted;
  delete data.submissionDate;

  const hw = await ExternalHW.findByIdAndUpdate(hwId, data, {
    new: true,
    runValidators: true,
  });

  if (!hw) {
    throw new AppErrorHelper("Homework not found!", 404);
  }

  return hw;
};

const deleteExternalHwService = async (hwId) => {
  const hw = await ExternalHW.findByIdAndDelete(hwId);

  if (!hw) {
    throw new AppErrorHelper("Homework not found!", 404);
  }

  return hw;
};

const markExternalHwCompleteService = async (hwId) => {
  const hw = await ExternalHW.findById(hwId);

  if (!hw) {
    throw new AppErrorHelper("Homework not found!", 404);
  }

  if (hw.status === "Completed" || hw.status === "Late submission") {
    throw new AppErrorHelper("Homework is already submitted!", 400);
  }

  if (hw.status === "Canceled") {
    throw new AppErrorHelper("Cannot complete a canceled homework!", 400);
  }

  hw.status = "Completed";
  await hw.save();

  return hw;
};

export { getAllExternalHWService, getExternalHwByIdService, getMyExternalHWService, getExternalHWByCourseService, getMyExternalHwByIdService, createExternalHwService, updateExternalHwService, deleteExternalHwService, markExternalHwCompleteService };
