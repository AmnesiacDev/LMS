import CatchAsync from "../Utilities/CatchAsync.js";
import { getChannelMessagesService, getUserChannelsService, sendChannelMessageService } from "../Services/ChannelService.js";

const getMyChannelsController = CatchAsync(async (req, res) => {
  const channels = await getUserChannelsService(req.user._id, {
    includeArchived: req.query.includeArchived === "true",
  });

  res.status(200).json({
    status: "success",
    results: channels.length,
    data: { channels },
  });
});

const getChannelMessagesController = CatchAsync(async (req, res) => {
  const messages = await getChannelMessagesService(req.params.channelId, req.user._id, req.query);

  res.status(200).json({
    status: "success",
    results: messages.length,
    data: { messages },
  });
});

const sendChannelMessageController = CatchAsync(async (req, res) => {
  const message = await sendChannelMessageService(req.params.channelId, req.user, req.body.content);

  res.status(201).json({
    status: "success",
    data: { message },
  });
});

export { getChannelMessagesController, getMyChannelsController, sendChannelMessageController };
