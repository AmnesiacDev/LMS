import AppErrorHelper from "../Utilities/AppErrorHelper.js";
import CatchAsync from "../Utilities/CatchAsync.js";

import {
  createSessionReviewService,
  getAllSessionReviewsService,
  getSessionReviewsByStudentService,
  getSessionReviewsByInstructorService,
  getSessionReviewsBySessionService,
  getAllMySessionReviewsService,
  getMySessionReviewService,
  getMySessionReviewStatsService,
  updateSessionReviewByIdService,
  deleteSessionReviewByIdService,
  getStudentReviewStatsService,
} from "../Services/SessionReviewService.js";

const createSessionReviewController = CatchAsync(async (req, res, next) => {
  if (!req.body) {
    return next(new AppErrorHelper("Data is missing!", 400));
  }

  const review = await createSessionReviewService(req.body, req.user);

  res.status(201).json({
    status: "success",
    data: {
      review: review,
    },
  });
});

const getAllSessionReviewsController = CatchAsync(async (req, res, next) => {
  const docs = (await getAllSessionReviewsService(req.query, req.user)) || [];

  res.status(200).json({
    status: "success",
    data: {
      results: docs.length,
      docs: docs,
    },
  });
});

const getSessionReviewsByStudentController = CatchAsync(async (req, res, next) => {
  const docs = (await getSessionReviewsByStudentService(req.params.id, req.query)) || [];

  res.status(200).json({
    status: "success",
    data: {
      results: docs.length,
      docs: docs,
    },
  });
});

const getSessionReviewsByInstructorController = CatchAsync(async (req, res, next) => {
  const docs = (await getSessionReviewsByInstructorService(req.params.id, req.query)) || [];

  res.status(200).json({
    status: "success",
    data: {
      results: docs.length,
      docs: docs,
    },
  });
});

const getSessionReviewsBySessionController = CatchAsync(async (req, res, next) => {
  const docs = (await getSessionReviewsBySessionService(req.params.id, req.query)) || [];

  res.status(200).json({
    status: "success",
    data: {
      results: docs.length,
      docs: docs,
    },
  });
});

const getAllMySessionReviewsController = CatchAsync(async (req, res, next) => {
  const docs = (await getAllMySessionReviewsService(req.user, req.query)) || [];

  res.status(200).json({
    status: "success",
    data: {
      results: docs.length,
      docs: docs,
    },
  });
});

const getMySessionReviewController = CatchAsync(async (req, res, next) => {
  const review = await getMySessionReviewService(req.user, req.params.id);

  if (!review) {
    return next(new AppErrorHelper("No document found!", 404));
  }

  res.status(200).json({
    status: "success",
    data: {
      review: review,
    },
  });
});

const getMySessionReviewStatsController = CatchAsync(async (req, res, next) => {
  const stats = await getMySessionReviewStatsService(req.user);

  res.status(200).json({
    status: "success",
    data: {
      stats: stats,
    },
  });
});

const updateSessionReviewByIdController = CatchAsync(async (req, res, next) => {
  const review = await updateSessionReviewByIdService(req.params.id, req.body);

  if (!review) {
    return next(new AppErrorHelper("No document found!", 404));
  }

  res.status(200).json({
    status: "success",
    data: {
      review: review,
    },
  });
});

const deleteSessionReviewByIdController = CatchAsync(async (req, res, next) => {
  const review = await deleteSessionReviewByIdService(req.params.id);

  if (!review) {
    return next(new AppErrorHelper("No document found!", 404));
  }

  res.status(200).json({
    status: "Document deleted successfully",
  });
});

const getStudentReviewStatsController = CatchAsync(async (req, res, next) => {
  const stats = await getStudentReviewStatsService(req.params.id);

  if (!stats || Object.keys(stats).length === 0) {
    return next(new AppErrorHelper("No stats found!", 404));
  }

  res.status(200).json({
    status: "success",
    data: {
      stats: stats,
    },
  });
});

export {
  createSessionReviewController,
  getAllSessionReviewsController,
  getAllMySessionReviewsController,
  getSessionReviewsByStudentController,
  getSessionReviewsByInstructorController,
  getSessionReviewsBySessionController,
  getMySessionReviewController,
  getMySessionReviewStatsController,
  updateSessionReviewByIdController,
  deleteSessionReviewByIdController,
  getStudentReviewStatsController,
};
