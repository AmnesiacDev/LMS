import {
  createSubmissionService,
  getAllSubmissionsService,
  getSubmissionByIdService,
  getSubmissionsByTaskIdService,
  getSubmissionsByStudentIdService,
  getAllMySubmissionsService,
  getMySubmissionService,
  getMySubmissionStatsService,
  updateSubmissionByIdService,
  deleteSubmissionByIdService,
  updateSubmissionStatusService,
  submitTaskService,
  reviewSubmissionService,
  getSubmissionStatsByStudentIdService,
  getTasksDueDateBucketsService,
  uploadSubmissionFilesService,
  deleteSubmissionFileService,
} from "../Services/SubmissionServices.js";
import AppErrorHelper from "../Utilities/AppErrorHelper.js";
import CatchAsync from "../Utilities/CatchAsync.js";

// ─── Create ───────────────────────────────────────────────────────────────────
/**
 * POST /submissions
 * Body: { taskId, studentId, Task_links?, note? }
 */
const createSubmissionController = CatchAsync(async (req, res, next) => {
  const submission = await createSubmissionService(req.body, req.user);

  res.status(201).json({
    status: "success",
    data: { submission },
  });
});

// ─── Read (all) ───────────────────────────────────────────────────────────────
/**
 * GET /submissions
 * Supports filtering, sorting, field selection, pagination via query string
 */
const getAllSubmissionsController = CatchAsync(async (req, res, next) => {
  const submissions = await getAllSubmissionsService(req.query);

  res.status(200).json({
    status: "success",
    results: submissions.length,
    data: { submissions },
  });
});

// ─── Read (by id) ─────────────────────────────────────────────────────────────
/**
 * GET /submissions/:id
 */
const getSubmissionByIdController = CatchAsync(async (req, res, next) => {
  const submission = await getSubmissionByIdService(req.params.id);

  res.status(200).json({
    status: "success",
    data: { submission },
  });
});

// ─── Read (by task) ───────────────────────────────────────────────────────────
/**
 * GET /submissions/task/:taskId
 */
const getSubmissionsByTaskIdController = CatchAsync(async (req, res, next) => {
  const submissions = await getSubmissionsByTaskIdService(req.params.taskId, req.query);

  res.status(200).json({
    status: "success",
    results: submissions.length,
    data: { submissions },
  });
});

// ─── Read (by student) ────────────────────────────────────────────────────────
/**
 * GET /submissions/student/:studentId
 */
const getSubmissionsByStudentIdController = CatchAsync(async (req, res, next) => {
  const submissions = await getSubmissionsByStudentIdService(req.params.studentId, req.query);

  res.status(200).json({
    status: "success",
    results: submissions.length,
    data: { submissions },
  });
});

// ─── Read (my submissions) ─────────────────────────────────────────────────────
/**
 * GET /submissions/me
 */
const getAllMySubmissionsController = CatchAsync(async (req, res, next) => {
  const submissions = await getAllMySubmissionsService(req.user, req.query);

  res.status(200).json({
    status: "success",
    results: submissions.length,
    data: { submissions },
  });
});

/**
 * GET /submissions/me/:id
 */
const getMySubmissionController = CatchAsync(async (req, res, next) => {
  const submission = await getMySubmissionService(req.user, req.params.id);

  res.status(200).json({
    status: "success",
    data: { submission },
  });
});

// ─── Stats (my submissions) ───────────────────────────────────────────────────
/**
 * GET /submissions/me/stats
 */
const getMySubmissionStatsController = CatchAsync(async (req, res, next) => {
  const stats = await getMySubmissionStatsService(req.user);

  res.status(200).json({
    status: "success",
    data: { stats },
  });
});

// ─── Stats (by student) ───────────────────────────────────────────────────────
/**
 * GET /submissions/student/:studentId/stats
 */
const getSubmissionStatsByStudentIdController = CatchAsync(async (req, res, next) => {
  const stats = await getSubmissionStatsByStudentIdService(req.params.studentId);

  res.status(200).json({
    status: "success",
    data: { stats },
  });
});

// ─── Due-date buckets (by student) ───────────────────────────────────────────
/**
 * GET /submissions/student/:studentId/due-buckets
 */
const getTasksDueDateBucketsController = CatchAsync(async (req, res, next) => {
  const buckets = await getTasksDueDateBucketsService(req.params.studentId);

  res.status(200).json({
    status: "success",
    data: { buckets },
  });
});

// ─── Update (note / links only) ───────────────────────────────────────────────
/**
 * PATCH /submissions/:id
 * Body: { Task_links?, note? }
 */
const updateSubmissionByIdController = CatchAsync(async (req, res, next) => {
  const submission = await updateSubmissionByIdService(req.params.id, req.body);

  res.status(200).json({
    status: "success",
    data: { submission },
  });
});

// ─── Delete ───────────────────────────────────────────────────────────────────
/**
 * DELETE /submissions/:id
 */
const deleteSubmissionByIdController = CatchAsync(async (req, res, next) => {
  await deleteSubmissionByIdService(req.params.id);

  res.status(204).json({
    status: "success",
    data: null,
  });
});

// ─── Update status ────────────────────────────────────────────────────────────
/**
 * PATCH /submissions/:id/status
 * Body: { status }
 */
const updateSubmissionStatusController = CatchAsync(async (req, res, next) => {
  const { status } = req.body;

  if (!status) {
    return next(new AppErrorHelper("Status is required!", 400));
  }

  const submission = await updateSubmissionStatusService(req.params.id, status);

  res.status(200).json({
    status: "success",
    data: { submission },
  });
});

// ─── Submit task (student action) ─────────────────────────────────────────────
/**
 * PATCH /submissions/:id/submit
 * Body: { links: [{ name, url }] }
 */
const submitTaskController = CatchAsync(async (req, res, next) => {
  const { links } = req.body;

  if (!links || !Array.isArray(links) || links.length === 0) {
    return next(new AppErrorHelper("Links array is required!", 400));
  }

  const submission = await submitTaskService(req.params.id, links);

  res.status(200).json({
    status: "success",
    message: "Task submitted successfully!",
    data: { submission },
  });
});

// ─── Review submission (instructor action) ────────────────────────────────────
/**
 * PATCH /submissions/:id/review

 */
const reviewSubmissionController = CatchAsync(async (req, res, next) => {
  const { score, comment } = req.body;

  if (score === undefined && comment === undefined) {
    return next(new AppErrorHelper("At least a score or comment is required!", 400));
  }

  if (score !== undefined && (score < 0 || score > 10)) {
    return next(new AppErrorHelper("Score must be between 0 and 10!", 400));
  }

  const submission = await reviewSubmissionService(req.params.id, { score, comment });

  res.status(200).json({
    status: "success",
    message: "Submission reviewed successfully!",
    data: { submission },
  });
});

const uploadSubmissionFilesController = CatchAsync(async (req, res) => {
  const submission = await uploadSubmissionFilesService(req.params.id, req.files, req.user);
  res.status(200).json({ status: "success", data: { submission } });
});

const deleteSubmissionFileController = CatchAsync(async (req, res, next) => {
  const { publicId } = req.query;
  if (!publicId) return next(new AppErrorHelper("publicId query param is required", 400));
  const submission = await deleteSubmissionFileService(req.params.id, publicId);
  res.status(200).json({ status: "success", data: { submission } });
});

export {
  createSubmissionController,
  getAllSubmissionsController,
  getSubmissionByIdController,
  getSubmissionsByTaskIdController,
  getSubmissionsByStudentIdController,
  getAllMySubmissionsController,
  getMySubmissionController,
  getMySubmissionStatsController,
  getSubmissionStatsByStudentIdController,
  getTasksDueDateBucketsController,
  updateSubmissionByIdController,
  deleteSubmissionByIdController,
  updateSubmissionStatusController,
  submitTaskController,
  reviewSubmissionController,
  uploadSubmissionFilesController,
  deleteSubmissionFileController,
};
