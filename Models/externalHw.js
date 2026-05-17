import mongoose from "mongoose";
const externalHWSchema = new mongoose.Schema(
  {
    title: {
      type: String,
    },
    description: {
      type: String,
    },
    dueDate: {
      type: Date,
    },
    submissionDate: {
      type: Date,
    },
    isSubmitted: {
      type: Boolean,
      default: false,
    },
    notes: {
      type: String,
    },

    externalCourse: {
      type: mongoose.Schema.ObjectId,
      ref: "ExternalCourse",
    },
    submissionLinks: [
      {
        name: { type: String },
        url: { type: String },
      },
    ],
    status: {
      type: String,
      enum: ["Completed", "Pending", "Canceled", "Late submission"],
      default: "Pending",
    },
    category: {
      type: String,
      enum: ["Essay", "Project", "Quiz", "Lab", "Presentation", "Other"],
      default: "project",
    },
  },
  { timestamps: true },
);

externalHWSchema.index({ externalCourse: 1 });
externalHWSchema.index({ status: 1 });
externalHWSchema.index({ dueDate: 1 });

externalHWSchema.pre("save", function () {
  if (this.status === "Completed") {
    this.isSubmitted = true;
    this.submissionDate = new Date();
    this.notes = `Submitted before due date`;

    if (this.submissionDate > this.dueDate) {
      this.status = "Late submission";
      this.notes = "Submitted late";
    }
  } else if (this.status == "Pending") {
    this.isSubmitted = false;
    this.submissionDate = undefined;
    this.notes = "Waiting for submission";
  }
});

externalHWSchema.pre(/^find/, function () {
  this.populate({
    path: "externalCourse",
    select: "studentProfileId subject teacher",
    populate: {
      path: "studentProfileId",
      select: "user grade",
      populate: {
        path: "user",
        select: "FullName UserName",
      },
    },
  });
});

externalHWSchema.methods.markComplete = async function () {
  this.status = "Completed";
  this.submissionDate = new Date();
  this.isSubmitted = true;
};

const ExternalHW = new mongoose.model("ExternalHW", externalHWSchema);

export default ExternalHW;
