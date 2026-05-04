import {
  getUserNotificationsService,
  getUnreadCountService,
  markAsReadService,
  markAllAsReadService,
} from "../Services/NotificationService.js";

const getUserNotificationsController = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const notifications = await getUserNotificationsService(userId, req.query);

    res.status(200).json({
      status: "success",
      results: notifications.length,
      data: notifications,
    });
  } catch (error) {
    next(error);
  }
};

const getUnreadCountController = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const unreadCount = await getUnreadCountService(userId);

    res.status(200).json({
      status: "success",
      data: {
        unreadCount,
      },
    });
  } catch (error) {
    next(error);
  }
};

const markAsReadController = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    const notification = await markAsReadService(userId, id);

    res.status(200).json({
      status: "success",
      data: notification,
    });
  } catch (error) {
    next(error);
  }
};

const markAllAsReadController = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const modifiedCount = await markAllAsReadService(userId);

    res.status(200).json({
      status: "success",
      message: `${modifiedCount} notifications marked as read`,
    });
  } catch (error) {
    next(error);
  }
};

export {
  getUserNotificationsController,
  getUnreadCountController,
  markAsReadController,
  markAllAsReadController,
};
