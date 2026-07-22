import mongoose from "mongoose";

const channelMessageSchema = new mongoose.Schema(
  {
    channelId: {
      type: mongoose.Schema.ObjectId,
      ref: "Channel",
      required: true,
    },
    senderId: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      required: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 4000,
    },
  },
  { timestamps: true },
);

channelMessageSchema.index({ channelId: 1, createdAt: 1 });

const ChannelMessage = mongoose.model("ChannelMessage", channelMessageSchema);

export default ChannelMessage;
