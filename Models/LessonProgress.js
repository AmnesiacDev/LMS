import mongoose from "mongoose";

const lessonProgressSchema = new mongoose.Schema(
  {
    studentProfileId: {
      type: mongoose.Schema.ObjectId,
      ref: "StudentProfile",
      required: [true, "Student Profile ID is required"],
    },
    lessonId: {
      type: mongoose.Schema.ObjectId,
      ref: "Lesson",
      required: [true, "Lesson ID is required"],
    },
    completed: {
      type: Boolean,
      default: false,
    },
    completedAt: {
      type: Date,
    },
    quizScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

// A student has at most one progress status entry per lesson
lessonProgressSchema.index({ studentProfileId: 1, lessonId: 1 }, { unique: true });
lessonProgressSchema.index({ studentProfileId: 1 });

lessonProgressSchema.pre(/^find/, function () {
  this.populate({
    path: "lessonId",
    select: "title moduleTitle courseId order xpReward",
  });
});

const LessonProgress = mongoose.model("LessonProgress", lessonProgressSchema);

export default LessonProgress;
