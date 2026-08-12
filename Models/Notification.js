import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      required: true,
    },
    sender: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
    },
    type: {
      type: String,
      enum: [
        "new_message",
        "new_task",
        "task_graded",
        "new_session",
        "session_review",
        "exam_result",
        "system_alert",
        "schedule_reminder",
        "schedule_updated",
        "new_schedule_entry",
        "xp_earned",
        "badge_unlocked",
        "level_up",
        "challenge_graded",
        "new_submission",
        "lesson_completed",
        "announcement",
        "new_user",
        "canvas_shared",
      ],
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    link: {
      type: String, // Optional URL to redirect to when the notification is clicked
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Indexes to fetch user's notifications quickly, sorted by newest
notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, isRead: 1 });

const Notification = mongoose.model("Notification", notificationSchema);

export default Notification;
