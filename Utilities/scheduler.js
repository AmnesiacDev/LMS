import cron from "node-cron";
import Session from "../Models/Session.js";
import Task from "../Models/Task.js";
import StudentProfile from "../Models/studentProfile.js";
import User from "../Models/user.js";
import { autoCompleteStaleSessionsService } from "../Services/sessionService.js";
import {
  sendSessionReminderEmail,
  sendTaskReminderEmail,
  sendWeeklySummaryEmail,
} from "./EmailHelper.js";
import ScheduleEntry from "../Models/ScheduleEntry.js";
import ScheduleSeries from "../Models/ScheduleSeries.js";
import { createNotificationService } from "../Services/NotificationService.js";
import { materializeSeriesService } from "../Services/scheduleSeriesService.js";

const startScheduler = () => {
  // Under PM2 cluster mode every worker would otherwise register every cron job,
  // sending duplicate emails/notifications and racing on the reminder writes.
  // Only worker 0 runs the scheduler. When NODE_APP_INSTANCE is unset (plain
  // `node server.js` or a single-instance deploy) we run as normal.
  const instanceId = process.env.NODE_APP_INSTANCE;
  if (instanceId !== undefined && instanceId !== "0") {
    console.log(`[Scheduler] Skipping cron registration on worker ${instanceId} (only worker 0 runs scheduled jobs)`);
    return;
  }

  // ─── Auto-complete sessions that ended 2+ hours ago (every hour) ─────────
  cron.schedule("0 * * * *", async () => {
    try {
      const count = await autoCompleteStaleSessionsService();
      if (count > 0) console.log(`[Scheduler] Auto-completed ${count} stale session(s)`);
    } catch (err) {
      console.error("[Scheduler] autoCompleteStale error:", err.message);
    }
  });

  // ─── 24h session reminders (daily at 8 AM) ────────────────────────────────
  cron.schedule("0 8 * * *", async () => {
    try {
      const now = new Date();
      const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const in25h = new Date(now.getTime() + 25 * 60 * 60 * 1000);

      const upcomingSessions = await Session.find({
        date: { $gte: in24h, $lte: in25h },
        status: "pending",
        deletedAt: null,
      })
        .populate({ path: "studentProfileId", populate: { path: "user", select: "Email FullName" } })
        .populate("instructorId", "Email FullName")
        .lean();

      await Promise.allSettled(
        upcomingSessions.map((s) => {
          const studentEmail = s.studentProfileId?.user?.Email;
          const studentName = s.studentProfileId?.user?.FullName;
          if (!studentEmail) return Promise.resolve();
          return sendSessionReminderEmail({ to: studentEmail, userName: studentName, session: s });
        })
      );
    } catch (err) {
      console.error("[Scheduler] Session reminder error:", err.message);
    }
  });

  // ─── Day-of task reminders (daily at 9 AM) ────────────────────────────────
  cron.schedule("0 9 * * *", async () => {
    try {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);

      const dueTasks = await Task.find({
        dueDate: { $gte: startOfToday, $lte: endOfToday },
        status: "pending",
        deletedAt: null,
      })
        .populate({ path: "studentProfileId", populate: { path: "user", select: "Email FullName" } })
        .lean();

      await Promise.allSettled(
        dueTasks.map((t) => {
          const email = t.studentProfileId?.user?.Email;
          const name = t.studentProfileId?.user?.FullName;
          if (!email) return Promise.resolve();
          return sendTaskReminderEmail({ to: email, userName: name, task: t });
        })
      );
    } catch (err) {
      console.error("[Scheduler] Task reminder error:", err.message);
    }
  });

  // ─── Weekly parent summary (every Sunday at 9 AM) ─────────────────────────
  cron.schedule("0 9 * * 0", async () => {
    try {
      const parents = await User.find({ role: "parent", isActive: true }, "Email FullName _id").lean();

      await Promise.allSettled(
        parents.map(async (parent) => {
          const children = await StudentProfile.find({ parents: parent._id })
            .populate("user", "FullName")
            .lean();
          if (!children.length) return;
          return sendWeeklySummaryEmail({ to: parent.Email, userName: parent.FullName, children });
        })
      );
    } catch (err) {
      console.error("[Scheduler] Weekly summary error:", err.message);
    }
  });

  // ─── Schedule reminder notifications (every 5 minutes) ───────────────────────
  cron.schedule("*/5 * * * *", async () => {
    try {
      const now = new Date();
      const entries = await ScheduleEntry.find({
        deletedAt: null,
        "reminders.sentAt": null,
        startAt: { $gt: now },
      }).populate({
        path: "studentProfileId",
        populate: [
          { path: "user", select: "_id FullName" },
          { path: "parents", select: "_id FullName" },
        ],
      });

      await Promise.allSettled(
        entries.map(async (entry) => {
          try {
            let modified = false;
            for (const reminder of entry.reminders) {
              if (reminder.sentAt !== null) continue;
              const fireAt = new Date(entry.startAt.getTime() - reminder.minutesBefore * 60 * 1000);
              if (now < fireAt) continue;

              const studentUserId = entry.studentProfileId?.user?._id;
              if (!studentUserId) continue;

              const minutesLabel = reminder.minutesBefore >= 60
                ? `${reminder.minutesBefore / 60} hour(s)`
                : `${reminder.minutesBefore} minute(s)`;

              const studentName = entry.studentProfileId?.user?.FullName || "Your child";

              // Notify the student. This is the authoritative delivery: the
              // reminder is marked sent against the student's notification, so a
              // failure here propagates and the reminder is retried next run.
              const studentNotif = await createNotificationService({
                recipient: studentUserId,
                type: "schedule_reminder",
                title: entry.title,
                message: `Reminder: "${entry.title}" starts in ${minutesLabel}`,
              });
              reminder.sentAt = now;
              reminder.notificationId = studentNotif._id;
              modified = true;

              // Notify parents (all entry types) and the instructor (sessions
              // only) as best-effort — their failures must not block marking the
              // reminder as sent for the student above.
              const extraRecipients = [];

              for (const parent of entry.studentProfileId?.parents || []) {
                const parentId = parent?._id || parent;
                if (!parentId) continue;
                extraRecipients.push(
                  createNotificationService({
                    recipient: parentId,
                    type: "schedule_reminder",
                    title: entry.title,
                    message: `Reminder: ${studentName}'s "${entry.title}" starts in ${minutesLabel}`,
                  }),
                );
              }

              if (entry.entryType === "session" && entry.instructorId) {
                extraRecipients.push(
                  createNotificationService({
                    recipient: entry.instructorId,
                    type: "schedule_reminder",
                    title: entry.title,
                    message: `Reminder: ${studentName}'s "${entry.title}" starts in ${minutesLabel}`,
                  }),
                );
              }

              if (extraRecipients.length) {
                const results = await Promise.allSettled(extraRecipients);
                results.forEach((r) => {
                  if (r.status === "rejected") {
                    console.error("[Scheduler] Reminder fan-out notification failed:", r.reason?.message);
                  }
                });
              }
            }
            if (modified) await entry.save();
          } catch (entryErr) {
            console.error("[Scheduler] Reminder error for entry", entry._id, ":", entryErr.message);
          }
        })
      );
    } catch (err) {
      console.error("[Scheduler] Schedule reminder cron error:", err.message);
    }
  });

  // ─── Extend series materialization horizon (daily at midnight UTC) ────────────
  cron.schedule("0 0 * * *", async () => {
    try {
      const horizon = new Date(Date.now() + 12 * 7 * 24 * 60 * 60 * 1000);
      const series = await ScheduleSeries.find({
        deletedAt: null,
        $or: [
          { materializedUntil: { $lt: horizon } },
          { materializedUntil: null },
        ],
      });

      await Promise.allSettled(
        series.map(async (s) => {
          try {
            const fromDate = s.materializedUntil ? new Date(s.materializedUntil) : new Date(s.startsOn);
            await materializeSeriesService(s, fromDate, horizon);
            s.materializedUntil = horizon;
            await s.save();
          } catch (seriesErr) {
            console.error("[Scheduler] Series materialization error for series", s._id, ":", seriesErr.message);
          }
        })
      );
    } catch (err) {
      console.error("[Scheduler] Series horizon cron error:", err.message);
    }
  });

  console.log("[Scheduler] All cron jobs registered");
};

export { startScheduler };
