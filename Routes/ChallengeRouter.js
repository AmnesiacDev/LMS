import express from "express";
import { protectionController, restrictedToController } from "../Controllers/AuthController.js";
import { validate } from "../Middleware/validate.js";
import {
  createChallengeSchema,
  updateChallengeSchema,
  submitPuzzleSchema,
  submitCodingSchema,
  gradeCodingSchema,
} from "../Validation/challengeValidation.js";
import {
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
} from "../Controllers/ChallengeController.js";

const router = express.Router();

// All challenge routes require authentication
router.use(protectionController);

// ─── Student attempt routes (must come before /:id to avoid conflicts) ────────
router.get("/my-attempts", restrictedToController("student"), getMyAttemptsController);

// ─── Read routes (all authenticated users) ───────────────────────────────────
router.get("/", getAllChallengesController);
router.get("/:id", getChallengeByIdController);
router.get("/:id/leaderboard", getChallengeLeaderboardController);

// ─── Student attempt flow ─────────────────────────────────────────────────────
router.post("/:id/start", restrictedToController("student"), startAttemptController);
router.post(
  "/:id/submit-puzzle",
  restrictedToController("student"),
  validate(submitPuzzleSchema),
  submitPuzzleAnswerController,
);
router.post(
  "/:id/submit-code",
  restrictedToController("student"),
  validate(submitCodingSchema),
  submitCodingChallengeController,
);
router.post("/:id/hint", restrictedToController("student"), useHintController);

// ─── Instructor / Admin routes ────────────────────────────────────────────────
router.post(
  "/",
  restrictedToController("instructor", "admin"),
  validate(createChallengeSchema),
  createChallengeController,
);
router.patch(
  "/:id",
  restrictedToController("instructor", "admin"),
  validate(updateChallengeSchema),
  updateChallengeController,
);
router.delete("/:id", restrictedToController("instructor", "admin"), deleteChallengeController);
router.patch(
  "/attempts/:attemptId/grade",
  restrictedToController("instructor", "admin"),
  validate(gradeCodingSchema),
  gradeCodingChallengeController,
);

export default router;
