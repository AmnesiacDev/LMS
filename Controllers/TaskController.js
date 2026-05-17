import AppErrorHelper from "../Utilities/AppErrorHelper.js";
import {
  createTaskServices,
  getAllTasksService,
  getAllMyTasksService,
  getTaskByIdService,
  getTasksBySessionIdService,
  getTasksByStudentIdService,
  getTasksStatsByStudentIdService,
  getMyTasksStatsService,
  getMyTaskByIdService,
  updateTaskByIdService,
  deleteTaskByIdService,
  updateTaskStatusService,
  softDeleteTaskService,
  createBulkTasksService,
} from "../Services/TaskServices.js";
import CatchAsync from "../Utilities/CatchAsync.js";
import Task from "../Models/Task.js";

const createTaskController = CatchAsync(async (req, res, next) => {
  const task = await createTaskServices(req.body);

  res.status(201).json({
    status: "success",
    data: {
      task: task,
    },
  });
});

const getAllTasksController = CatchAsync(async (req, res, next) => {
  const tasks = (await getAllTasksService(req.query, req.user)) || [];

  res.status(200).json({
    status: "success",
    data: {
      results: tasks.length,
      tasks: tasks,
    },
  });
});

const getTaskByIdController = CatchAsync(async (req, res, next) => {
  const task = await getTaskByIdService(req.params.id);

  if (!task) {
    return next(new AppErrorHelper(" No task found ! ", 404));
  }

  res.status(200).json({
    status: "success",
    data: {
      task: task,
    },
  });
});

const getTasksBySessionIdController = CatchAsync(async (req, res, next) => {
  const tasks = (await getTasksBySessionIdService(req.params.id, req.query)) || [];

  res.status(200).json({
    status: "success",
    data: {
      results: tasks.length,
      tasks: tasks,
    },
  });
});

const getAllMyTasksController = CatchAsync(async (req, res, next) => {
  const tasks = (await getAllMyTasksService(req.user, req.query)) || [];

  res.status(200).json({
    status: "success",
    data: {
      results: tasks.length,
      tasks: tasks,
    },
  });
});

const getMyTaskByIdController = CatchAsync(async (req, res, next) => {
  const task = await getMyTaskByIdService(req.user, req.params.id);

  if (!task) {
    return next(new AppErrorHelper(" No task found ! ", 404));
  }

  res.status(200).json({
    status: "success",
    data: {
      task: task,
    },
  });
});

const getMyTasksStatsController = CatchAsync(async (req, res, next) => {
  const stats = await getMyTasksStatsService(req.user);

  res.status(200).json({
    status: "success",
    data: {
      stats,
    },
  });
});

const getTasksByStudentIdController = CatchAsync(async (req, res, next) => {
  const tasks = (await getTasksByStudentIdService(req.params.id, req.query)) || [];

  res.status(200).json({
    status: "success",
    data: {
      results: tasks.length,
      tasks: tasks,
    },
  });
});

const getTasksStatsByStudentIdController = CatchAsync(async (req, res, next) => {
  // Stats service already returns a zero-filled default object when there's no data,
  // so just pass it through.
  const tasks = await getTasksStatsByStudentIdService(req.params.id);

  res.status(200).json({
    status: "success",
    data: {
      tasks: tasks,
    },
  });
});

const updateTaskByIdController = CatchAsync(async (req, res, next) => {
  const tasks = await updateTaskByIdService(req.params.id, req.body);

  res.status(200).json({
    status: "success",
    data: {
      tasks: tasks,
    },
  });
});

const deleteTaskByIdController = CatchAsync(async (req, res, next) => {
  const task = await deleteTaskByIdService(req.params.id);

  res.status(200).json({
    status: "success",
  });
});

const updateTaskStatusController = CatchAsync(async (req, res, next) => {
  const task = await updateTaskStatusService(req.params.id, req.body);

  res.status(200).json({
    status: "success",
    data: {
      task: task,
    },
  });
});

const softDeleteTaskController = CatchAsync(async (req, res) => {
  await softDeleteTaskService(req.params.id);
  res.status(200).json({ status: "success", message: "Task soft-deleted" });
});

const createBulkTasksController = CatchAsync(async (req, res) => {
  const tasks = await createBulkTasksService({ ...req.body, instructorId: req.user._id });
  res.status(201).json({ status: "success", results: tasks.length, data: { tasks } });
});

export {
  createTaskController,
  getAllTasksController,
  getAllMyTasksController,
  getTaskByIdController,
  getTasksBySessionIdController,
  getTasksByStudentIdController,
  getTasksStatsByStudentIdController,
  getMyTasksStatsController,
  getMyTaskByIdController,
  updateTaskByIdController,
  updateTaskStatusController,
  deleteTaskByIdController,
  softDeleteTaskController,
  createBulkTasksController,
};
