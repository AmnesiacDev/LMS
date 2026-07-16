import CatchAsync from "../Utilities/CatchAsync.js";
import {
  createExternalCourseService,
  getMyExternalCourseService,
  getMyExternalCourseByIdService,
  getAllExternalCoursesService,
  getExternalCourseByIdService,
  getExternalCourseByStudentService,
  updateExternalCourseService,
  deleteExternalCourseService,
} from "../Services/ExternalCourseService.js";
import AppErrorHelper from "../Utilities/AppErrorHelper.js";

const CreateExternalCourseController = CatchAsync(async (req, res, next) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    return next(new AppErrorHelper("Data is missing!", 400));
  }

  const course = await createExternalCourseService(req.user, req.body);

  res.status(201).json({
    status: "success",
    data: {
      course,
    },
  });
});

const getMyExternalCoursesController = CatchAsync(async (req, res) => {
  const user = req.user;

  const courses = await getMyExternalCourseService(user, req.query);

  res.status(200).json({
    status: "success",
    results: courses.length,
    data: courses,
  });
});

const getMyExternalCourseByIdController = CatchAsync(async (req, res, next) => {
  const course = await getMyExternalCourseByIdService(req.user, req.params.id);

  res.status(200).json({
    status: "success",
    data: { course },
  });
});

const getAllExternalCoursesController = CatchAsync(async (req, res, next) => {
  const docs = (await getAllExternalCoursesService(req.query)) || [];

  res.status(200).json({
    status: "success",
    data: {
      results: docs.length,
      docs,
    },
  });
});

const getExternalCourseByIdController = CatchAsync(async (req, res, next) => {
  const course = await getExternalCourseByIdService(req.params.id);

  if (!course) {
    return next(new AppErrorHelper("Course not found!", 404));
  }

  res.status(200).json({
    status: "success",
    data: {
      course,
    },
  });
});

const getExternalCoursesByStudentController = CatchAsync(async (req, res, next) => {
  const docs = (await getExternalCourseByStudentService(req.params.id, req.query)) || [];

  res.status(200).json({
    status: "success",
    data: {
      results: docs.length,
      docs,
    },
  });
});

const updateExternalCourseController = CatchAsync(async (req, res, next) => {
  const course = await updateExternalCourseService(req.user, req.params.id, req.body);

  if (!course) {
    return next(new AppErrorHelper("Course not found!", 404));
  }

  res.status(200).json({
    status: "success",
    data: {
      course,
    },
  });
});

const deleteExternalCourseController = CatchAsync(async (req, res, next) => {
  const course = await deleteExternalCourseService(req.user, req.params.id);

  if (!course) {
    return next(new AppErrorHelper("Course not found!", 404));
  }

  res.status(200).json({
    status: "Document deleted successfully",
  });
});

export {
  CreateExternalCourseController,
  getMyExternalCourseByIdController,
  getMyExternalCoursesController,
  getAllExternalCoursesController,
  getExternalCourseByIdController,
  getExternalCoursesByStudentController,
  updateExternalCourseController,
  deleteExternalCourseController,
};
