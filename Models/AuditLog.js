import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    actor: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      required: true,
    },
    actorRole: {
      type: String,
      required: true,
    },
    action: {
      type: String,
      required: true,
      // e.g. "grade_submission", "impersonate_user", "delete_session", "reset_password"
    },
    targetModel: {
      type: String,
      // e.g. "Submission", "User", "Session"
    },
    targetId: {
      type: mongoose.Schema.ObjectId,
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      // any extra context: { before, after, reason }
    },
    ip: {
      type: String,
    },
  },
  { timestamps: true }
);

auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ targetModel: 1, targetId: 1 });
auditLogSchema.index({ action: 1 });

const AuditLog = mongoose.model("AuditLog", auditLogSchema);

export default AuditLog;
