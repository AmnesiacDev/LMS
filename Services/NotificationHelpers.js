import User from "../Models/user.js";
import StudentProfile from "../Models/studentProfile.js";
import { createNotificationService } from "./NotificationService.js";

// Normalize an ObjectId / populated doc / string into a plain id string.
const idStr = (v) => v?._id?.toString?.() || v?.toString?.() || null;

/**
 * Resolve the notification recipients tied to a student profile:
 * the student's own user id, their display name, and their parents' user ids.
 * StudentProfile's pre-find hook auto-populates `user` and `parents`.
 */
export const getStudentRecipients = async (studentProfileId) => {
  const profile = await StudentProfile.findById(studentProfileId);
  if (!profile) return { studentUserId: null, studentName: "Your child", parentIds: [] };

  return {
    studentUserId: idStr(profile.user),
    studentName: profile.user?.FullName || "Your child",
    parentIds: (profile.parents || []).map(idStr).filter(Boolean),
  };
};

/** All active admin user ids. */
export const getAdminIds = async () => {
  const admins = await User.find({ role: "admin" }, { _id: 1 }).lean();
  return admins.map((a) => a._id.toString());
};

/**
 * Send the same notification to a de-duplicated list of users. Best-effort:
 * individual failures are logged, never thrown, so callers' flows never break.
 */
export const notifyUsers = async (userIds, { sender, type, title, message, link }) => {
  const unique = [...new Set((userIds || []).map(idStr).filter(Boolean))];
  if (!unique.length) return;

  const results = await Promise.allSettled(
    unique.map((recipient) =>
      createNotificationService({ recipient, sender, type, title, message, link }),
    ),
  );
  results.forEach((r) => {
    if (r.status === "rejected") {
      console.error("[Notify] notifyUsers failed:", r.reason?.message);
    }
  });
};

/**
 * Fan one event out to a student AND their parents with role-specific copy.
 * `parentTitle` / `parentMessage` may be a string, or a function receiving the
 * student's name so parent copy can read "Reem completed a lesson".
 * Best-effort: never throws.
 */
export const notifyStudentAndParents = async (
  studentProfileId,
  { sender, type, link, studentTitle, studentMessage, parentTitle, parentMessage },
) => {
  try {
    const { studentUserId, studentName, parentIds } = await getStudentRecipients(studentProfileId);

    const tasks = [];

    if (studentUserId) {
      tasks.push(
        createNotificationService({
          recipient: studentUserId,
          sender,
          type,
          title: studentTitle,
          message: studentMessage,
          link,
        }),
      );
    }

    const pTitle = typeof parentTitle === "function" ? parentTitle(studentName) : parentTitle;
    const pMessage = typeof parentMessage === "function" ? parentMessage(studentName) : parentMessage;

    for (const parentId of parentIds) {
      tasks.push(
        createNotificationService({
          recipient: parentId,
          sender,
          type,
          title: pTitle,
          message: pMessage,
          link,
        }),
      );
    }

    const results = await Promise.allSettled(tasks);
    results.forEach((r) => {
      if (r.status === "rejected") {
        console.error("[Notify] notifyStudentAndParents failed:", r.reason?.message);
      }
    });
  } catch (err) {
    console.error("[Notify] notifyStudentAndParents error:", err.message);
  }
};

/** Notify every admin (best-effort). */
export const notifyAdmins = async ({ sender, type, title, message, link }) => {
  const ids = await getAdminIds();
  await notifyUsers(ids, { sender, type, title, message, link });
};
