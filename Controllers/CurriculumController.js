import CatchAsync from "../Utilities/CatchAsync.js";
import AppErrorHelper from "../Utilities/AppErrorHelper.js";
import { resolveStudentProfileId } from "../Services/GamificationService.js";
import {
  getCoursesWithProgress,
  getLessonDetails,
  completeLessonProgress,
} from "../Services/CurriculumService.js";

// ─── Get All Courses With Student Progress ─────────────────────────────────────
const getAllCoursesController = CatchAsync(async (req, res, next) => {
  const profileId = await resolveStudentProfileId(req.user);
  const data = await getCoursesWithProgress(profileId);

  res.status(200).json({
    status: "success",
    results: data.length,
    data,
  });
});

// ─── Get Specific Lesson Details ───────────────────────────────────────────────
const getLessonDetailsController = CatchAsync(async (req, res, next) => {
  const profileId = await resolveStudentProfileId(req.user);
  const { id: lessonId } = req.params;

  if (!lessonId) {
    return next(new AppErrorHelper("Lesson ID is required", 400));
  }

  const data = await getLessonDetails(lessonId, profileId);

  res.status(200).json({
    status: "success",
    data,
  });
});

// ─── Mark Lesson Completed & Submit Quiz Score ─────────────────────────────────
const completeLessonController = CatchAsync(async (req, res, next) => {
  const profileId = await resolveStudentProfileId(req.user);
  const { id: lessonId } = req.params;
  const { quizScore } = req.body; // Score from 0 to 100

  if (!lessonId) {
    return next(new AppErrorHelper("Lesson ID is required", 400));
  }

  const scoreNum = quizScore !== undefined ? Number(quizScore) : 0;

  const data = await completeLessonProgress(profileId, lessonId, scoreNum);

  res.status(200).json({
    status: "success",
    data,
  });
});

export {
  getAllCoursesController,
  getLessonDetailsController,
  completeLessonController,
};
