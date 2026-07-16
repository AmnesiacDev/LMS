import AppErrorHelper from "../Utilities/AppErrorHelper.js";
import ApiFeatures from "../Utilities/ApiFeatures.js";
import ExternalCourse from "../Models/externalCourse.js";
import StudentProfile from "../Models/studentProfile.js";
import ExternalHW from "../Models/externalHw.js";
import mongoose from "mongoose";

const STAFF_ROLES = new Set(["admin", "instructor"]);
const HOMEWORK_UPDATE_FIELDS = ["title", "description", "dueDate", "notes", "externalCourse", "submissionLinks", "status", "category"];

const pickAllowedUpdateFields = (data, allowedFields) => Object.fromEntries(allowedFields.filter((field) => Object.prototype.hasOwnProperty.call(data, field)).map((field) => [field, data[field]]));

const getReferenceId = (reference) => reference?._id ?? reference;

const getManagedCourseIds = async (user) => {
  if (STAFF_ROLES.has(user?.role)) {
    return null;
  }

  if (user?.role !== "parent") {
    throw new AppErrorHelper("Not allowed!", 403);
  }

  const profileIds = await StudentProfile.distinct("_id", { parents: user._id });
  return ExternalCourse.distinct("_id", { studentProfileId: { $in: profileIds } });
};

const assertCourseIsManaged = (courseId, managedCourseIds) => {
  if (managedCourseIds === null) {
    return;
  }

  const normalizedCourseId = getReferenceId(courseId).toString();
  const isManaged = managedCourseIds.some((managedId) => managedId.toString() === normalizedCourseId);

  if (!isManaged) {
    throw new AppErrorHelper("Not allowed!", 403);
  }
};

const getAllExternalHWService = async (queryString = {}) => {
  const features = new ApiFeatures(ExternalHW.find({}), queryString).filter().fields().sort().pagination();

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

    mongooseQuery = ExternalHW.find({
      $and: [{ externalCourse: { $in: courseIds } }],
    });
  } else if (user.role === "parent") {
    const childrenProfiles = await StudentProfile.find({ parents: user._id }, { _id: 1 });

    if (!childrenProfiles.length) {
      return [];
    }

    const childrenIds = childrenProfiles.map((profile) => profile._id);

    const courses = await ExternalCourse.find({ studentProfileId: { $in: childrenIds } }, { _id: 1 });

    const courseIds = courses.map((c) => c._id);

    mongooseQuery = ExternalHW.find({
      $and: [{ externalCourse: { $in: courseIds } }],
    });
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

const createExternalHwService = async (user, data) => {
  const { title, description, dueDate, notes, externalCourse, submissionLinks, category } = data;

  const course = await ExternalCourse.findById(externalCourse);
  if (!course) {
    throw new AppErrorHelper("Course not found!", 404);
  }

  const managedCourseIds = await getManagedCourseIds(user);
  assertCourseIsManaged(course._id, managedCourseIds);

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

const updateExternalHwService = async (user, hwId, data) => {
  const updateData = pickAllowedUpdateFields(data, HOMEWORK_UPDATE_FIELDS);

  if (Object.keys(updateData).length === 0) {
    throw new AppErrorHelper("No valid homework fields to update!", 400);
  }

  // Prevent manually overriding these — the pre("save") hook manages them
  delete updateData.isSubmitted;
  delete updateData.submissionDate;

  const existingHw = await ExternalHW.findById(hwId);
  if (!existingHw) {
    throw new AppErrorHelper("Homework not found!", 404);
  }

  const managedCourseIds = await getManagedCourseIds(user);
  assertCourseIsManaged(existingHw.externalCourse, managedCourseIds);

  if (updateData.externalCourse) {
    const targetCourse = await ExternalCourse.findById(updateData.externalCourse);
    if (!targetCourse) {
      throw new AppErrorHelper("Course not found!", 404);
    }
    assertCourseIsManaged(targetCourse._id, managedCourseIds);
  }

  const ownershipFilter = managedCourseIds === null ? { _id: hwId } : { _id: hwId, externalCourse: { $in: managedCourseIds } };
  const hw = await ExternalHW.findOneAndUpdate(ownershipFilter, updateData, {
    new: true,
    runValidators: true,
  });

  if (!hw) {
    throw new AppErrorHelper("Not allowed!", 403);
  }

  return hw;
};

const deleteExternalHwService = async (user, hwId) => {
  const existingHw = await ExternalHW.findById(hwId);
  if (!existingHw) {
    throw new AppErrorHelper("Homework not found!", 404);
  }

  const managedCourseIds = await getManagedCourseIds(user);
  assertCourseIsManaged(existingHw.externalCourse, managedCourseIds);

  const ownershipFilter = managedCourseIds === null ? { _id: hwId } : { _id: hwId, externalCourse: { $in: managedCourseIds } };
  const hw = await ExternalHW.findOneAndDelete(ownershipFilter);

  if (!hw) {
    throw new AppErrorHelper("Not allowed!", 403);
  }

  return hw;
};

const markExternalHwCompleteService = async (user, hwId) => {
  if (user?.role !== "student") {
    throw new AppErrorHelper("Not allowed!", 403);
  }

  const hw = await ExternalHW.findById(hwId);

  if (!hw) {
    throw new AppErrorHelper("Homework not found!", 404);
  }

  const studentProfile = await StudentProfile.findOne({ user: user._id }, { _id: 1 });
  if (!studentProfile) {
    throw new AppErrorHelper("Not allowed!", 403);
  }

  const studentCourseIds = await ExternalCourse.distinct("_id", {
    studentProfileId: studentProfile._id,
  });
  assertCourseIsManaged(hw.externalCourse, studentCourseIds);

  if (hw.status === "Completed" || hw.status === "Late submission") {
    throw new AppErrorHelper("Homework is already submitted!", 400);
  }

  if (hw.status === "Canceled") {
    throw new AppErrorHelper("Cannot complete a canceled homework!", 400);
  }

  const submissionDate = new Date();
  const isLate = hw.dueDate && submissionDate > hw.dueDate;
  const completion = {
    status: isLate ? "Late submission" : "Completed",
    isSubmitted: true,
    submissionDate,
    notes: isLate ? "Submitted late" : "Submitted before due date",
  };

  const completedHw = await ExternalHW.findOneAndUpdate(
    {
      _id: hwId,
      externalCourse: { $in: studentCourseIds },
      status: hw.status,
    },
    { $set: completion },
    { new: true, runValidators: true },
  );

  if (!completedHw) {
    const currentHw = await ExternalHW.findById(hwId);
    if (!currentHw) {
      throw new AppErrorHelper("Homework not found!", 404);
    }

    assertCourseIsManaged(currentHw.externalCourse, studentCourseIds);

    if (currentHw.status === "Completed" || currentHw.status === "Late submission") {
      throw new AppErrorHelper("Homework is already submitted!", 400);
    }

    if (currentHw.status === "Canceled") {
      throw new AppErrorHelper("Cannot complete a canceled homework!", 400);
    }

    throw new AppErrorHelper("Homework changed; try again.", 409);
  }

  return completedHw;
};

export { getAllExternalHWService, getExternalHwByIdService, getMyExternalHWService, getExternalHWByCourseService, getMyExternalHwByIdService, createExternalHwService, updateExternalHwService, deleteExternalHwService, markExternalHwCompleteService };
