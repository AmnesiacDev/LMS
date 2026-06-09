import mongoose from "mongoose";

const challengeAttemptSchema = new mongoose.Schema(
  {
    challenge: {
      type: mongoose.Schema.ObjectId,
      ref: "Challenge",
      required: true,
    },
    studentProfileId: {
      type: mongoose.Schema.ObjectId,
      ref: "StudentProfile",
      required: true,
    },

    // ─── Puzzle attempt fields ────────────────────────────────────────────
    selectedAnswer: { type: String },
    isCorrect: { type: Boolean },

    // ─── Coding attempt fields ───────────────────────────────────────────
    submittedCode: { type: String },
    codeLinks: [
      {
        name: { type: String, required: true },
        url: { type: String, required: true },
      },
    ],

    // ─── Grading ─────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ["in_progress", "pending", "correct", "incorrect", "graded"],
      default: "in_progress",
    },
    score: {
      type: Number,
      min: 0,
      max: 100,
    },
    feedback: { type: String },
    gradedBy: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
    },

    // ─── Timing ──────────────────────────────────────────────────────────
    startedAt: {
      type: Date,
      default: Date.now,
    },
    completedAt: { type: Date },
    timeSpent: { type: Number, default: 0 }, // seconds

    xpAwarded: { type: Number, default: 0, min: 0 },
    hintsUsed: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

// One attempt per student per challenge
challengeAttemptSchema.index({ challenge: 1, studentProfileId: 1 }, { unique: true });
challengeAttemptSchema.index({ studentProfileId: 1 });
challengeAttemptSchema.index({ status: 1 });

challengeAttemptSchema.pre(/^find/, function () {
  this.populate([
    { path: "challenge", select: "title type difficulty xpReward tags" },
    { path: "studentProfileId", select: "user grade" },
  ]);
});

const ChallengeAttempt = mongoose.model("ChallengeAttempt", challengeAttemptSchema);

export default ChallengeAttempt;
