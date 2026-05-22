import mongoose from "mongoose";

const scheduleSeriesSchema = new mongoose.Schema(
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
    templateTitle: {
      type: String,
      required: true,
    },
    subject: {
      type: String,
    },
    frequency: {
      type: String,
      enum: ["weekly", "biweekly"],
      required: true,
    },
    daysOfWeek: {
      type: [Number],
    },
    startTime: {
      type: String,
      required: true,
    },
    durationMin: {
      type: Number,
      required: true,
    },
    startsOn: {
      type: Date,
      required: true,
    },
    endsOn: {
      type: Date,
    },
    exceptions: {
      type: [Date],
    },
    materializedUntil: {
      type: Date,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

// Exclude soft-deleted series from all queries by default
scheduleSeriesSchema.pre(/^find/, function () {
  if (!this.getOptions().withDeleted) {
    this.find({ deletedAt: null });
  }
});

const ScheduleSeries = mongoose.model("ScheduleSeries", scheduleSeriesSchema);

export default ScheduleSeries;
