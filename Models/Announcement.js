import mongoose from "mongoose";

const announcementSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: [200, "Title must be under 200 characters"],
    },
    body: {
      type: String,
      required: true,
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      required: true,
    },
    // null = broadcast to everyone; array of profileIds = targeted
    targetStudentProfiles: [
      {
        type: mongoose.Schema.ObjectId,
        ref: "StudentProfile",
      },
    ],
    isPinned: {
      type: Boolean,
      default: false,
    },
    expiresAt: {
      type: Date,
      // optional: auto-hide after this date
    },
  },
  { timestamps: true }
);

announcementSchema.index({ createdBy: 1, createdAt: -1 });
announcementSchema.index({ isPinned: -1, createdAt: -1 });

const Announcement = mongoose.model("Announcement", announcementSchema);

export default Announcement;
