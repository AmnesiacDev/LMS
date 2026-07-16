import Challenge from "../Models/Challenge.js";
import ChallengeAttempt from "../Models/ChallengeAttempt.js";
import StudentProfile from "../Models/studentProfile.js";
import { awardXP } from "./GamificationService.js";
import { notifyStudentAndParents, notifyUsers, getStudentRecipients } from "./NotificationHelpers.js";
import AppErrorHelper from "../Utilities/AppErrorHelper.js";
import ApiFeatures from "../Utilities/ApiFeatures.js";
import mongoose from "mongoose";

// ─── XP multipliers by difficulty ────────────────────────────────────────────
const HINT_PENALTY_PERCENT = 0.2; // 20% XP reduction per hint used

// ─── CRUD ────────────────────────────────────────────────────────────────────

export const createChallengeService = async (data) => {
  const { title, description, type, difficulty, puzzleData, codingData, xpReward, timeLimit, createdBy, tags } = data;

  if (type === "puzzle") {
    if (!puzzleData?.questionType || !puzzleData?.correctAnswer) {
      throw new AppErrorHelper("Puzzle challenges require questionType and correctAnswer", 400);
    }
    if (puzzleData.questionType === "multiple_choice" && (!puzzleData.options || puzzleData.options.length < 2)) {
      throw new AppErrorHelper("Multiple choice puzzles require at least 2 options", 400);
    }
  }

  if (type === "coding" && (!codingData || !codingData.testCases?.length)) {
    throw new AppErrorHelper("Coding challenges require at least one test case", 400);
  }

  return Challenge.create({
    title,
    description,
    type,
    difficulty,
    puzzleData: type === "puzzle" ? puzzleData : undefined,
    codingData: type === "coding" ? codingData : undefined,
    xpReward,
    timeLimit,
    createdBy,
    tags,
  });
};

export const getAllChallengesService = async (queryString = {}) => {
  const features = new ApiFeatures(
    Challenge.find({ isActive: true }).populate("createdBy", "FullName UserName"),
    queryString,
  )
    .filter()
    .sort()
    .fields()
    .pagination();

  return features.mongooseQuery;
};

export const getChallengeByIdService = async (id, user) => {
  // Instructors/admins can see correct answers; students cannot
  const isStaff = user && (user.role === "instructor" || user.role === "admin");

  let query = Challenge.findById(id).populate("createdBy", "FullName UserName");

  if (isStaff) {
    // Select hidden fields for staff
    query = query.select("+puzzleData.correctAnswer");
  }

  const challenge = await query;
  if (!challenge) throw new AppErrorHelper("Challenge not found", 404);

  return challenge;
};

export const updateChallengeService = async (id, data) => {
  const challenge = await Challenge.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });

  if (!challenge) throw new AppErrorHelper("Challenge not found", 404);
  return challenge;
};

export const deleteChallengeService = async (id) => {
  const challenge = await Challenge.findByIdAndUpdate(
    id,
    { deletedAt: new Date() },
    { new: true },
  );

  if (!challenge) throw new AppErrorHelper("Challenge not found", 404);
  return challenge;
};

// ─── Attempts ────────────────────────────────────────────────────────────────

export const startAttemptService = async (challengeId, studentProfileId) => {
  // Check if challenge exists and is active
  const challenge = await Challenge.findById(challengeId);
  if (!challenge || !challenge.isActive) {
    throw new AppErrorHelper("Challenge not found or inactive", 404);
  }

  // Check for existing attempt
  const existing = await ChallengeAttempt.findOne({
    challenge: challengeId,
    studentProfileId,
  });

  if (existing) {
    if (existing.status === "in_progress") {
      return existing; // Resume existing attempt
    }
    throw new AppErrorHelper("You have already attempted this challenge", 400);
  }

  return ChallengeAttempt.create({
    challenge: challengeId,
    studentProfileId,
    startedAt: new Date(),
  });
};

export const submitPuzzleAnswerService = async (challengeId, studentProfileId, selectedAnswer) => {
  const attempt = await ChallengeAttempt.findOne({
    challenge: challengeId,
    studentProfileId,
  });

  if (!attempt) throw new AppErrorHelper("No attempt found. Start the challenge first.", 404);
  if (attempt.status !== "in_progress") {
    throw new AppErrorHelper("This challenge has already been submitted", 400);
  }

  // Load challenge with correct answer
  const challenge = await Challenge.findById(challengeId).select("+puzzleData.correctAnswer");
  if (!challenge || challenge.type !== "puzzle") {
    throw new AppErrorHelper("Invalid puzzle challenge", 400);
  }

  // Auto-evaluate
  const isCorrect =
    selectedAnswer.toLowerCase().trim() === challenge.puzzleData.correctAnswer.toLowerCase().trim();

  // Calculate time spent
  const now = new Date();
  const timeSpent = Math.floor((now - attempt.startedAt) / 1000);

  // Check time limit
  if (challenge.timeLimit > 0) {
    const timeLimitSeconds = challenge.timeLimit * 60;
    if (timeSpent > timeLimitSeconds) {
      attempt.status = "incorrect";
      attempt.selectedAnswer = selectedAnswer;
      attempt.isCorrect = false;
      attempt.completedAt = now;
      attempt.timeSpent = timeSpent;
      await attempt.save();
      throw new AppErrorHelper("Time limit exceeded!", 400);
    }
  }

  attempt.selectedAnswer = selectedAnswer;
  attempt.isCorrect = isCorrect;
  attempt.completedAt = now;
  attempt.timeSpent = timeSpent;
  attempt.status = isCorrect ? "correct" : "incorrect";
  attempt.score = isCorrect ? 100 : 0;

  // Award XP if correct
  if (isCorrect) {
    let xp = challenge.xpReward;

    // Hint penalty
    if (attempt.hintsUsed > 0) {
      const penalty = Math.min(attempt.hintsUsed * HINT_PENALTY_PERCENT, 0.8); // Max 80% reduction
      xp = Math.max(Math.floor(xp * (1 - penalty)), 1); // At least 1 XP
    }

    attempt.xpAwarded = xp;
    await awardXP(studentProfileId, xp, "puzzle_solved", challenge._id);
  }

  await attempt.save();
  return attempt;
};

export const submitCodingChallengeService = async (challengeId, studentProfileId, data) => {
  const attempt = await ChallengeAttempt.findOne({
    challenge: challengeId,
    studentProfileId,
  });

  if (!attempt) throw new AppErrorHelper("No attempt found. Start the challenge first.", 404);
  if (attempt.status !== "in_progress") {
    throw new AppErrorHelper("This challenge has already been submitted", 400);
  }

  const challenge = await Challenge.findById(challengeId);
  if (!challenge || challenge.type !== "coding") {
    throw new AppErrorHelper("Invalid coding challenge", 400);
  }

  const now = new Date();

  attempt.submittedCode = data.submittedCode || "";
  attempt.codeLinks = data.codeLinks || [];
  attempt.hintsUsed = data.hintsUsed || attempt.hintsUsed;
  attempt.completedAt = now;
  attempt.timeSpent = Math.floor((now - attempt.startedAt) / 1000);
  attempt.status = "pending"; // Awaiting instructor grading

  // Validate submission has content
  if (!attempt.submittedCode && (!attempt.codeLinks || !attempt.codeLinks.length)) {
    throw new AppErrorHelper("Submit code or at least one code link", 400);
  }

  await attempt.save();

  // Alert the challenge author (instructor) that there's work to grade
  (async () => {
    if (!challenge.createdBy) return;
    const { studentUserId, studentName } = await getStudentRecipients(studentProfileId);
    notifyUsers([challenge.createdBy], {
      sender: studentUserId,
      type: "new_submission",
      title: "📥 Coding challenge submitted",
      message: `${studentName} submitted "${challenge.title}" for grading.`,
      link: "/challenges/manage",
    });
  })().catch(() => {});

  return attempt;
};

export const gradeCodingChallengeService = async (attemptId, score, feedback, gradedBy) => {
  const attempt = await ChallengeAttempt.findById(attemptId);
  if (!attempt) throw new AppErrorHelper("Attempt not found", 404);
  if (attempt.status !== "pending") {
    throw new AppErrorHelper("This attempt is not pending grading", 400);
  }

  const challenge = await Challenge.findById(
    attempt.challenge._id || attempt.challenge,
  );
  if (!challenge) throw new AppErrorHelper("Challenge not found", 404);

  attempt.score = score;
  attempt.feedback = feedback;
  attempt.gradedBy = gradedBy;
  attempt.status = "graded";

  // Award proportional XP based on score (score is 0-100)
  if (score > 0) {
    let xp = Math.floor((challenge.xpReward * score) / 100);

    // Hint penalty
    if (attempt.hintsUsed > 0) {
      const penalty = Math.min(attempt.hintsUsed * HINT_PENALTY_PERCENT, 0.8);
      xp = Math.max(Math.floor(xp * (1 - penalty)), 1);
    }

    attempt.xpAwarded = xp;

    const studentProfileId = attempt.studentProfileId._id || attempt.studentProfileId;
    await awardXP(studentProfileId, xp, "challenge_solved", challenge._id);
  }

  await attempt.save();

  // Notify student + parents that the coding challenge was graded
  const gradedProfileId = attempt.studentProfileId?._id || attempt.studentProfileId;
  notifyStudentAndParents(gradedProfileId, {
    type: "challenge_graded",
    link: "/challenges",
    sender: gradedBy,
    studentTitle: `🧩 Challenge graded: ${challenge.title}`,
    studentMessage: `Your "${challenge.title}" submission scored ${score}/100${attempt.xpAwarded ? `, +${attempt.xpAwarded} XP` : ""}.`,
    parentTitle: (name) => `🧩 ${name}'s challenge was graded`,
    parentMessage: (name) => `${name}'s "${challenge.title}" submission scored ${score}/100.`,
  }).catch(() => {});

  return attempt;
};

export const useHintService = async (challengeId, studentProfileId) => {
  const attempt = await ChallengeAttempt.findOne({
    challenge: challengeId,
    studentProfileId,
  });

  if (!attempt) throw new AppErrorHelper("No attempt found", 404);
  if (attempt.status !== "in_progress") {
    throw new AppErrorHelper("Challenge is not in progress", 400);
  }

  const challenge = await Challenge.findById(challengeId);
  if (!challenge || challenge.type !== "coding") {
    throw new AppErrorHelper("Hints are only available for coding challenges", 400);
  }

  const totalHints = challenge.codingData?.hints?.length || 0;
  if (attempt.hintsUsed >= totalHints) {
    throw new AppErrorHelper("No more hints available", 400);
  }

  attempt.hintsUsed += 1;
  await attempt.save();

  // Return the next hint (0-indexed)
  return {
    hintNumber: attempt.hintsUsed,
    totalHints,
    hint: challenge.codingData.hints[attempt.hintsUsed - 1],
    xpPenalty: `${Math.min(attempt.hintsUsed * HINT_PENALTY_PERCENT * 100, 80)}%`,
  };
};

export const getMyAttemptsService = async (studentProfileId, queryString = {}) => {
  const features = new ApiFeatures(
    ChallengeAttempt.find({ studentProfileId }),
    queryString,
  )
    .filter()
    .sort()
    .fields()
    .pagination();

  return features.mongooseQuery;
};

export const getAllAttemptsService = async (queryString = {}) => {
  const features = new ApiFeatures(
    ChallengeAttempt.find()
      .populate({
        path: "studentProfileId",
        populate: { path: "user", select: "FullName UserName email" }
      })
      .populate("challenge", "title type difficulty xpReward"),
    queryString,
  )
    .filter()
    .sort()
    .fields()
    .pagination();

  return features.mongooseQuery;
};

export const getChallengeLeaderboardService = async (challengeId, queryString = {}) => {
  const page = parseInt(queryString.page, 10) || 1;
  const limit = parseInt(queryString.limit, 10) || 20;
  const skip = (page - 1) * limit;

  const results = await ChallengeAttempt.aggregate([
    {
      $match: {
        challenge: new mongoose.Types.ObjectId(challengeId),
        status: { $in: ["correct", "graded"] },
        score: { $gt: 0 },
      },
    },
    { $sort: { score: -1, timeSpent: 1 } }, // Highest score, fastest time
    {
      $lookup: {
        from: "studentprofiles",
        localField: "studentProfileId",
        foreignField: "_id",
        as: "profile",
      },
    },
    { $unwind: "$profile" },
    {
      $lookup: {
        from: "users",
        localField: "profile.user",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: "$user" },
    {
      $project: {
        studentName: "$user.FullName",
        avatar: "$user.avatar",
        grade: "$profile.grade",
        score: 1,
        timeSpent: 1,
        xpAwarded: 1,
        completedAt: 1,
      },
    },
    {
      $setWindowFields: {
        sortBy: { score: -1, timeSpent: 1 },
        output: { rank: { $rank: {} } },
      },
    },
    { $skip: skip },
    { $limit: limit },
  ]);

  return results;
};
