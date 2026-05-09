import mongoose from "mongoose";

const TaskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    taskLinks: [
      {
        title: { type: String },
        link: { type: String },
      },
    ],
    dueDate: {
      type: Date,
      required: true,
    },
    sessionId: {
      type: mongoose.Schema.ObjectId,
      ref: "Session",
      required: true,
    },
    studentProfileId: {
      type: mongoose.Schema.ObjectId,
      ref: "StudentProfile",
      required: true,
    },
    instructorId: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "completed", "canceled"],
      default: "pending",
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

TaskSchema.index({ studentProfileId: 1, status: 1 });
TaskSchema.index({ instructorId: 1 });
TaskSchema.index({ sessionId: 1 });
TaskSchema.index({ dueDate: 1 });

TaskSchema.pre(/^find/, function () {
  if (!this.getOptions().withDeleted) {
    this.find({ deletedAt: null });
  }
});

TaskSchema.pre(/^find/, async function () {
  this.populate([
    { path: "sessionId", select: "title description date summary" },
    { path: "studentProfileId", select: "user grade" },
    { path: "instructorId", select: "FullName UserName" },
  ]);
});

const Task = mongoose.model("Task", TaskSchema);

export default Task;
