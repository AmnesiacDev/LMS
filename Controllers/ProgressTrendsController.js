import {
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
} from "../Services/ProgressTrendsService.js";
import AppErrorHelper from "../Utilities/AppErrorHelper.js";

/**
 * Extract common query params: period, from, to, profileId
 */
const extractParams = (req) => ({
  profileId: req.params.profileId || req.query.profileId,
  period: req.query.period || "monthly",
  from: req.query.from,
  to: req.query.to,
});

// ─── Review Trends ────────────────────────────────────────────────────────────

const getReviewTrendsController = async (req, res, next) => {
  try {
    const data = await getReviewTrendsService(req.user, extractParams(req));

    res.status(200).json({
      status: "success",
      results: data.length,
      data,
    });
  } catch (error) {
    next(error);
  }
};

// ─── Review Radar (overall averages for a radar chart) ────────────────────────

const getReviewRadarController = async (req, res, next) => {
  try {
    const { profileId, from, to } = extractParams(req);
    const data = await getReviewRadarService(req.user, { profileId, from, to });

    res.status(200).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

// ─── Task Trends ──────────────────────────────────────────────────────────────

const getTaskTrendsController = async (req, res, next) => {
  try {
    const data = await getTaskTrendsService(req.user, extractParams(req));

    res.status(200).json({
      status: "success",
      results: data.length,
      data,
    });
  } catch (error) {
    next(error);
  }
};

// ─── Submission Trends ────────────────────────────────────────────────────────

const getSubmissionTrendsController = async (req, res, next) => {
  try {
    const data = await getSubmissionTrendsService(req.user, extractParams(req));

    res.status(200).json({
      status: "success",
      results: data.length,
      data,
    });
  } catch (error) {
    next(error);
  }
};

// ─── Exam Trends ──────────────────────────────────────────────────────────────

const getExamTrendsController = async (req, res, next) => {
  try {
    const data = await getExamTrendsService(req.user, extractParams(req));

    res.status(200).json({
      status: "success",
      results: data.length,
      data,
    });
  } catch (error) {
    next(error);
  }
};

// ─── Attendance Trends ────────────────────────────────────────────────────────

const getAttendanceTrendsController = async (req, res, next) => {
  try {
    const data = await getAttendanceTrendsService(req.user, extractParams(req));

    res.status(200).json({
      status: "success",
      results: data.length,
      data,
    });
  } catch (error) {
    next(error);
  }
};

// ─── Full Progress Overview ───────────────────────────────────────────────────

const getFullProgressController = async (req, res, next) => {
  try {
    const data = await getFullProgressService(req.user, extractParams(req));

    res.status(200).json({
      status: "success",
      data,
    });
  } catch (error) {
    next(error);
  }
};

// ─── Children Comparison (Parent only) ────────────────────────────────────────

const getChildrenComparisonController = async (req, res, next) => {
  try {
    const data = await getChildrenComparisonService(req.user, extractParams(req));

    res.status(200).json({
      status: "success",
      results: data.length,
      data,
    });
  } catch (error) {
    next(error);
  }
};

// ─── Exam Analytics Summary ───────────────────────────────────────────────────

const getExamAnalyticsSummaryController = async (req, res, next) => {
  try {
    const data = await getExamAnalyticsSummaryService(
      req.user,
      req.params.profileId || req.query.profileId,
      { lastN: req.query.lastN || 10 }
    );
    res.status(200).json({ status: "success", data });
  } catch (error) {
    next(error);
  }
};

// ─── Parent Dashboard ─────────────────────────────────────────────────────────

const getParentDashboardController = async (req, res, next) => {
  try {
    const data = await getParentDashboardService(
      req.user,
      req.params.profileId || req.query.profileId
    );
    res.status(200).json({ status: "success", data });
  } catch (error) {
    next(error);
  }
};

export {
  getReviewTrendsController,
  getReviewRadarController,
  getTaskTrendsController,
  getSubmissionTrendsController,
  getExamTrendsController,
  getAttendanceTrendsController,
  getFullProgressController,
  getChildrenComparisonController,
  getExamAnalyticsSummaryController,
  getParentDashboardController,
};
