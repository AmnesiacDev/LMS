import express from "express";
import { protectionController } from "../Controllers/AuthController.js";
import { getChannelMessagesController, getMyChannelsController, sendChannelMessageController } from "../Controllers/ChannelController.js";

const router = express.Router();

router.use(protectionController);
router.get("/", getMyChannelsController);
router.get("/:channelId/messages", getChannelMessagesController);
router.post("/:channelId/messages", sendChannelMessageController);

export default router;
