import mongoose from "mongoose";
import AppErrorHelper from "../Utilities/AppErrorHelper.js";

const sessionSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      minlength: [4, "Session title have to more than 4 letters"],
    },

    description: {
      type: String,
      required: true,
      minlength: [3, "Session title have to more than 3 letters"],
    },
    recapVideoLinks: [
      {
        title: { type: String },
        link: { type: String },
      },
    ],
    attachmentsLinks: [
      {
        title: { type: String },
        attachmentLink: {
          type: String,
        },
      },
    ],
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
    date: {
      type: Date,
      required: true,
    },
    StudentAttended: {
      type: Boolean,
      default: true,
    },
    notes: {
      type: String,
    },
    summary: {
      type: String,
    },
    status: {
      type: String,
      enum: ["pending", "completed", "canceled", "student canceled"],
      default: "pending",
    },
  },
  { timestamps: true },
);

sessionSchema.index({ studentProfileId: 1, date: 1 });
sessionSchema.index({ instructorId: 1 });
sessionSchema.index({ date: 1 });
// Prevent duplicate session titles only within the same student, not globally
sessionSchema.index({ studentProfileId: 1, title: 1 }, { unique: true });

sessionSchema.pre("save", function () {
  const now = new Date();
  if (this.date < now) {
    throw new AppErrorHelper("Session Date Must be in the future", 400);
  }
});

const Session = mongoose.model("Session", sessionSchema);

export default Session;
