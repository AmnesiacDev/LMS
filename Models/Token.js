import mongoose from "mongoose";

const RefreshTokenSchema = new mongoose.Schema(
  {
    tokenId: {
      type: String,
      required: true,
    },
    userId: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    tokenHash: {
      type: String,
      required: true,
    },
    // Set when this token has been exchanged for a new one. The row is kept for
    // a short grace window rather than deleted outright, so that two browser
    // tabs refreshing at the same moment do not look like token theft. See
    // refreshTokenService.
    rotatedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

// Every refresh looks a token up by tokenId. Without this index that is a full
// collection scan on the hottest authenticated path in the app.
RefreshTokenSchema.index({ tokenId: 1 }, { unique: true });
RefreshTokenSchema.index({ userId: 1 });
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const RefreshToken = mongoose.model("RefreshToken", RefreshTokenSchema);
export default RefreshToken;
