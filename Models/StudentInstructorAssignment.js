import mongoose from "mongoose";

const studentInstructorAssignmentSchema = new mongoose.Schema(
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
    assignedBy: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
    },
    endedBy: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
    },
    source: {
      type: String,
      enum: ["admin", "migration"],
      default: "admin",
    },
    status: {
      type: String,
      enum: ["active", "ended"],
      default: "active",
      required: true,
    },
    assignedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    endedAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

studentInstructorAssignmentSchema.index(
  { studentProfileId: 1, instructorId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "active" },
  },
);
studentInstructorAssignmentSchema.index({ instructorId: 1, status: 1 });
studentInstructorAssignmentSchema.index({ studentProfileId: 1, status: 1 });

const StudentInstructorAssignment = mongoose.model("StudentInstructorAssignment", studentInstructorAssignmentSchema);

export default StudentInstructorAssignment;
