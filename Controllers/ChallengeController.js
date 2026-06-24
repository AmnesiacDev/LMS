import CatchAsync from "../Utilities/CatchAsync.js";
import AppErrorHelper from "../Utilities/AppErrorHelper.js";
import {
  createChallengeService,
  getAllChallengesService,
  getChallengeByIdService,
  updateChallengeService,
  deleteChallengeService,
  startAttemptService,
  submitPuzzleAnswerService,
  submitCodingChallengeService,
  gradeCodingChallengeService,
  useHintService,
  getMyAttemptsService,
  getChallengeLeaderboardService,
  getAllAttemptsService,
} from "../Services/ChallengeService.js";
import { resolveStudentProfileId } from "../Services/GamificationService.js";

// ─── CRUD ────────────────────────────────────────────────────────────────────

const createChallengeController = CatchAsync(async (req, res, next) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    return next(new AppErrorHelper("Data is missing!", 400));
  }

  req.body.createdBy = req.user._id;
  const challenge = await createChallengeService(req.body);

  res.status(201).json({
    status: "success",
    data: { challenge },
  });
});

const getAllChallengesController = CatchAsync(async (req, res, next) => {
  const challenges = await getAllChallengesService(req.query);

  res.status(200).json({
    status: "success",
    results: challenges.length,
    data: { challenges },
  });
});

const getChallengeByIdController = CatchAsync(async (req, res, next) => {
  const challenge = await getChallengeByIdService(req.params.id, req.user);

  res.status(200).json({
    status: "success",
    data: { challenge },
  });
});

const updateChallengeController = CatchAsync(async (req, res, next) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    return next(new AppErrorHelper("Data is missing!", 400));
  }

  const challenge = await updateChallengeService(req.params.id, req.body);

  res.status(200).json({
    status: "success",
    data: { challenge },
  });
});

const deleteChallengeController = CatchAsync(async (req, res, next) => {
  await deleteChallengeService(req.params.id);

  res.status(204).json({
    status: "success",
    data: null,
  });
});

// ─── Attempt Flow ────────────────────────────────────────────────────────────

const startAttemptController = CatchAsync(async (req, res, next) => {
  const profileId = await resolveStudentProfileId(req.user);
  const attempt = await startAttemptService(req.params.id, profileId);

  res.status(201).json({
    status: "success",
    data: { attempt },
  });
});

const submitPuzzleAnswerController = CatchAsync(async (req, res, next) => {
  const { selectedAnswer } = req.body;
  if (!selectedAnswer) {
    return next(new AppErrorHelper("selectedAnswer is required", 400));
  }

  const profileId = await resolveStudentProfileId(req.user);
  const attempt = await submitPuzzleAnswerService(req.params.id, profileId, selectedAnswer);

  res.status(200).json({
    status: "success",
    data: {
      attempt,
      isCorrect: attempt.isCorrect,
      xpAwarded: attempt.xpAwarded,
    },
  });
});

const submitCodingChallengeController = CatchAsync(async (req, res, next) => {
  const profileId = await resolveStudentProfileId(req.user);
  const attempt = await submitCodingChallengeService(req.params.id, profileId, req.body);

  res.status(200).json({
    status: "success",
    message: "Code submitted! Awaiting instructor review.",
    data: { attempt },
  });
});

const gradeCodingChallengeController = CatchAsync(async (req, res, next) => {
  const { score, feedback } = req.body;

  if (score === undefined || score === null) {
    return next(new AppErrorHelper("Score is required (0-100)", 400));
  }

  const attempt = await gradeCodingChallengeService(
    req.params.attemptId,
    score,
    feedback,
    req.user._id,
  );

  res.status(200).json({
    status: "success",
    data: { attempt },
  });
});

const useHintController = CatchAsync(async (req, res, next) => {
  const profileId = await resolveStudentProfileId(req.user);
  const hint = await useHintService(req.params.id, profileId);

  res.status(200).json({
    status: "success",
    data: hint,
  });
});

const getAllAttemptsController = CatchAsync(async (req, res, next) => {
  const attempts = await getAllAttemptsService(req.query);

  res.status(200).json({
    status: "success",
    results: attempts.length,
    data: { attempts },
  });
});

const getMyAttemptsController = CatchAsync(async (req, res, next) => {
  const profileId = await resolveStudentProfileId(req.user);
  const attempts = await getMyAttemptsService(profileId, req.query);

  res.status(200).json({
    status: "success",
    results: attempts.length,
    data: { attempts },
  });
});

const getChallengeLeaderboardController = CatchAsync(async (req, res, next) => {
  const leaderboard = await getChallengeLeaderboardService(req.params.id, req.query);

  res.status(200).json({
    status: "success",
    results: leaderboard.length,
    data: { leaderboard },
  });
});

export {
  createChallengeController,
  getAllChallengesController,
  getChallengeByIdController,
  updateChallengeController,
  deleteChallengeController,
  startAttemptController,
  submitPuzzleAnswerController,
  submitCodingChallengeController,
  gradeCodingChallengeController,
  useHintController,
  getMyAttemptsController,
  getChallengeLeaderboardController,
  getAllAttemptsController,
};
