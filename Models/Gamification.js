import mongoose from "mongoose";

/**
 * How much XP is needed per level.
 * Level = Math.floor(xp / XP_PER_LEVEL) + 1
 */
export const XP_PER_LEVEL = 100;

const xpEntrySchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true },
    reason: {
      type: String,
      required: true,
      enum: [
        "task_submit",
        "task_submit_late",
        "review_perfect",
        "review_excellent",
        "session_attended",
        "streak_bonus",
        "challenge_solved",
        "puzzle_solved",
        "exam_passed",
        "badge_bonus",
      ],
    },
    sourceId: { type: mongoose.Schema.ObjectId },
    awardedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const gamificationSchema = new mongoose.Schema(
  {
    studentProfileId: {
      type: mongoose.Schema.ObjectId,
      ref: "StudentProfile",
      required: true,
      unique: true,
    },
    xp: { type: Number, default: 0, min: 0 },
    level: { type: Number, default: 1, min: 1 },
    lifetimeXP: { type: Number, default: 0, min: 0 },

    // Streak tracking
    currentStreak: { type: Number, default: 0, min: 0 },
    longestStreak: { type: Number, default: 0, min: 0 },
    lastActivityDate: { type: Date },

    // Counters for badge evaluation
    stats: {
      tasksSubmitted: { type: Number, default: 0, min: 0 },
      tasksOnTime: { type: Number, default: 0, min: 0 },
      perfectScores: { type: Number, default: 0, min: 0 },
      sessionsAttended: { type: Number, default: 0, min: 0 },
      challengesSolved: { type: Number, default: 0, min: 0 },
      puzzlesSolved: { type: Number, default: 0, min: 0 },
      examsAbovePassing: { type: Number, default: 0, min: 0 },
    },

    // XP history for audit / trends
    xpHistory: [xpEntrySchema],
  },
  { timestamps: true },
);

gamificationSchema.index({ studentProfileId: 1 }, { unique: true });
gamificationSchema.index({ xp: -1 }); // leaderboard sort
gamificationSchema.index({ level: -1 });

// Auto-calculate level before every save
gamificationSchema.pre("save", function () {
  this.level = Math.floor(this.xp / XP_PER_LEVEL) + 1;
});

const Gamification = mongoose.model("Gamification", gamificationSchema);

export default Gamification;
