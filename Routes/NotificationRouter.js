import express from "express";
import { protectionController } from "../Controllers/AuthController.js";
import {
  getUserNotificationsController,
  getUnreadCountController,
  markAsReadController,
  markAllAsReadController,
} from "../Controllers/NotificationController.js";

const router = express.Router();

// All notification routes require authentication
router.use(protectionController);

// Get unread count (must be before /:id)
router.get("/unread-count", getUnreadCountController);

// Mark all as read (must be before /:id)
router.patch("/read-all", markAllAsReadController);

// Get all notifications (paginated)
router.get("/", getUserNotificationsController);

// Mark specific notification as read
router.patch("/:id/read", markAsReadController);

export default router;
