import CatchAsync from "../Utilities/CatchAsync.js";
import AppErrorHelper from "../Utilities/AppErrorHelper.js";
import { createExamService, getMyExamsService, getMyExamByIdService, getAllExamsService, getExamByIdService, getExamsByStudentService, updateExamService, deleteExamService } from "../Services/ExamService.js";

const createExamController = CatchAsync(async (req, res, next) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    return next(new AppErrorHelper("Data is missing!", 400));
  }

  if (req.user && req.user.role !== "student" && req.user.role !== "parent") {
    req.body.createdBy = req.user._id;
  }

  const exam = await createExamService(req.body, req.user);

  res.status(201).json({
    status: "success",
    data: { exam },
  });
});

const getMyExamsController = CatchAsync(async (req, res, next) => {
  const exams = await getMyExamsService(req.user, req.query);

  res.status(200).json({
    status: "success",
    results: exams.length,
    data: { exams },
  });
});

const getMyExamByIdController = CatchAsync(async (req, res, next) => {
  const exam = await getMyExamByIdService(req.user, req.params.id);

  res.status(200).json({
    status: "success",
    data: { exam },
  });
});

const getAllExamsController = CatchAsync(async (req, res, next) => {
  const exams = await getAllExamsService(req.query, req.user);

  res.status(200).json({
    status: "success",
    results: exams.length,
    data: { exams },
  });
});

const getExamByIdController = CatchAsync(async (req, res, next) => {
  const exam = await getExamByIdService(req.params.id, req.user);

  res.status(200).json({
    status: "success",
    data: { exam },
  });
});

const getExamsByStudentController = CatchAsync(async (req, res, next) => {
  const exams = await getExamsByStudentService(req.params.id, req.query, req.user);

  res.status(200).json({
    status: "success",
    results: exams.length,
    data: { exams },
  });
});

const updateExamController = CatchAsync(async (req, res, next) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    return next(new AppErrorHelper("Data is missing!", 400));
  }

  const exam = await updateExamService(req.params.id, req.body, req.user);

  res.status(200).json({
    status: "success",
    data: { exam },
  });
});

const deleteExamController = CatchAsync(async (req, res, next) => {
  await deleteExamService(req.params.id, req.user);

  res.status(204).json({
    status: "success",
    data: null,
  });
});

export { createExamController, getMyExamsController, getMyExamByIdController, getAllExamsController, getExamByIdController, getExamsByStudentController, updateExamController, deleteExamController };
