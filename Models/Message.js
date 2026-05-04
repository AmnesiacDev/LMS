import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      required: true,
    },
    receiver: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      required: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

// Index for fast querying of conversations between two users
messageSchema.index({ sender: 1, receiver: 1, createdAt: -1 });
messageSchema.index({ receiver: 1, isRead: 1 });

const Message = mongoose.model("Message", messageSchema);

export default Message;
