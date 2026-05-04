import Message from "../Models/Message.js";
import User from "../Models/user.js";
import AppErrorHelper from "../Utilities/AppErrorHelper.js";
import { createNotificationService } from "./NotificationService.js";
import mongoose from "mongoose";

// 1. Send a new message
const sendMessageService = async (senderId, receiverId, content) => {
  if (!content || !content.trim()) {
    throw new AppErrorHelper("Message content cannot be empty!", 400);
  }

  if (senderId.toString() === receiverId.toString()) {
    throw new AppErrorHelper("You cannot send a message to yourself!", 400);
  }

  const receiver = await User.findById(receiverId);
  if (!receiver || !receiver.isActive) {
    throw new AppErrorHelper("Receiver not found or inactive!", 404);
  }

  const message = await Message.create({
    sender: senderId,
    receiver: receiverId,
    content: content.trim(),
  });

  const senderUser = await User.findById(senderId);

  // Automatically create a notification for the receiver
  await createNotificationService({
    recipient: receiverId,
    sender: senderId,
    type: "new_message",
    title: `New Message from ${senderUser.FullName}`,
    message: content.trim().substring(0, 50) + (content.length > 50 ? "..." : ""),
    link: `/dashboard/messages/${senderId}`, // Adjust URL to match your frontend routing
  });

  return await message.populate("sender receiver", "FullName UserName avatar role");
};

// 2. Get conversation between two users
const getConversationService = async (userId, otherUserId) => {
  const otherUser = await User.findById(otherUserId);
  if (!otherUser) {
    throw new AppErrorHelper("User not found!", 404);
  }

  const messages = await Message.find({
    $or: [
      { sender: userId, receiver: otherUserId },
      { sender: otherUserId, receiver: userId },
    ],
  })
    .sort({ createdAt: 1 })
    .populate("sender receiver", "FullName UserName avatar role");

  return messages;
};

// 3. Mark messages as read
const markMessagesAsReadService = async (userId, senderId) => {
  const result = await Message.updateMany(
    { sender: senderId, receiver: userId, isRead: false },
    { isRead: true }
  );
  return result;
};

// 4. Get a list of recent conversations for the current user
const getConversationsListService = async (userId) => {
  // We use aggregation to find the latest message for each distinct conversation
  const conversations = await Message.aggregate([
    {
      $match: {
        $or: [
          { sender: new mongoose.Types.ObjectId(userId) },
          { receiver: new mongoose.Types.ObjectId(userId) },
        ],
      },
    },
    {
      $sort: { createdAt: -1 }, // Sort by newest first
    },
    {
      $group: {
        _id: {
          $cond: [
            { $eq: ["$sender", new mongoose.Types.ObjectId(userId)] },
            "$receiver",
            "$sender",
          ],
        },
        latestMessage: { $first: "$$ROOT" },
        unreadCount: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$receiver", new mongoose.Types.ObjectId(userId)] },
                  { $eq: ["$isRead", false] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "otherUser",
      },
    },
    {
      $unwind: "$otherUser",
    },
    {
      $project: {
        _id: 0,
        otherUserId: "$_id",
        fullName: "$otherUser.FullName",
        userName: "$otherUser.UserName",
        role: "$otherUser.role",
        avatar: "$otherUser.avatar",
        latestMessage: "$latestMessage.content",
        latestMessageAt: "$latestMessage.createdAt",
        latestMessageSender: "$latestMessage.sender",
        isRead: "$latestMessage.isRead",
        unreadCount: 1,
      },
    },
    {
      $sort: { latestMessageAt: -1 }, // Sort conversations by most recent activity
    },
  ]);

  return conversations;
};

export {
  sendMessageService,
  getConversationService,
  markMessagesAsReadService,
  getConversationsListService,
};
