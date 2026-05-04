import {
  sendMessageService,
  getConversationService,
  markMessagesAsReadService,
  getConversationsListService,
} from "../Services/MessageService.js";

const sendMessageController = async (req, res, next) => {
  try {
    const { receiverId, content } = req.body;
    const senderId = req.user._id;

    const message = await sendMessageService(senderId, receiverId, content);

    res.status(201).json({
      status: "success",
      data: message,
    });
  } catch (error) {
    next(error);
  }
};

const getConversationController = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { otherUserId } = req.params;

    const messages = await getConversationService(userId, otherUserId);

    res.status(200).json({
      status: "success",
      results: messages.length,
      data: messages,
    });
  } catch (error) {
    next(error);
  }
};

const markMessagesAsReadController = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { senderId } = req.params;

    await markMessagesAsReadService(userId, senderId);

    res.status(200).json({
      status: "success",
      message: "Messages marked as read",
    });
  } catch (error) {
    next(error);
  }
};

const getConversationsListController = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const conversations = await getConversationsListService(userId);

    res.status(200).json({
      status: "success",
      results: conversations.length,
      data: conversations,
    });
  } catch (error) {
    next(error);
  }
};

export {
  sendMessageController,
  getConversationController,
  markMessagesAsReadController,
  getConversationsListController,
};
