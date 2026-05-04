import express from "express";
import { protectionController } from "../Controllers/AuthController.js";
import {
  sendMessageController,
  getConversationController,
  markMessagesAsReadController,
  getConversationsListController,
} from "../Controllers/MessageController.js";

const router = express.Router();

// All message routes require authentication
router.use(protectionController);

// Get list of active conversations for the current user
router.get("/conversations", getConversationsListController);

// Get a specific conversation with another user
router.get("/:otherUserId", getConversationController);

// Send a new message
router.post("/", sendMessageController);

// Mark messages from a specific user as read
router.patch("/:senderId/read", markMessagesAsReadController);

export default router;
