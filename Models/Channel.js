import mongoose from "mongoose";

const channelMemberSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      required: true,
    },
    role: {
      type: String,
      enum: ["student", "parent", "instructor"],
      required: true,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
);

const channelSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ["learning_team"],
      default: "learning_team",
      required: true,
    },
    studentProfileId: {
      type: mongoose.Schema.ObjectId,
      ref: "StudentProfile",
      required: true,
    },
    assignmentId: {
      type: mongoose.Schema.ObjectId,
      ref: "StudentInstructorAssignment",
      required: true,
    },
    members: {
      type: [channelMemberSchema],
      default: [],
    },
    status: {
      type: String,
      enum: ["active", "archived"],
      default: "active",
      required: true,
    },
    archivedAt: {
      type: Date,
    },
    archivedBy: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true },
);

channelSchema.index(
  { assignmentId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "active" },
  },
);
channelSchema.index({ "members.userId": 1, status: 1, updatedAt: -1 });
channelSchema.index({ studentProfileId: 1, status: 1 });

const Channel = mongoose.model("Channel", channelSchema);

export default Channel;
