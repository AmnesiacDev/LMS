import mongoose from "mongoose";
import Channel from "../Models/Channel.js";
import ChannelMessage from "../Models/ChannelMessage.js";
import StudentInstructorAssignment from "../Models/StudentInstructorAssignment.js";
import StudentProfile from "../Models/studentProfile.js";
import AppErrorHelper from "../Utilities/AppErrorHelper.js";
import { createNotificationService } from "./NotificationService.js";

const referenceId = (reference) => reference?._id || reference;

const buildMembers = (profile, instructorId, existingMembers = []) => {
  const existingJoinDates = new Map(existingMembers.map((member) => [referenceId(member.userId)?.toString(), member.joinedAt]));
  const membersByUser = new Map();

  const addMember = (userReference, role) => {
    const userId = referenceId(userReference);
    if (!userId) return;
    const key = userId.toString();
    membersByUser.set(key, {
      userId,
      role,
      joinedAt: existingJoinDates.get(key) || new Date(),
    });
  };

  addMember(profile.user, "student");
  addMember(instructorId, "instructor");
  for (const parent of profile.parents || []) addMember(parent, "parent");

  return Array.from(membersByUser.values());
};

const channelNameForProfile = (profile) => {
  const studentName = profile.user?.FullName || profile.user?.UserName || "Student";
  return `${studentName} Learning Team`;
};

const populateChannel = (query) =>
  query
    .populate({
      path: "studentProfileId",
      select: "user grade",
      populate: { path: "user", select: "FullName UserName Email avatar role" },
    })
    .populate({
      path: "assignmentId",
      select: "instructorId assignedAt status",
      populate: { path: "instructorId", select: "FullName UserName Email avatar role" },
    })
    .populate("members.userId", "FullName UserName Email avatar role");

const createLearningTeamChannelForAssignment = async (assignment, profileInput = null) => {
  const assignmentId = referenceId(assignment);
  const studentProfileId = referenceId(assignment.studentProfileId);
  const instructorId = referenceId(assignment.instructorId);
  const profile = profileInput || (await StudentProfile.findById(studentProfileId));

  if (!profile) throw new AppErrorHelper("Student profile not found", 404);

  const existing = await Channel.findOne({ assignmentId, status: "active" });
  if (existing) return existing;

  try {
    return await Channel.create({
      name: channelNameForProfile(profile),
      type: "learning_team",
      studentProfileId: profile._id,
      assignmentId,
      members: buildMembers(profile, instructorId),
    });
  } catch (error) {
    if (error?.code === 11000) {
      return Channel.findOne({ assignmentId, status: "active" });
    }
    throw error;
  }
};

const syncLearningTeamChannelsForProfile = async (studentProfileId) => {
  const profile = await StudentProfile.findById(studentProfileId);
  if (!profile) throw new AppErrorHelper("Student profile not found", 404);

  const assignments = await StudentInstructorAssignment.find({
    studentProfileId: profile._id,
    status: "active",
  });

  const channels = [];
  for (const assignment of assignments) {
    let channel = await Channel.findOne({ assignmentId: assignment._id, status: "active" });
    if (!channel) {
      channel = await createLearningTeamChannelForAssignment(assignment, profile);
    } else {
      channel.name = channelNameForProfile(profile);
      channel.members = buildMembers(profile, assignment.instructorId, channel.members);
      await channel.save();
    }
    channels.push(channel);
  }

  return channels;
};

const archiveLearningTeamChannelForAssignment = async (assignmentId, archivedBy) =>
  Channel.findOneAndUpdate(
    { assignmentId, status: "active" },
    {
      status: "archived",
      archivedAt: new Date(),
      archivedBy,
    },
    { returnDocument: "after" },
  );

const getUserChannelsService = async (userId, { includeArchived = false } = {}) => {
  const filter = { "members.userId": userId };
  if (!includeArchived) filter.status = "active";

  return populateChannel(Channel.find(filter).sort({ updatedAt: -1 }));
};

const getChannelForMember = async (channelId, userId, { requireActive = false } = {}) => {
  if (!mongoose.isValidObjectId(channelId)) {
    throw new AppErrorHelper("Channel not found", 404);
  }

  const filter = { _id: channelId, "members.userId": userId };
  if (requireActive) filter.status = "active";
  const channel = await populateChannel(Channel.findOne(filter));

  if (!channel) throw new AppErrorHelper("Channel not found", 404);
  return channel;
};

const getChannelMessagesService = async (channelId, userId, query = {}) => {
  await getChannelForMember(channelId, userId);
  const requestedLimit = Number.parseInt(query.limit, 10);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 100;

  return ChannelMessage.find({ channelId }).sort({ createdAt: 1 }).limit(limit).populate("senderId", "FullName UserName avatar role");
};

const sendChannelMessageService = async (channelId, sender, content) => {
  if (typeof content !== "string" || !content.trim()) {
    throw new AppErrorHelper("Message content cannot be empty", 400);
  }
  if (content.trim().length > 4000) {
    throw new AppErrorHelper("Message content cannot exceed 4000 characters", 400);
  }

  const channel = await getChannelForMember(channelId, sender._id, { requireActive: true });
  const message = await ChannelMessage.create({
    channelId: channel._id,
    senderId: sender._id,
    content: content.trim(),
  });

  const recipients = channel.members.map((member) => referenceId(member.userId)).filter((userId) => userId && userId.toString() !== sender._id.toString());

  await Promise.allSettled(
    recipients.map((recipient) =>
      createNotificationService({
        recipient,
        sender: sender._id,
        type: "new_message",
        title: `New message in ${channel.name}`,
        message: content.trim().slice(0, 80),
        link: `/dashboard/channels?channel=${channel._id}`,
      }),
    ),
  );

  return message.populate("senderId", "FullName UserName avatar role");
};

export { archiveLearningTeamChannelForAssignment, createLearningTeamChannelForAssignment, getChannelForMember, getChannelMessagesService, getUserChannelsService, sendChannelMessageService, syncLearningTeamChannelsForProfile };
