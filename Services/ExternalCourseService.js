import AppErrorHelper from "../Utilities/AppErrorHelper.js";
import ApiFeatures from "../Utilities/ApiFeatures.js";
import ExternalCourse from "../Models/externalCourse.js";
import StudentProfile from "../Models/studentProfile.js";
import mongoose from "mongoose";

const STAFF_ROLES = new Set(["admin", "instructor"]);
const COURSE_UPDATE_FIELDS = ["teacher", "subject", "studentProfileId", "studentId", "student", "color"];

const pickAllowedUpdateFields = (data, allowedFields) => Object.fromEntries(allowedFields.filter((field) => Object.prototype.hasOwnProperty.call(data, field)).map((field) => [field, data[field]]));

const getManagedStudentProfileIds = async (user) => {
  if (STAFF_ROLES.has(user?.role)) {
    return null;
  }

  if (user?.role !== "parent") {
    throw new AppErrorHelper("Not allowed !", 403);
  }

  return StudentProfile.distinct("_id", { parents: user._id });
};

const assertProfileIsManaged = (studentProfileId, managedProfileIds) => {
  if (managedProfileIds === null) {
    return;
  }

  const profileId = studentProfileId.toString();
  const isManaged = managedProfileIds.some((managedId) => managedId.toString() === profileId);

  if (!isManaged) {
    throw new AppErrorHelper("Not allowed !", 403);
  }
};

const createExternalCourseService = async (user, data) => {
  const { teacher, subject, studentProfileId, studentId, color } = { ...data };

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

  const managedProfileIds = await getManagedStudentProfileIds(user);
  assertProfileIsManaged(studentProfile._id, managedProfileIds);

  return await ExternalCourse.create({
    teacher: teacher,
    subject: subject,
    createdBy: user._id,
    studentProfileId: resolvedStudentProfileId,
    color: color,
  });
};

const getMyExternalCourseByIdService = async (user, courseId) => {
  const exCourse = await ExternalCourse.findById(courseId)
    .populate({ path: "studentProfileId", select: "user grade", populate: { path: "user", select: "FullName UserName" } })
    .populate("createdBy", "FullName UserName");

  if (!exCourse) {
    throw new AppErrorHelper("Course not found", 404);
  }

  if (user.role === "student") {
    const studentProfile = await StudentProfile.findOne({ user: user._id });
    if (!studentProfile || exCourse.studentProfileId._id.toString() !== studentProfile._id.toString()) {
      throw new AppErrorHelper("Not allowed !", 403);
    }
  } else if (user.role === "parent") {
    const childProfile = await StudentProfile.findOne({
      _id: exCourse.studentProfileId._id,
      parents: new mongoose.Types.ObjectId(user._id),
    });

    if (!childProfile) {
      throw new AppErrorHelper("Not allowed !", 403);
    }
  } else {
    throw new AppErrorHelper("Not allowed", 403);
  }

  return exCourse;
};

const getMyExternalCourseService = async (user, queryString) => {
  let mongooseQuery;

  if (user.role === "student") {
    const studentProfile = await StudentProfile.findOne({ user: user._id });
    if (!studentProfile) {
      return [];
    }
    mongooseQuery = ExternalCourse.find({
      $and: [{ studentProfileId: studentProfile._id }],
    }).populate({ path: "studentProfileId", select: "user grade", populate: { path: "user", select: "FullName UserName" } });
  } else if (user.role === "parent") {
    const childrenProfiles = await StudentProfile.find({ parents: user._id }, { _id: 1 });

    if (!childrenProfiles.length) {
      return [];
    }

    const childrenIds = childrenProfiles.map((profile) => profile._id);

    mongooseQuery = ExternalCourse.find({
      $and: [{ studentProfileId: { $in: childrenIds } }],
    }).populate({ path: "studentProfileId", select: "user grade", populate: { path: "user", select: "FullName UserName" } });
  } else {
    throw new AppErrorHelper("Not allowed", 403);
  }

  const features = new ApiFeatures(mongooseQuery, queryString).filter().sort().fields().pagination();

  return await features.mongooseQuery;
};

const getAllExternalCoursesService = async (queryString = {}) => {
  const features = new ApiFeatures(ExternalCourse.find({}), queryString).filter().sort().fields().pagination();

  return features.mongooseQuery;
};

const getExternalCourseByIdService = async (exCourseId) => {
  const exCourse = await ExternalCourse.findById(exCourseId);

  if (!exCourse) {
    throw new AppErrorHelper("Course not found ! ", 404);
  }
  return exCourse;
};

const getExternalCourseByStudentService = async (studentProfileId, queryString = {}) => {
  const features = new ApiFeatures(ExternalCourse.find({ studentProfileId }), queryString).sort().fields().pagination();
  return await features.mongooseQuery;
};

const updateExternalCourseService = async (user, exCourseId, data) => {
  const options = {
    new: true,
    runValidators: true,
  };

  const updateData = pickAllowedUpdateFields(data, COURSE_UPDATE_FIELDS);

  if (Object.keys(updateData).length === 0) {
    throw new AppErrorHelper("No valid course fields to update!", 400);
  }

  const existingCourse = await ExternalCourse.findById(exCourseId);
  if (!existingCourse) {
    throw new AppErrorHelper("Course not found ! ", 404);
  }

  const managedProfileIds = await getManagedStudentProfileIds(user);
  assertProfileIsManaged(existingCourse.studentProfileId, managedProfileIds);

  if (updateData.studentId) {
    const studentProfile = await StudentProfile.findOne({ user: updateData.studentId });
    if (!studentProfile) {
      throw new AppErrorHelper("Student profile not found!", 404);
    }
    updateData.studentProfileId = studentProfile._id;
    delete updateData.studentId;
  }

  if (updateData.student) {
    if (!updateData.studentProfileId) {
      const studentProfile = await StudentProfile.findById(updateData.student);
      if (!studentProfile) {
        throw new AppErrorHelper("Student profile not found!", 404);
      }
      updateData.studentProfileId = studentProfile._id;
    }
    delete updateData.student;
  }

  if (updateData.studentProfileId) {
    const targetProfile = await StudentProfile.findById(updateData.studentProfileId);
    if (!targetProfile) {
      throw new AppErrorHelper("Student profile not found!", 404);
    }
    assertProfileIsManaged(targetProfile._id, managedProfileIds);
  }

  const ownershipFilter = managedProfileIds === null ? { _id: exCourseId } : { _id: exCourseId, studentProfileId: { $in: managedProfileIds } };
  const exCourse = await ExternalCourse.findOneAndUpdate(ownershipFilter, updateData, options);

  if (!exCourse) {
    throw new AppErrorHelper("Not allowed !", 403);
  }

  return exCourse;
};

const deleteExternalCourseService = async (user, exCourseId) => {
  const existingCourse = await ExternalCourse.findById(exCourseId);
  if (!existingCourse) {
    throw new AppErrorHelper("Course not found ! ", 404);
  }

  const managedProfileIds = await getManagedStudentProfileIds(user);
  assertProfileIsManaged(existingCourse.studentProfileId, managedProfileIds);

  const ownershipFilter = managedProfileIds === null ? { _id: exCourseId } : { _id: exCourseId, studentProfileId: { $in: managedProfileIds } };
  const deletedExCourse = await ExternalCourse.findOneAndDelete(ownershipFilter);

  if (!deletedExCourse) {
    throw new AppErrorHelper("Not allowed !", 403);
  }

  return deletedExCourse;
};

export {
  createExternalCourseService,
  getMyExternalCourseService,
  getMyExternalCourseByIdService,
  getAllExternalCoursesService,
  getExternalCourseByIdService,
  getExternalCourseByStudentService,
  updateExternalCourseService,
  deleteExternalCourseService,
};
