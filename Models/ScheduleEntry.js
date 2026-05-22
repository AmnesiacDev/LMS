import mongoose from "mongoose";
import AppErrorHelper from "../Utilities/AppErrorHelper.js";

const reminderSchema = new mongoose.Schema(
  {
    minutesBefore: {
      type: Number,
      required: true,
    },
    sentAt: {
      type: Date,
      default: null,
    },
    notificationId: {
      type: mongoose.Schema.ObjectId,
      ref: "Notification",
    },
  },
  { _id: false },
);

const scheduleEntrySchema = new mongoose.Schema(
  {
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
    entryType: {
      type: String,
      enum: ["session", "task_due", "custom"],
      required: true,
    },
    sessionId: {
      type: mongoose.Schema.ObjectId,
      ref: "Session",
    },
    taskId: {
      type: mongoose.Schema.ObjectId,
      ref: "Task",
    },
    title: {
      type: String,
      required: true,
    },
    subject: {
      type: String,
    },
    color: {
      type: String,
    },
    notes: {
      type: String,
    },
    startAt: {
      type: Date,
      required: true,
    },
    endAt: {
      type: Date,
      required: true,
    },
    timezone: {
      type: String,
      default: "UTC",
    },
    allDay: {
      type: Boolean,
      default: false,
    },
    seriesId: {
      type: mongoose.Schema.ObjectId,
      ref: "ScheduleSeries",
    },
    isException: {
      type: Boolean,
      default: false,
    },
    reminders: [reminderSchema],
    status: {
      type: String,
      enum: ["scheduled", "completed", "canceled", "rescheduled"],
      default: "scheduled",
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

scheduleEntrySchema.index({ studentProfileId: 1, startAt: 1 });
scheduleEntrySchema.index({ instructorId: 1, startAt: 1 });
scheduleEntrySchema.index({ taskId: 1 });
scheduleEntrySchema.index({ sessionId: 1 });
scheduleEntrySchema.index({ seriesId: 1, startAt: 1 });

// Validate that endAt is after startAt
scheduleEntrySchema.pre("validate", function () {
  if (this.endAt <= this.startAt) {
    throw new AppErrorHelper("endAt must be after startAt", 400);
  }
});

// Exclude soft-deleted entries from all queries by default
scheduleEntrySchema.pre(/^find/, function () {
  if (!this.getOptions().withDeleted) {
    this.find({ deletedAt: null });
  }
});

const ScheduleEntry = mongoose.model("ScheduleEntry", scheduleEntrySchema);

export default ScheduleEntry;
