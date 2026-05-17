import Task from "../Models/Task.js";
import StudentProfile from "../Models/studentProfile.js";
import ApiFeatures from "../Utilities/ApiFeatures.js";
import AppErrorHelper from "../Utilities/AppErrorHelper.js";
import Session from "../Models/Session.js";
import User from "../Models/user.js";
import mongoose from "mongoose";

const createTaskServices = async (data) => {
  if (!data) {
    throw new AppErrorHelper("Data is missing!", 404);
  }

  const { sessionId, studentProfileId, instructorId, title, dueDate, taskLinks, description, status } = data;

  const instructor = await User.findById(instructorId);
  const session = await Session.findById(sessionId);

  if (!instructor) {
    throw new AppErrorHelper("Instructor not found!", 404);
  }

  if (!session) {
    throw new AppErrorHelper("Session not found!", 404);
  }

  const resolvedStudentProfileId = studentProfileId ? studentProfileId : session.studentProfileId;
  if (!resolvedStudentProfileId) {
    throw new AppErrorHelper("Student profile id is required!", 400);
  }

  const studentProfile = await StudentProfile.findById(resolvedStudentProfileId);
  if (!studentProfile) {
    throw new AppErrorHelper("Student profile not found!", 404);
  }

  if (studentProfileId && session.studentProfileId.toString() !== studentProfileId.toString()) {
    throw new AppErrorHelper("Student profile id does not match session student profile id!", 400);
  }

  if (instructor.role !== "instructor") {
    throw new AppErrorHelper("Wrong assignment of roles!", 400);
  }

  return await Task.create({
    sessionId: sessionId,
    studentProfileId: session.studentProfileId,
    instructorId: instructorId,
    title: title || "",
    taskLinks: taskLinks || [],
    description: description || "",
    dueDate: dueDate || Date.now(),
    status: status,
  });
};

// ─── Helper: get student profile IDs for an instructor (via sessions) ────────
const getInstructorStudentProfileIds = async (instructorId) => {
  const sessions = await Session.find({ instructorId }, { studentProfileId: 1 }).lean();
  const ids = [...new Set(sessions.map((s) => s.studentProfileId.toString()))];
  return ids.map((id) => new mongoose.Types.ObjectId(id));
};

const getAllTasksService = async (queryString = {}, user = null) => {
  let filter = {};

  if (user?.role === "instructor") {
    const profileIds = await getInstructorStudentProfileIds(user._id);
    filter = { instructorId: user._id, studentProfileId: { $in: profileIds } };
  }

  const features = new ApiFeatures(Task.find(filter), queryString).filter().sort().fields().pagination();
  return await features.mongooseQuery;
};

const getTaskByIdService = async (taskId) => {
  const task = await Task.findById(taskId);

  if (!task) {
    throw new AppErrorHelper(" No task found ! ", 404);
  }

  return task;
};

const getAllMyTasksService = async (userData, queryString) => {
  let mongooseQuery;

  if (userData.role == "student") {
    const studentProfile = await StudentProfile.findOne({ user: userData._id });

    if (!studentProfile) {
      throw new AppErrorHelper("Not Allowed", 403);
    }

    mongooseQuery = Task.find({ studentProfileId: studentProfile._id });
  } else if (userData.role == "parent") {
    const childrenProfiles = await StudentProfile.find({ parents: userData._id });

    if (!childrenProfiles || childrenProfiles.length === 0) {
      return [];
    }
    const ProfilesIDs = childrenProfiles.map((profile) => profile._id);

    mongooseQuery = Task.find({ studentProfileId: { $in: ProfilesIDs } });
  } else {
    throw new AppErrorHelper("Not Allowed", 403);
  }

  const features = new ApiFeatures(mongooseQuery, queryString).filter().sort().fields().pagination();
  return await features.mongooseQuery;
};

const getMyTaskByIdService = async (userData, taskId) => {
  if (userData.role == "student") {
    const studentProfile = await StudentProfile.findOne({ user: userData._id });

    if (!studentProfile) {
      throw new AppErrorHelper("Not Allowed", 403);
    }

    return await Task.findOne({ studentProfileId: studentProfile._id, _id: taskId });
  } else if (userData.role == "parent") {
    const childrenProfiles = await StudentProfile.find({ parents: userData._id });

    if (!childrenProfiles || childrenProfiles.length === 0) {
      return null;
    }
    const ProfilesIDs = childrenProfiles.map((profile) => profile._id);

    return await Task.findOne({ studentProfileId: { $in: ProfilesIDs }, _id: taskId });
  } else {
    throw new AppErrorHelper("Not Allowed", 403);
  }
};

const getTasksBySessionIdService = async (sessionId, queryString = {}) => {
  const features = new ApiFeatures(Task.find({ sessionId: sessionId }), queryString).filter().sort().fields().pagination();

  return await features.mongooseQuery;
};

const getTasksByStudentIdService = async (studentProfileId, queryString = {}) => {
  const features = new ApiFeatures(Task.find({ studentProfileId: studentProfileId }), queryString).filter().sort().fields().pagination();

  return await features.mongooseQuery;
};

const updateTaskByIdService = async (TaskId, data) => {
  const options = {
    new: true,
    runValidators: true,
  };
  const task = await Task.findByIdAndUpdate(TaskId, data, options);

  if (!task) {
    throw new AppErrorHelper("Task not found!", 404);
  }

  return task;
};

const updateTaskStatusService = async (TaskId, status) => {
  const normalizedStatus = typeof status === "string" ? status.trim().toLowerCase() : "";
  const statusAliasMap = { cancelled: "canceled" };
  const finalStatus = statusAliasMap[normalizedStatus] || normalizedStatus;
  const allowedFields = ["completed", "pending", "canceled"];

  if (!allowedFields.includes(finalStatus)) {
    throw new AppErrorHelper("Invalid Status !", 400);
  }
  const options = {
    new: true,
    runValidators: true,
  };

  const task = await Task.findByIdAndUpdate(TaskId, { status: finalStatus }, options);

  if (!task) {
    throw new AppErrorHelper("Task not found!", 404);
  }

  return task;
};


const deleteTaskByIdService = async (TaskId) => {
  const deletedTask = await Task.findByIdAndDelete(TaskId);

  if (!deletedTask) throw new AppErrorHelper("Task not found!", 404);

  return deletedTask;
};

const getTasksStatsByStudentIdService = async (studentProfileId) => {
  if (!mongoose.Types.ObjectId.isValid(studentProfileId)) {
    throw new AppErrorHelper("Invalid student profile id!", 400);
  }

  const stats = await Task.aggregate([
    {
      $match: { studentProfileId: new mongoose.Types.ObjectId(studentProfileId) },
    },
    {
      $group: {
        _id: null,
        totalTasks: { $sum: 1 },
        completedTasks: {
          $sum: {
            $cond: [{ $eq: ["$status", "completed"] }, 1, 0],
          },
        },
        pendingTasks: {
          $sum: {
            $cond: [{ $eq: ["$status", "pending"] }, 1, 0],
          },
        },
        canceledTasks: {
          $sum: {
            $cond: [{ $eq: ["$status", "canceled"] }, 1, 0],
          },
        },
      },
    },
    {
      $addFields: {
        completionRate: {
          $cond: [
            { $eq: ["$totalTasks", 0] },
            0,
            {
              $multiply: [{ $divide: ["$completedTasks", "$totalTasks"] }, 100],
            },
          ],
        },
      },
    },
  ]);

  return stats[0] || {
    totalTasks: 0,
    completedTasks: 0,
    pendingTasks: 0,
    canceledTasks: 0,
    completionRate: 0,
  };
};

const getMyTasksStatsService = async (userData) => {
  let studentProfileIds;

  if (userData.role === "student") {
    const studentProfile = await StudentProfile.findOne({ user: userData._id });
    if (!studentProfile) {
      throw new AppErrorHelper("Not allowed", 403);
    }
    studentProfileIds = [studentProfile._id];
  } else if (userData.role === "parent") {
    const childrenProfiles = await StudentProfile.find({ parents: userData._id });
    if (!childrenProfiles || childrenProfiles.length === 0) {
      return {
        totalTasks: 0,
        completedTasks: 0,
        pendingTasks: 0,
        canceledTasks: 0,
        completionRate: 0,
      };
    }
    studentProfileIds = childrenProfiles.map((profile) => profile._id);
  } else {
    throw new AppErrorHelper("Not allowed", 403);
  }

  const stats = await Task.aggregate([
    {
      $match: { studentProfileId: { $in: studentProfileIds } },
    },
    {
      $group: {
        _id: null,
        totalTasks: { $sum: 1 },
        completedTasks: {
          $sum: {
            $cond: [{ $eq: ["$status", "completed"] }, 1, 0],
          },
        },
        pendingTasks: {
          $sum: {
            $cond: [{ $eq: ["$status", "pending"] }, 1, 0],
          },
        },
        canceledTasks: {
          $sum: {
            $cond: [{ $eq: ["$status", "canceled"] }, 1, 0],
          },
        },
      },
    },
    {
      $addFields: {
        completionRate: {
          $cond: [
            { $eq: ["$totalTasks", 0] },
            0,
            {
              $multiply: [{ $divide: ["$completedTasks", "$totalTasks"] }, 100],
            },
          ],
        },
      },
    },
  ]);

  return stats[0] || {
    totalTasks: 0,
    completedTasks: 0,
    pendingTasks: 0,
    canceledTasks: 0,
    completionRate: 0,
  };
};

// ─── Soft delete ─────────────────────────────────────────────────────────────
const softDeleteTaskService = async (TaskId) => {
  const task = await Task.findByIdAndUpdate(
    TaskId,
    { deletedAt: new Date() },
    { new: true }
  );
  if (!task) throw new AppErrorHelper("Task not found!", 404);
  return task;
};

// ─── Bulk task assignment ─────────────────────────────────────────────────────
const createBulkTasksService = async (data) => {
  const { sessionIds, studentProfileIds, title, description, dueDate, taskLinks, instructorId } = data;

  if (!studentProfileIds?.length) throw new AppErrorHelper("studentProfileIds array is required", 400);
  if (!sessionIds?.length) throw new AppErrorHelper("sessionIds array is required", 400);

  const instructor = await User.findById(instructorId);
  if (!instructor || instructor.role !== "instructor") {
    throw new AppErrorHelper("Valid instructor required", 400);
  }

  const tasks = [];
  for (const studentProfileId of studentProfileIds) {
    for (const sessionId of sessionIds) {
      const session = await Session.findById(sessionId);
      if (!session) continue;
      tasks.push({
        sessionId,
        studentProfileId,
        instructorId,
        title: title || "",
        description: description || "",
        dueDate: dueDate || Date.now(),
        taskLinks: taskLinks || [],
        status: "pending",
        deletedAt: null,
      });
    }
  }

  if (!tasks.length) throw new AppErrorHelper("No valid session/student combinations found", 400);
  return await Task.insertMany(tasks);
};

export {
  createTaskServices,
  getAllMyTasksService,
  getMyTaskByIdService,
  getAllTasksService,
  getTaskByIdService,
  getTasksBySessionIdService,
  getTasksByStudentIdService,
  getTasksStatsByStudentIdService,
  getMyTasksStatsService,
  updateTaskByIdService,
  updateTaskStatusService,
  deleteTaskByIdService,
  softDeleteTaskService,
  createBulkTasksService,
};
