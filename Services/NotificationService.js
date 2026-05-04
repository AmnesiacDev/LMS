import Notification from "../Models/Notification.js";
import AppErrorHelper from "../Utilities/AppErrorHelper.js";
import ApiFeatures from "../Utilities/ApiFeatures.js";

// 1. Internal helper to create a notification (called from other services)
const createNotificationService = async (data) => {
  const { recipient, sender, type, title, message, link } = data;

  if (!recipient || !type || !title || !message) {
    throw new AppErrorHelper("Missing required notification fields", 400);
  }

  const notification = await Notification.create({
    recipient,
    sender,
    type,
    title,
    message,
    link,
  });

  return notification;
};

// 2. Get all notifications for a user (paginated)
const getUserNotificationsService = async (userId, queryString = {}) => {
  const features = new ApiFeatures(
    Notification.find({ recipient: userId }).populate("sender", "FullName avatar role"),
    queryString
  )
    .filter()
    .sort() // by default ApiFeatures should sort, but let's ensure it's newest first
    .pagination();

  // If no sort is provided in query, default to descending
  if (!queryString.sort) {
    features.mongooseQuery = features.mongooseQuery.sort("-createdAt");
  }

  return await features.mongooseQuery;
};

// 3. Get unread count
const getUnreadCountService = async (userId) => {
  const count = await Notification.countDocuments({
    recipient: userId,
    isRead: false,
  });
  return count;
};

// 4. Mark a specific notification as read
const markAsReadService = async (userId, notificationId) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, recipient: userId },
    { isRead: true },
    { new: true }
  );

  if (!notification) {
    throw new AppErrorHelper("Notification not found!", 404);
  }

  return notification;
};

// 5. Mark all user's notifications as read
const markAllAsReadService = async (userId) => {
  const result = await Notification.updateMany(
    { recipient: userId, isRead: false },
    { isRead: true }
  );

  return result.modifiedCount;
};

export {
  createNotificationService,
  getUserNotificationsService,
  getUnreadCountService,
  markAsReadService,
  markAllAsReadService,
};
