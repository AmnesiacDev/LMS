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

TaskSchema.post("save", async function () {
  try {
    const ScheduleEntry = (await import("./ScheduleEntry.js")).default;

    if (this.isNew) {
      await ScheduleEntry.create({
        entryType: "task_due",
        taskId: this._id,
        studentProfileId: this.studentProfileId,
        instructorId: this.instructorId,
        title: this.title,
        startAt: new Date(this.dueDate.getTime() - 30 * 60 * 1000),
        endAt: this.dueDate,
        reminders: [{ minutesBefore: 1440, sentAt: null }],
      });
    } else if (!this.isNew && this.isModified("dueDate")) {
      await ScheduleEntry.findOneAndUpdate(
        { taskId: this._id, deletedAt: null },
        {
          startAt: new Date(this.dueDate.getTime() - 30 * 60 * 1000),
          endAt: this.dueDate,
        },
      );
    } else if (!this.isNew && this.isModified("status")) {
      await ScheduleEntry.findOneAndUpdate(
        { taskId: this._id, deletedAt: null },
        { status: this.status },
      );
    } else if (!this.isNew && this.isModified("deletedAt") && this.deletedAt) {
      await ScheduleEntry.findOneAndUpdate(
        { taskId: this._id },
        { deletedAt: new Date() },
        { setOptions: { withDeleted: true } },
      );
    }
  } catch (err) {
    console.error("[Task hook] ScheduleEntry sync failed:", err.message);
  }
});

const Task = mongoose.model("Task", TaskSchema);

export default Task;
