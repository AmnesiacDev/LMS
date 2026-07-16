import Announcement from "../Models/Announcement.js";
import StudentProfile from "../Models/studentProfile.js";
import AppErrorHelper from "../Utilities/AppErrorHelper.js";
import ApiFeatures from "../Utilities/ApiFeatures.js";
import { notifyUsers } from "./NotificationHelpers.js";

export const createAnnouncementService = async (data, instructorId) => {
  const { title, body, targetStudentProfiles, isPinned, expiresAt } = data;
  const announcement = await Announcement.create({
    title,
    body,
    createdBy: instructorId,
    targetStudentProfiles: targetStudentProfiles || [],
    isPinned: isPinned ?? false,
    expiresAt: expiresAt || null,
  });

  // Notify the audience: targeted students (+ their parents), or everyone when
  // it's a broadcast (no targets). Best-effort, fire-and-forget.
  (async () => {
    const hasTargets = Array.isArray(targetStudentProfiles) && targetStudentProfiles.length > 0;
    const profiles = hasTargets
      ? await StudentProfile.find({ _id: { $in: targetStudentProfiles } })
      : await StudentProfile.find({});

    const recipientIds = [];
    for (const profile of profiles) {
      if (profile.user) recipientIds.push(profile.user);
      for (const parent of profile.parents || []) recipientIds.push(parent);
    }

    const preview = (body || "").trim().slice(0, 140);
    await notifyUsers(recipientIds, {
      sender: instructorId,
      type: "announcement",
      title: `📢 ${title}`,
      message: preview || "A new announcement was posted.",
      link: "/announcements",
    });
  })().catch((err) => console.error("[AnnouncementService] Notify failed:", err.message));

  return announcement;
};

export const getAnnouncementsService = async (user, queryString = {}) => {
  let filter = { $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] };

  if (user.role === "student" || user.role === "parent") {
    // Find student profile(s) for this user
    let profileIds = [];
    if (user.role === "student") {
      const profile = await StudentProfile.findOne({ user: user._id }, { _id: 1 });
      if (profile) profileIds = [profile._id];
    } else {
      const profiles = await StudentProfile.find({ parents: user._id }, { _id: 1 });
      profileIds = profiles.map((p) => p._id);
    }

    // Show broadcast (no targets) or targeted to this student
    filter = {
      ...filter,
      $or: [
        { targetStudentProfiles: { $size: 0 } },
        { targetStudentProfiles: { $in: profileIds } },
      ],
    };
  }

  const query = Announcement.find(filter)
    .populate("createdBy", "FullName")
    .sort({ isPinned: -1, createdAt: -1 });

  const features = new ApiFeatures(query, queryString).pagination();
  return await features.mongooseQuery;
};

export const getAnnouncementByIdService = async (id) => {
  const doc = await Announcement.findById(id).populate("createdBy", "FullName");
  if (!doc) throw new AppErrorHelper("Announcement not found", 404);
  return doc;
};

export const updateAnnouncementService = async (id, data) => {
  const doc = await Announcement.findByIdAndUpdate(id, data, { new: true, runValidators: true });
  if (!doc) throw new AppErrorHelper("Announcement not found", 404);
  return doc;
};

export const deleteAnnouncementService = async (id) => {
  const doc = await Announcement.findByIdAndDelete(id);
  if (!doc) throw new AppErrorHelper("Announcement not found", 404);
  return doc;
};
