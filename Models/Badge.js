import mongoose from "mongoose";

// ─── Badge Definition ─────────────────────────────────────────────────────────
// System-wide badge templates. Seeded via scripts/seedBadges.js.

const badgeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    icon: {
      type: String,
      required: true,
      default: "🏆",
    },
    category: {
      type: String,
      required: true,
      enum: ["submission", "attendance", "challenge", "streak", "exam", "general"],
    },
    condition: {
      stat: {
        type: String,
        required: true,
        // Matches keys in Gamification.stats or top-level fields like "level"
      },
      threshold: {
        type: Number,
        required: true,
        min: 1,
      },
    },
    xpReward: {
      type: Number,
      default: 0,
      min: 0,
    },
    rarity: {
      type: String,
      enum: ["common", "rare", "epic", "legendary"],
      default: "common",
    },
  },
  { timestamps: true },
);

badgeSchema.index({ category: 1 });

const Badge = mongoose.model("Badge", badgeSchema);

// ─── Student Badge (earned badges) ────────────────────────────────────────────

const studentBadgeSchema = new mongoose.Schema(
  {
    studentProfileId: {
      type: mongoose.Schema.ObjectId,
      ref: "StudentProfile",
      required: true,
    },
    badge: {
      type: mongoose.Schema.ObjectId,
      ref: "Badge",
      required: true,
    },
    unlockedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

// A student can only earn each badge once
studentBadgeSchema.index({ studentProfileId: 1, badge: 1 }, { unique: true });
studentBadgeSchema.index({ studentProfileId: 1 });

studentBadgeSchema.pre(/^find/, function () {
  this.populate({ path: "badge", select: "name description icon category rarity xpReward" });
});

const StudentBadge = mongoose.model("StudentBadge", studentBadgeSchema);

export { Badge, StudentBadge };
export default Badge;
