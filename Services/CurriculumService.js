import Course from "../Models/Course.js";
import Lesson from "../Models/Lesson.js";
import LessonProgress from "../Models/LessonProgress.js";
import { awardXP } from "./GamificationService.js";
import { notifyStudentAndParents } from "./NotificationHelpers.js";
import AppErrorHelper from "../Utilities/AppErrorHelper.js";

/**
 * Lists all active courses along with completion stats for a student.
 */
export const getCoursesWithProgress = async (studentProfileId) => {
  const courses = await Course.find({ isActive: true }).lean();

  const coursesWithStats = await Promise.all(
    courses.map(async (course) => {
      // Find all lessons for this course
      const lessons = await Lesson.find({ courseId: course._id, isActive: true })
        .sort({ order: 1 })
        .lean();

      const lessonIds = lessons.map((l) => l._id);

      // Find completed lessons progress for this student
      const completedProgress = await LessonProgress.find({
        studentProfileId,
        lessonId: { $in: lessonIds },
        completed: true,
      }).lean();

      const completedLessonIds = new Set(completedProgress.map((p) => String(p.lessonId._id || p.lessonId)));

      // Map progress details to each lesson
      const lessonsWithProgress = lessons.map((lesson) => {
        const isCompleted = completedLessonIds.has(String(lesson._id));
        const prog = completedProgress.find((p) => String(p.lessonId._id || p.lessonId) === String(lesson._id));
        return {
          ...lesson,
          completed: isCompleted,
          quizScore: prog ? prog.quizScore : 0,
        };
      });

      // Group lessons by moduleTitle
      const modulesMap = {};
      lessonsWithProgress.forEach((lesson) => {
        if (!modulesMap[lesson.moduleTitle]) {
          modulesMap[lesson.moduleTitle] = [];
        }
        modulesMap[lesson.moduleTitle].push(lesson);
      });

      const modulesList = Object.keys(modulesMap).map((title) => ({
        title,
        lessons: modulesMap[title],
      }));

      const totalLessons = lessons.length;
      const completedLessons = completedProgress.length;
      const percentComplete = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

      return {
        ...course,
        totalLessons,
        completedLessons,
        percentComplete,
        modules: modulesList,
      };
    })
  );

  return coursesWithStats;
};

/**
 * Fetches specific lesson details, excluding correct answers of quizzes unless already completed.
 */
export const getLessonDetails = async (lessonId, studentProfileId) => {
  const lesson = await Lesson.findById(lessonId).lean();
  if (!lesson) {
    throw new AppErrorHelper("Lesson not found", 404);
  }

  // Fetch student progress
  const progress = await LessonProgress.findOne({ studentProfileId, lessonId }).lean();

  const isCompleted = progress ? progress.completed : false;

  // Clone pages and sanitize quiz correct answers if not completed
  const sanitizedPages = lesson.pages.map((page) => {
    if (page.type === "mini_quiz") {
      const sanitizedQuiz = { ...page.quizData };
      if (!isCompleted) {
        // Hide correct answer from students
        delete sanitizedQuiz.correctAnswer;
      }
      return {
        ...page,
        quizData: sanitizedQuiz,
      };
    }
    return page;
  });

  return {
    ...lesson,
    pages: sanitizedPages,
    progress: progress || { completed: false, quizScore: 0, attempts: 0 },
  };
};

/**
 * Marks a lesson completed, grades a quiz submission, and awards XP.
 */
export const completeLessonProgress = async (studentProfileId, lessonId, score = 0) => {
  const lesson = await Lesson.findById(lessonId);
  if (!lesson) {
    throw new AppErrorHelper("Lesson not found", 404);
  }

  // Find or create progress
  let progress = await LessonProgress.findOne({ studentProfileId, lessonId });

  const alreadyCompleted = progress ? progress.completed : false;

  if (!progress) {
    progress = new LessonProgress({
      studentProfileId,
      lessonId,
      completed: true,
      completedAt: new Date(),
      quizScore: score,
      attempts: 1,
    });
  } else {
    progress.attempts += 1;
    if (!progress.completed) {
      progress.completed = true;
      progress.completedAt = new Date();
    }
    // Update score if it's higher
    if (score > progress.quizScore) {
      progress.quizScore = score;
    }
  }

  await progress.save();

  // Award XP if this is the first time completing the lesson
  let awardResult = null;
  if (!alreadyCompleted && lesson.xpReward > 0) {
    awardResult = await awardXP(studentProfileId, lesson.xpReward, "lesson_completed", lesson._id);
  }

  // Notify student + parents on first completion (best-effort, fire-and-forget)
  if (!alreadyCompleted) {
    notifyStudentAndParents(studentProfileId, {
      type: "lesson_completed",
      link: "/curriculum",
      studentTitle: `📚 Lesson complete: ${lesson.title}`,
      studentMessage: `You finished "${lesson.title}"${lesson.xpReward > 0 ? ` and earned ${lesson.xpReward} XP` : ""}. Great job!`,
      parentTitle: (name) => `📚 ${name} completed a lesson`,
      parentMessage: (name) => `${name} finished "${lesson.title}"${lesson.xpReward > 0 ? ` and earned ${lesson.xpReward} XP` : ""}.`,
    }).catch(() => {});
  }

  return {
    progress,
    xpAwarded: !alreadyCompleted ? lesson.xpReward : 0,
    newLevel: awardResult ? awardResult.gamification?.level : null,
  };
};
