import mongoose from "mongoose";

const studentProfileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    parents: [
      {
        type: mongoose.Schema.ObjectId,
        ref: "User",
      },
    ],
    instructors: [
      {
        type: mongoose.Schema.ObjectId,
        ref: "User",
      },
    ],
    pendingParentRequests: [
      {
        type: mongoose.Schema.ObjectId,
        ref: "User",
      },
    ],
    grade: {
      type: String,
    },
    notes: {
      type: String,
    },
    attendanceStreak: {
      type: Number,
      default: 0,
      min: 0,
    },
    longestStreak: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true },
);

// studentProfileSchema.index({ user: 1 }, { unique: true });
studentProfileSchema.index({ parents: 1 });
studentProfileSchema.index({ instructors: 1 });
studentProfileSchema.index({ pendingParentRequests: 1 });

studentProfileSchema.pre(/^find/, async function () {
  this.populate({ path: "parents", select: "FullName UserName Email" });
  this.populate({ path: "instructors", select: "FullName UserName Email" });
  this.populate({ path: "pendingParentRequests", select: "FullName UserName Email" });
  this.populate({ path: "user", select: "FullName UserName Email" });
});

const StudentProfile = new mongoose.model("StudentProfile", studentProfileSchema);

export default StudentProfile;
