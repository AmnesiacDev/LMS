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

const startScheduler = () => {
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

  console.log("[Scheduler] All cron jobs registered");
};

export { startScheduler };
