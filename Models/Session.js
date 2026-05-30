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
    // AI-generated, parent-friendly summary (see Services/aiSummaryService.js).
    // Kept separate from the manual `summary` above so both can coexist.
    aiSummary: {
      text: { type: String },
      model: { type: String },
      generatedAt: { type: Date },
    },
    status: {
      type: String,
      enum: ["pending", "completed", "canceled", "student canceled"],
      default: "pending",
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

sessionSchema.index({ studentProfileId: 1, date: 1 });
sessionSchema.index({ instructorId: 1 });
sessionSchema.index({ date: 1 });
// Prevent duplicate session titles only within the same student, not globally
sessionSchema.index({ studentProfileId: 1, title: 1 }, { unique: true });

// Exclude soft-deleted sessions from all queries by default
sessionSchema.pre(/^find/, function () {
  if (!this.getOptions().withDeleted) {
    this.find({ deletedAt: null });
  }
});

sessionSchema.pre("save", function () {
  if (this.isNew) {
    const now = new Date();
    if (this.date < now) {
      throw new AppErrorHelper("Session Date Must be in the future", 400);
    }
  }
});

sessionSchema.post("save", async function () {
  try {
    const ScheduleEntry = (await import('./ScheduleEntry.js')).default;
    if (this.isNew) {
      await ScheduleEntry.create({
        entryType: "session",
        sessionId: this._id,
        studentProfileId: this.studentProfileId,
        instructorId: this.instructorId,
        title: this.title,
        startAt: this.date,
        endAt: new Date(this.date.getTime() + 60 * 60 * 1000),
        reminders: [
          { minutesBefore: 60, sentAt: null },
          { minutesBefore: 1440, sentAt: null },
        ],
      });
    } else if (this.isModified('date')) {
      await ScheduleEntry.findOneAndUpdate(
        { sessionId: this._id, deletedAt: null },
        { startAt: this.date, endAt: new Date(this.date.getTime() + 60 * 60 * 1000) }
      );
    } else if (this.isModified('status')) {
      await ScheduleEntry.findOneAndUpdate(
        { sessionId: this._id, deletedAt: null },
        { status: this.status }
      );
    } else if (this.isModified('deletedAt') && this.deletedAt) {
      await ScheduleEntry.findOneAndUpdate(
        { sessionId: this._id },
        { deletedAt: new Date() },
        { setOptions: { withDeleted: true } }
      );
    }
  } catch (err) {
    console.error('[Session hook] ScheduleEntry sync failed:', err.message);
  }
});

const Session = mongoose.model("Session", sessionSchema);

export default Session;
