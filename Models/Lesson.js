import mongoose from "mongoose";

const contentPageSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: ["text", "code_sandbox", "concept_animation", "mini_quiz"],
    },
    title: {
      type: String,
      trim: true,
    },
    text: {
      type: String,
      trim: true,
    },
    codeSnippet: {
      type: String,
      trim: true,
    },
    animationConfig: {
      type: mongoose.Schema.Types.Mixed, // flexible JSON for frontend animations
    },
    quizData: {
      question: { type: String, trim: true },
      options: [{ type: String, trim: true }],
      correctAnswer: { type: String, trim: true },
    },
  },
  { _id: false }
);

const lessonSchema = new mongoose.Schema(
  {
    courseId: {
      type: mongoose.Schema.ObjectId,
      ref: "Course",
      required: [true, "Course association is required"],
    },
    moduleTitle: {
      type: String,
      required: [true, "Module title is required"],
      trim: true,
    },
    title: {
      type: String,
      required: [true, "Lesson title is required"],
      trim: true,
    },
    order: {
      type: Number,
      default: 0,
    },
    xpReward: {
      type: Number,
      default: 15,
      min: 0,
    },
    pages: [contentPageSchema],
    isActive: {
      type: Boolean,
      default: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

lessonSchema.index({ courseId: 1, order: 1 });
lessonSchema.index({ isActive: 1 });

// Soft delete pre-find hook
lessonSchema.pre(/^find/, function () {
  if (!this.getOptions().withDeleted) {
    this.find({ deletedAt: null });
  }
});

const Lesson = mongoose.model("Lesson", lessonSchema);

export default Lesson;
