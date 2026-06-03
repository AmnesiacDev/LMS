import mongoose from "mongoose";
import Session from "../Models/Session.js";
import SessionReview from "../Models/SessionReview.js";
import Task from "../Models/Task.js";
import Submission from "../Models/Submission.js";
import Exam from "../Models/exam.js";
import ExternalCourse from "../Models/externalCourse.js";
import ExternalHW from "../Models/externalHw.js";
import StudentProfile from "../Models/studentProfile.js";
import AppErrorHelper from "../Utilities/AppErrorHelper.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve the list of studentProfileIds based on the user's role.
 *  - student → [own profile]
 *  - parent  → [all children profiles]
 *  - admin / instructor + explicit profileId → [profileId]
 */
const resolveProfileIds = async (user, profileId) => {
  if (profileId) {
    // Explicit profile requested — verify access
    if (user.role === "parent") {
      const allowed = await StudentProfile.findOne({
        _id: profileId,
        parents: user._id,
      });
      if (!allowed) {
        throw new AppErrorHelper("Not allowed to view this child's progress!", 403);
      }
      return [new mongoose.Types.ObjectId(profileId)];
    }

    if (user.role === "student") {
      const ownProfile = await StudentProfile.findOne({ user: user._id });
      if (!ownProfile || ownProfile._id.toString() !== profileId) {
        throw new AppErrorHelper("Not allowed!", 403);
      }
      return [ownProfile._id];
    }

    // admin / instructor — can view any
    return [new mongoose.Types.ObjectId(profileId)];
  }

  // No explicit profileId — resolve from user role
  if (user.role === "student") {
    const profile = await StudentProfile.findOne({ user: user._id });
    if (!profile) {
      throw new AppErrorHelper("Student profile not found!", 404);
    }
    return [profile._id];
  }

  if (user.role === "parent") {
    const children = await StudentProfile.find({ parents: user._id }, { _id: 1 });
    if (!children.length) {
      return [];
    }
    return children.map((c) => c._id);
  }

  throw new AppErrorHelper("Profile ID is required for admin/instructor!", 400);
};

/**
 * Build a $group _id expression that buckets by week or month based on a date field.
 */
const buildDateGroupId = (dateField, period = "monthly") => {
  if (period === "weekly") {
    return {
      year: { $isoWeekYear: dateField },
      week: { $isoWeek: dateField },
    };
  }
  // monthly (default)
  return {
    year: { $year: dateField },
    month: { $month: dateField },
  };
};

/**
 * Build the date range $match filter.
 */
const buildDateMatch = (dateField, from, to) => {
  const match = {};
  if (from) match.$gte = new Date(from);
  if (to) match.$lte = new Date(to);
  return Object.keys(match).length ? { [dateField]: match } : {};
};

// ─── 1. Session Review Trends ─────────────────────────────────────────────────

const getReviewTrendsService = async (user, { profileId, period = "monthly", from, to } = {}) => {
  const profileIds = await resolveProfileIds(user, profileId);
  if (!profileIds.length) return [];

  const dateMatch = buildDateMatch("createdAt", from, to);

  const trends = await SessionReview.aggregate([
    {
      $match: {
        studentProfileId: { $in: profileIds },
        ...dateMatch,
      },
    },
    { $sort: { createdAt: 1 } },
    {
      $group: {
        _id: buildDateGroupId("$createdAt", period),
        avgBehavior: { $avg: "$Behavior" },
        avgUnderstanding: { $avg: "$underStanding" },
        avgParticipation: { $avg: "$participation" },
        avgCoding: { $avg: "$coding" },
        avgOverall: { $avg: "$overAllRating" },
        reviewCount: { $sum: 1 },
      },
    },
    { $sort: { "_id.year": 1, "_id.month": 1, "_id.week": 1 } },
    {
      $project: {
        _id: 0,
        period: "$_id",
        avgBehavior: { $round: ["$avgBehavior", 2] },
        avgUnderstanding: { $round: ["$avgUnderstanding", 2] },
        avgParticipation: { $round: ["$avgParticipation", 2] },
        avgCoding: { $round: ["$avgCoding", 2] },
        avgOverall: { $round: ["$avgOverall", 2] },
        reviewCount: 1,
      },
    },
  ]);

  return trends;
};

// ─── 1b. Session Review Radar (overall averages, no time axis) ────────────────

/**
 * Collapse all of a student's session reviews into one average per metric.
 * Shaped for a radar/spider chart (Behavior, understanding, participation, coding).
 * Respects the same role-based access and optional date range as the trends.
 */
const getReviewRadarService = async (user, { profileId, from, to } = {}) => {
  const profileIds = await resolveProfileIds(user, profileId);
  if (!profileIds.length) {
    return { axes: [], reviewCount: 0 };
  }

  const dateMatch = buildDateMatch("createdAt", from, to);

  const result = await SessionReview.aggregate([
    {
      $match: {
        studentProfileId: { $in: profileIds },
        ...dateMatch,
      },
    },
    {
      $group: {
        _id: null,
        avgBehavior: { $avg: "$Behavior" },
        avgUnderstanding: { $avg: "$underStanding" },
        avgParticipation: { $avg: "$participation" },
        avgCoding: { $avg: "$coding" },
        avgOverall: { $avg: "$overAllRating" },
        reviewCount: { $sum: 1 },
      },
    },
  ]);

  if (!result.length) {
    return { axes: [], reviewCount: 0 };
  }

  const r = result[0];
  const round = (n) => (n == null ? 0 : Math.round(n * 100) / 100);

  // `max: 5` mirrors the SessionReview schema bounds so the frontend can scale axes.
  return {
    reviewCount: r.reviewCount,
    avgOverall: round(r.avgOverall),
    axes: [
      { metric: "Behavior", value: round(r.avgBehavior), max: 5 },
      { metric: "Understanding", value: round(r.avgUnderstanding), max: 5 },
      { metric: "Participation", value: round(r.avgParticipation), max: 5 },
      { metric: "Coding", value: round(r.avgCoding), max: 5 },
    ],
  };
};

// ─── 2. Task Completion Trends ────────────────────────────────────────────────

const getTaskTrendsService = async (user, { profileId, period = "monthly", from, to } = {}) => {
  const profileIds = await resolveProfileIds(user, profileId);
  if (!profileIds.length) return [];

  const dateMatch = buildDateMatch("createdAt", from, to);

  const trends = await Task.aggregate([
    {
      $match: {
        studentProfileId: { $in: profileIds },
        ...dateMatch,
      },
    },
    {
      $group: {
        _id: buildDateGroupId("$createdAt", period),
        totalTasks: { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
        pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
        canceled: { $sum: { $cond: [{ $eq: ["$status", "canceled"] }, 1, 0] } },
      },
    },
    { $sort: { "_id.year": 1, "_id.month": 1, "_id.week": 1 } },
    {
      $addFields: {
        completionRate: {
          $round: [
            {
              $cond: [{ $eq: ["$totalTasks", 0] }, 0, { $multiply: [{ $divide: ["$completed", "$totalTasks"] }, 100] }],
            },
            1,
          ],
        },
      },
    },
    {
      $project: {
        _id: 0,
        period: "$_id",
        totalTasks: 1,
        completed: 1,
        pending: 1,
        canceled: 1,
        completionRate: 1,
      },
    },
  ]);

  return trends;
};

// ─── 3. Submission Performance Trends ─────────────────────────────────────────

const getSubmissionTrendsService = async (user, { profileId, period = "monthly", from, to } = {}) => {
  const profileIds = await resolveProfileIds(user, profileId);
  if (!profileIds.length) return [];

  const dateMatch = buildDateMatch("createdAt", from, to);

  const trends = await Submission.aggregate([
    {
      $match: {
        studentProfileId: { $in: profileIds },
        ...dateMatch,
      },
    },
    {
      $group: {
        _id: buildDateGroupId("$createdAt", period),
        totalSubmissions: { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ["$status", "Completed"] }, 1, 0] } },
        pending: { $sum: { $cond: [{ $eq: ["$status", "Pending"] }, 1, 0] } },
        reviewed: { $sum: { $cond: [{ $eq: ["$status", "Reviewed"] }, 1, 0] } },
        resubmitted: { $sum: { $cond: [{ $eq: ["$status", "Resubmitted"] }, 1, 0] } },
        late: { $sum: { $cond: [{ $eq: ["$status", "Late submission"] }, 1, 0] } },
        avgScore: { $avg: "$review.score" },
      },
    },
    { $sort: { "_id.year": 1, "_id.month": 1, "_id.week": 1 } },
    {
      $addFields: {
        onTimeRate: {
          $round: [
            {
              $cond: [
                { $eq: ["$totalSubmissions", 0] },
                0,
                {
                  $multiply: [
                    {
                      $divide: [{ $subtract: ["$totalSubmissions", "$late"] }, "$totalSubmissions"],
                    },
                    100,
                  ],
                },
              ],
            },
            1,
          ],
        },
      },
    },
    {
      $project: {
        _id: 0,
        period: "$_id",
        totalSubmissions: 1,
        completed: 1,
        pending: 1,
        reviewed: 1,
        resubmitted: 1,
        late: 1,
        avgScore: { $round: [{ $ifNull: ["$avgScore", 0] }, 2] },
        onTimeRate: 1,
      },
    },
  ]);

  return trends;
};

// ─── 4. Exam Score Trends ─────────────────────────────────────────────────────

const getExamTrendsService = async (user, { profileId, period = "monthly", from, to } = {}) => {
  const profileIds = await resolveProfileIds(user, profileId);
  if (!profileIds.length) return [];

  const dateMatch = buildDateMatch("date", from, to);

  const trends = await Exam.aggregate([
    {
      $match: {
        studentProfileId: { $in: profileIds },
        ...dateMatch,
      },
    },
    {
      $group: {
        _id: buildDateGroupId("$date", period),
        totalExams: { $sum: 1 },
        avgScore: { $avg: "$score" },
        avgTotalMark: { $avg: "$totalMark" },
        highestScore: { $max: "$score" },
        lowestScore: { $min: "$score" },
        passed: {
          $sum: {
            $cond: [{ $gte: ["$score", "$passingMark"] }, 1, 0],
          },
        },
        failed: {
          $sum: {
            $cond: [{ $lt: ["$score", "$passingMark"] }, 1, 0],
          },
        },
      },
    },
    { $sort: { "_id.year": 1, "_id.month": 1, "_id.week": 1 } },
    {
      $addFields: {
        avgPercentage: {
          $round: [
            {
              $cond: [
                { $eq: ["$avgTotalMark", 0] },
                0,
                { $multiply: [{ $divide: ["$avgScore", "$avgTotalMark"] }, 100] },
              ],
            },
            1,
          ],
        },
        passRate: {
          $round: [
            {
              $cond: [
                { $eq: ["$totalExams", 0] },
                0,
                { $multiply: [{ $divide: ["$passed", "$totalExams"] }, 100] },
              ],
            },
            1,
          ],
        },
      },
    },
    {
      $project: {
        _id: 0,
        period: "$_id",
        totalExams: 1,
        avgScore: { $round: ["$avgScore", 2] },
        highestScore: 1,
        lowestScore: 1,
        avgPercentage: 1,
        passed: 1,
        failed: 1,
        passRate: 1,
      },
    },
  ]);

  return trends;
};

// ─── 5. Attendance Trends ─────────────────────────────────────────────────────

const getAttendanceTrendsService = async (user, { profileId, period = "monthly", from, to } = {}) => {
  const profileIds = await resolveProfileIds(user, profileId);
  if (!profileIds.length) return [];

  const dateMatch = buildDateMatch("date", from, to);

  const trends = await Session.aggregate([
    {
      $match: {
        studentProfileId: { $in: profileIds },
        status: { $ne: "canceled" },
        ...dateMatch,
      },
    },
    {
      $group: {
        _id: buildDateGroupId("$date", period),
        totalSessions: { $sum: 1 },
        attended: { $sum: { $cond: ["$StudentAttended", 1, 0] } },
        missed: { $sum: { $cond: ["$StudentAttended", 0, 1] } },
        studentCanceled: {
          $sum: { $cond: [{ $eq: ["$status", "student canceled"] }, 1, 0] },
        },
      },
    },
    { $sort: { "_id.year": 1, "_id.month": 1, "_id.week": 1 } },
    {
      $addFields: {
        attendanceRate: {
          $round: [
            {
              $cond: [
                { $eq: ["$totalSessions", 0] },
                0,
                { $multiply: [{ $divide: ["$attended", "$totalSessions"] }, 100] },
              ],
            },
            1,
          ],
        },
      },
    },
    {
      $project: {
        _id: 0,
        period: "$_id",
        totalSessions: 1,
        attended: 1,
        missed: 1,
        studentCanceled: 1,
        attendanceRate: 1,
      },
    },
  ]);

  return trends;
};

// ─── 6. Full Progress Overview ────────────────────────────────────────────────

const getFullProgressService = async (user, { profileId, period = "monthly", from, to } = {}) => {
  const params = { profileId, period, from, to };

  const [reviewTrends, taskTrends, submissionTrends, examTrends, attendanceTrends] = await Promise.all([
    getReviewTrendsService(user, params),
    getTaskTrendsService(user, params),
    getSubmissionTrendsService(user, params),
    getExamTrendsService(user, params),
    getAttendanceTrendsService(user, params),
  ]);

  // Build a combined current snapshot from latest data
  const latestReview = reviewTrends[reviewTrends.length - 1];
  const latestTask = taskTrends[taskTrends.length - 1];
  const latestSubmission = submissionTrends[submissionTrends.length - 1];
  const latestExam = examTrends[examTrends.length - 1];
  const latestAttendance = attendanceTrends[attendanceTrends.length - 1];

  // Calculate deltas (compare last period to second-to-last)
  const calcDelta = (arr, field) => {
    if (arr.length < 2) return null;
    const current = arr[arr.length - 1]?.[field] ?? 0;
    const previous = arr[arr.length - 2]?.[field] ?? 0;
    return Math.round((current - previous) * 100) / 100;
  };

  const snapshot = {
    currentPeriod: latestReview?.period || latestTask?.period || latestAttendance?.period || null,
    reviews: latestReview
      ? {
          avgOverall: latestReview.avgOverall,
          delta: calcDelta(reviewTrends, "avgOverall"),
          trend: calcDelta(reviewTrends, "avgOverall") > 0 ? "improving" : calcDelta(reviewTrends, "avgOverall") < 0 ? "declining" : "stable",
        }
      : null,
    tasks: latestTask
      ? {
          completionRate: latestTask.completionRate,
          delta: calcDelta(taskTrends, "completionRate"),
          trend: calcDelta(taskTrends, "completionRate") > 0 ? "improving" : calcDelta(taskTrends, "completionRate") < 0 ? "declining" : "stable",
        }
      : null,
    submissions: latestSubmission
      ? {
          avgScore: latestSubmission.avgScore,
          onTimeRate: latestSubmission.onTimeRate,
          scoreDelta: calcDelta(submissionTrends, "avgScore"),
          trend: calcDelta(submissionTrends, "avgScore") > 0 ? "improving" : calcDelta(submissionTrends, "avgScore") < 0 ? "declining" : "stable",
        }
      : null,
    exams: latestExam
      ? {
          avgPercentage: latestExam.avgPercentage,
          passRate: latestExam.passRate,
          delta: calcDelta(examTrends, "avgPercentage"),
          trend: calcDelta(examTrends, "avgPercentage") > 0 ? "improving" : calcDelta(examTrends, "avgPercentage") < 0 ? "declining" : "stable",
        }
      : null,
    attendance: latestAttendance
      ? {
          attendanceRate: latestAttendance.attendanceRate,
          delta: calcDelta(attendanceTrends, "attendanceRate"),
          trend: calcDelta(attendanceTrends, "attendanceRate") > 0 ? "improving" : calcDelta(attendanceTrends, "attendanceRate") < 0 ? "declining" : "stable",
        }
      : null,
  };

  return {
    snapshot,
    trends: {
      reviews: reviewTrends,
      tasks: taskTrends,
      submissions: submissionTrends,
      exams: examTrends,
      attendance: attendanceTrends,
    },
  };
};

// ─── 7. Per-Child Progress (Parent helper) ────────────────────────────────────

const getChildrenComparisonService = async (user, { period = "monthly", from, to } = {}) => {
  if (user.role !== "parent") {
    throw new AppErrorHelper("This endpoint is for parents only!", 403);
  }

  const children = await StudentProfile.find({ parents: user._id })
    .populate({ path: "user", select: "FullName UserName" })
    .lean();

  if (!children.length) {
    return [];
  }

  const comparisons = await Promise.all(
    children.map(async (child) => {
      const params = { profileId: child._id.toString(), period, from, to };

      // Run all trend queries in parallel for each child
      const [reviewTrends, taskTrends, attendanceTrends, examTrends] = await Promise.all([
        getReviewTrendsService(user, params),
        getTaskTrendsService(user, params),
        getAttendanceTrendsService(user, params),
        getExamTrendsService(user, params),
      ]);

      const latestReview = reviewTrends[reviewTrends.length - 1];
      const latestTask = taskTrends[taskTrends.length - 1];
      const latestAttendance = attendanceTrends[attendanceTrends.length - 1];
      const latestExam = examTrends[examTrends.length - 1];

      return {
        child: {
          profileId: child._id,
          fullName: child.user?.FullName,
          userName: child.user?.UserName,
          grade: child.grade,
        },
        latestStats: {
          reviewAvgOverall: latestReview?.avgOverall ?? null,
          taskCompletionRate: latestTask?.completionRate ?? null,
          attendanceRate: latestAttendance?.attendanceRate ?? null,
          examAvgPercentage: latestExam?.avgPercentage ?? null,
        },
      };
    }),
  );

  return comparisons;
};

// ─── 8. Exam Analytics Summary ───────────────────────────────────────────────

const getExamAnalyticsSummaryService = async (user, profileId, { lastN = 10 } = {}) => {
  const profileIds = await resolveProfileIds(user, profileId);
  if (!profileIds.length) return null;

  const targetId = profileIds[0];

  const exams = await Exam.find({ studentProfileId: targetId })
    .sort({ date: -1 })
    .limit(Number(lastN))
    .lean();

  if (!exams.length) {
    return { totalExams: 0, avgPercentage: 0, passRate: 0, weakestTopic: null, topicBreakdown: [], trend: [] };
  }

  const examWithPct = exams.map((e) => ({
    ...e,
    percentage: e.totalMark ? Math.round((e.score / e.totalMark) * 100) : 0,
    passed: e.score >= e.passingMark,
  }));

  const avgPercentage = Math.round(
    examWithPct.reduce((s, e) => s + e.percentage, 0) / examWithPct.length
  );
  const passRate = Math.round(
    (examWithPct.filter((e) => e.passed).length / examWithPct.length) * 100
  );

  const topicMap = {};
  examWithPct.forEach((e) => {
    if (!topicMap[e.title]) topicMap[e.title] = { sum: 0, count: 0 };
    topicMap[e.title].sum += e.percentage;
    topicMap[e.title].count++;
  });

  const topicBreakdown = Object.entries(topicMap)
    .map(([topic, { sum, count }]) => ({ topic, avgPercentage: Math.round(sum / count), count }))
    .sort((a, b) => a.avgPercentage - b.avgPercentage);

  const weakestTopic = topicBreakdown[0]?.topic || null;

  const trend = [...examWithPct].reverse().map((e) => ({
    date: e.date,
    title: e.title,
    score: e.score,
    totalMark: e.totalMark,
    percentage: e.percentage,
    passed: e.passed,
  }));

  return { totalExams: exams.length, avgPercentage, passRate, weakestTopic, topicBreakdown, trend };
};

// ─── 9. Parent Dashboard ──────────────────────────────────────────────────────

const getParentDashboardService = async (user, profileId) => {
  const profileIds = await resolveProfileIds(user, profileId);
  if (!profileIds.length) throw new AppErrorHelper("Access denied to this student profile", 403);

  const targetId = profileIds[0];

  const [childProfile, recentExams, upcomingTasks, latestReview, attendanceStats] = await Promise.all([
    StudentProfile.findById(targetId).populate("user", "FullName Email UserName").lean(),
    Exam.find({ studentProfileId: targetId }).sort({ date: -1 }).limit(5).lean(),
    Task.find({ studentProfileId: targetId, status: "pending", dueDate: { $gte: new Date() } })
      .sort({ dueDate: 1 })
      .limit(5)
      .lean(),
    SessionReview.findOne({ studentProfileId: targetId }).sort({ createdAt: -1 }).lean(),
    Session.aggregate([
      { $match: { studentProfileId: targetId, deletedAt: null } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          attended: { $sum: { $cond: ["$StudentAttended", 1, 0] } },
        },
      },
    ]),
  ]);

  const att = attendanceStats[0] || { total: 0, attended: 0 };
  const attendanceRate = att.total ? Math.round((att.attended / att.total) * 100) : 0;

  return {
    student: {
      profileId: childProfile?._id,
      fullName: childProfile?.user?.FullName,
      grade: childProfile?.grade,
      attendanceStreak: childProfile?.attendanceStreak || 0,
    },
    attendance: { total: att.total, attended: att.attended, attendanceRate },
    recentExams: recentExams.map((e) => ({
      title: e.title,
      score: e.score,
      totalMark: e.totalMark,
      percentage: e.totalMark ? Math.round((e.score / e.totalMark) * 100) : 0,
      passed: e.score >= e.passingMark,
      date: e.date,
    })),
    upcomingTasks: upcomingTasks.map((t) => ({ title: t.title, dueDate: t.dueDate, status: t.status })),
    latestReview: latestReview
      ? {
          overAllRating: latestReview.overAllRating,
          behavior: latestReview.Behavior,
          understanding: latestReview.underStanding,
          date: latestReview.createdAt,
        }
      : null,
  };
};

export {
  getReviewTrendsService,
  getReviewRadarService,
  getTaskTrendsService,
  getSubmissionTrendsService,
  getExamTrendsService,
  getAttendanceTrendsService,
  getFullProgressService,
  getChildrenComparisonService,
  getExamAnalyticsSummaryService,
  getParentDashboardService,
};
