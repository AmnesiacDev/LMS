import mongoose from "mongoose";

const testCaseSchema = new mongoose.Schema(
  {
    input: { type: String, required: true },
    expectedOutput: { type: String, required: true },
    isHidden: { type: Boolean, default: false },
  },
  { _id: false },
);

const challengeSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: [3, "Challenge title must be at least 3 characters"],
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      required: true,
      enum: ["coding", "puzzle"],
    },
    difficulty: {
      type: String,
      required: true,
      enum: ["easy", "medium", "hard"],
    },

    // ─── Puzzle-specific fields ──────────────────────────────────────────
    puzzleData: {
      questionType: {
        type: String,
        enum: ["multiple_choice", "fill_blank"],
      },
      options: [{ type: String }], // for multiple_choice
      correctAnswer: { type: String, select: false }, // hidden from students
    },

    // ─── Coding-specific fields ─────────────────────────────────────────
    codingData: {
      starterCode: { type: String },
      hints: [{ type: String }],
      testCases: [testCaseSchema],
    },

    xpReward: {
      type: Number,
      required: true,
      min: 0,
    },
    timeLimit: {
      type: Number,
      default: 0, // minutes, 0 = unlimited
      min: 0,
    },
    createdBy: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    tags: [{ type: String, trim: true, lowercase: true }],

    deletedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

challengeSchema.index({ type: 1, difficulty: 1 });
challengeSchema.index({ tags: 1 });
challengeSchema.index({ isActive: 1 });
challengeSchema.index({ createdBy: 1 });

// Soft-delete filter (consistent with Task/Session pattern)
challengeSchema.pre(/^find/, function () {
  if (!this.getOptions().withDeleted) {
    this.find({ deletedAt: null });
  }
});

const Challenge = mongoose.model("Challenge", challengeSchema);

export default Challenge;
