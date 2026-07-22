import Task from "../Models/Task.js";
import StudentProfile from "../Models/studentProfile.js";
import ApiFeatures from "../Utilities/ApiFeatures.js";
import AppErrorHelper from "../Utilities/AppErrorHelper.js";
import Session from "../Models/Session.js";
import User from "../Models/user.js";
import mongoose from "mongoose";
import { createNotificationService } from "./NotificationService.js";
import { assertInstructorAssignedToProfile, getAssignedStudentProfilesService } from "./StudentInstructorAssignmentService.js";

// ─── Notify student + parents when a task (or batch of tasks) is assigned ─────
// Best-effort: failures are logged, never thrown so task creation never breaks.
// `studentProfile` is expected to be a doc fetched via StudentProfile.findById
// (auto-populates `user` and `parents`).
const notifyNewTask = async (studentProfile, { instructorId, title, taskId, count = 1 }) => {
  try {
    if (!studentProfile) return;

    const studentUserId = studentProfile.user?._id || studentProfile.user;
    const studentName = studentProfile.user?.FullName || "your child";
    const senderId = instructorId?._id || instructorId;

    const isBulk = count > 1;
    const taskLabel = title ? `"${title}"` : "a new task";
    // Fall back to the task list when we don't have a single task id to link to.
    const link = !isBulk && taskId ? `/tasks/${taskId}` : "/tasks";

    const studentTitle = isBulk ? `📝 You have ${count} new tasks` : "📝 New task assigned";
    const studentMessage = isBulk ? `You have ${count} new tasks to complete. Check your task list.` : `You have a new task: ${taskLabel}. Tap to view the details.`;

    const parentTitle = isBulk ? `📝 ${studentName} has ${count} new tasks` : `📝 New task for ${studentName}`;
    const parentMessage = isBulk ? `${studentName} has ${count} new tasks to complete.` : `${studentName} has a new task: ${taskLabel}.`;

    const notifications = [];

    if (studentUserId) {
      notifications.push(
        createNotificationService({
          recipient: studentUserId,
          sender: senderId,
          type: "new_task",
          title: studentTitle,
          message: studentMessage,
          link,
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
          type: "new_task",
          title: parentTitle,
          message: parentMessage,
          link,
        }),
      );
    }

    const results = await Promise.allSettled(notifications);
    results.forEach((r) => {
      if (r.status === "rejected") {
        console.error("[TaskService] New task notification failed:", r.reason?.message);
      }
    });
  } catch (err) {
    console.error("[TaskService] New task notification failed:", err.message);
  }
};

const documentId = (value) => value?._id || value;

const assertCanManageTask = async (currentUser, task) => {
  if (currentUser?.role === "admin") return;
  if (currentUser?.role !== "instructor") {
    throw new AppErrorHelper("Not allowed", 403);
  }
  if (documentId(task.instructorId).toString() !== currentUser._id.toString()) {
    throw new AppErrorHelper("Task not found", 404);
  }
  await assertInstructorAssignedToProfile(currentUser._id, documentId(task.studentProfileId));
};

const createTaskServices = async (data, currentUser) => {
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

  if (currentUser?.role === "instructor" && instructor._id.toString() !== currentUser._id.toString()) {
    throw new AppErrorHelper("Instructors can only create their own tasks", 403);
  }
  if (session.instructorId.toString() !== instructor._id.toString()) {
    throw new AppErrorHelper("Session does not belong to this instructor", 403);
  }
  await assertInstructorAssignedToProfile(instructor._id, studentProfile._id);

  const task = await Task.create({
    sessionId: sessionId,
    studentProfileId: session.studentProfileId,
    instructorId: instructorId,
    title: title || "",
    taskLinks: taskLinks || [],
    description: description || "",
    dueDate: dueDate || Date.now(),
    status: status,
  });

  await notifyNewTask(studentProfile, {
    instructorId,
    title: task.title,
    taskId: task._id,
  });

  return task;
};

// ─── Helper: get student profile IDs for an instructor (via sessions) ────────
const getAllTasksService = async (queryString = {}, user = null) => {
  let filter = {};

  if (user?.role === "instructor") {
    const profiles = await getAssignedStudentProfilesService(user);
    const profileIds = profiles.map((profile) => profile._id);
    filter = { instructorId: user._id, studentProfileId: { $in: profileIds } };
  }

  const features = new ApiFeatures(Task.find(filter), queryString).filter().sort().fields().pagination();
  return await features.mongooseQuery;
};

const getTaskByIdService = async (taskId, currentUser) => {
  const task = await Task.findById(taskId);

  if (!task) {
    throw new AppErrorHelper(" No task found ! ", 404);
  }

  await assertCanManageTask(currentUser, task);

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

const getTasksBySessionIdService = async (sessionId, queryString = {}, currentUser) => {
  const session = await Session.findById(sessionId);
  if (!session) throw new AppErrorHelper("Session not found!", 404);
  await assertCanManageTask(currentUser, session);
  const features = new ApiFeatures(Task.find({ sessionId: sessionId }), queryString).filter().sort().fields().pagination();

  return await features.mongooseQuery;
};

const getTasksByStudentIdService = async (studentProfileId, queryString = {}, currentUser) => {
  if (currentUser?.role === "instructor") {
    await assertInstructorAssignedToProfile(currentUser._id, studentProfileId);
  }
  const features = new ApiFeatures(Task.find({ studentProfileId: studentProfileId }), queryString).filter().sort().fields().pagination();

  return await features.mongooseQuery;
};

const updateTaskByIdService = async (TaskId, data, currentUser) => {
  const existingTask = await Task.findById(TaskId);
  if (!existingTask) throw new AppErrorHelper("Task not found!", 404);
  await assertCanManageTask(currentUser, existingTask);

  const { sessionId: ignoredSessionId, studentProfileId: ignoredStudentProfileId, instructorId: ignoredInstructorId, ...editableData } = data;
  void ignoredSessionId;
  void ignoredStudentProfileId;
  void ignoredInstructorId;
  const options = {
    new: true,
    runValidators: true,
  };
  const task = await Task.findByIdAndUpdate(TaskId, editableData, options);

  if (!task) {
    throw new AppErrorHelper("Task not found!", 404);
  }

  return task;
};

const updateTaskStatusService = async (TaskId, status, currentUser) => {
  const existingTask = await Task.findById(TaskId);
  if (!existingTask) throw new AppErrorHelper("Task not found!", 404);
  await assertCanManageTask(currentUser, existingTask);

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

const deleteTaskByIdService = async (TaskId, currentUser) => {
  const existingTask = await Task.findById(TaskId);
  if (!existingTask) throw new AppErrorHelper("Task not found!", 404);
  await assertCanManageTask(currentUser, existingTask);

  const deletedTask = await Task.findByIdAndDelete(TaskId);

  if (!deletedTask) throw new AppErrorHelper("Task not found!", 404);

  return deletedTask;
};

const getTasksStatsByStudentIdService = async (studentProfileId, currentUser) => {
  if (!mongoose.Types.ObjectId.isValid(studentProfileId)) {
    throw new AppErrorHelper("Invalid student profile id!", 400);
  }
  if (currentUser?.role === "instructor") {
    await assertInstructorAssignedToProfile(currentUser._id, studentProfileId);
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

  return (
    stats[0] || {
      totalTasks: 0,
      completedTasks: 0,
      pendingTasks: 0,
      canceledTasks: 0,
      completionRate: 0,
    }
  );
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

  return (
    stats[0] || {
      totalTasks: 0,
      completedTasks: 0,
      pendingTasks: 0,
      canceledTasks: 0,
      completionRate: 0,
    }
  );
};

// ─── Soft delete ─────────────────────────────────────────────────────────────
const softDeleteTaskService = async (TaskId, currentUser) => {
  const existingTask = await Task.findById(TaskId);
  if (!existingTask) throw new AppErrorHelper("Task not found!", 404);
  await assertCanManageTask(currentUser, existingTask);

  const task = await Task.findByIdAndUpdate(TaskId, { deletedAt: new Date() }, { new: true });
  if (!task) throw new AppErrorHelper("Task not found!", 404);
  return task;
};

// ─── Bulk task assignment ─────────────────────────────────────────────────────
const createBulkTasksService = async (data, currentUser) => {
  const { sessionIds, studentProfileIds, title, description, dueDate, taskLinks, instructorId } = data;

  if (!studentProfileIds?.length) throw new AppErrorHelper("studentProfileIds array is required", 400);
  if (!sessionIds?.length) throw new AppErrorHelper("sessionIds array is required", 400);

  const instructor = await User.findById(instructorId);
  if (!instructor || instructor.role !== "instructor") {
    throw new AppErrorHelper("Valid instructor required", 400);
  }
  if (currentUser?.role === "instructor" && instructor._id.toString() !== currentUser._id.toString()) {
    throw new AppErrorHelper("Instructors can only create their own tasks", 403);
  }

  for (const studentProfileId of studentProfileIds) {
    await assertInstructorAssignedToProfile(instructor._id, studentProfileId);
  }

  const sessions = await Session.find({ _id: { $in: sessionIds } });
  const sessionById = new Map(sessions.map((session) => [session._id.toString(), session]));

  const tasks = [];
  for (const studentProfileId of studentProfileIds) {
    for (const sessionId of sessionIds) {
      const session = sessionById.get(sessionId.toString());
      if (!session || session.instructorId.toString() !== instructor._id.toString() || session.studentProfileId.toString() !== studentProfileId.toString()) {
        continue;
      }
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

  const created = await Task.insertMany(tasks);

  // Notify each student (+ their parents) once per bulk assignment with their
  // own task count. Best-effort: never let a notification failure break the call.
  try {
    const tasksPerStudent = new Map();
    for (const task of created) {
      const key = task.studentProfileId.toString();
      const entry = tasksPerStudent.get(key) || { count: 0, taskId: task._id };
      entry.count += 1;
      tasksPerStudent.set(key, entry);
    }

    const profileIds = [...tasksPerStudent.keys()];
    const profiles = await StudentProfile.find({ _id: { $in: profileIds } });

    await Promise.allSettled(
      profiles.map((profile) => {
        const entry = tasksPerStudent.get(profile._id.toString()) || { count: 1 };
        return notifyNewTask(profile, {
          instructorId,
          title,
          taskId: entry.taskId,
          count: entry.count,
        });
      }),
    );
  } catch (err) {
    console.error("[TaskService] Bulk task notifications failed:", err.message);
  }

  return created;
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
