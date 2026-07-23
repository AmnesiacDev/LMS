import "dotenv/config";
import mongoose from "mongoose";
import Db_Connection from "../Configs/DbConfig.js";
import ScheduleEntry from "../Models/ScheduleEntry.js";
import Session from "../Models/Session.js";
import StudentInstructorAssignment from "../Models/StudentInstructorAssignment.js";
import Task from "../Models/Task.js";

const daysFromNow = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

const getDisplayName = (user) => user.FullName?.split(" ")[0] || "Student";

async function upsertSessionSchedule(session) {
  const startAt = new Date(session.date);
  const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);

  await ScheduleEntry.findOneAndUpdate(
    { sessionId: session._id },
    {
      studentProfileId: session.studentProfileId,
      instructorId: session.instructorId,
      entryType: "session",
      sessionId: session._id,
      title: session.title,
      startAt,
      endAt,
      reminders: [
        { minutesBefore: 60, sentAt: null },
        { minutesBefore: 1440, sentAt: null },
      ],
      status: "scheduled",
      deletedAt: null,
    },
    { upsert: true, returnDocument: "after", runValidators: true, setDefaultsOnInsert: true },
  );
}

async function upsertTaskSchedule(task) {
  const endAt = new Date(task.dueDate);
  const startAt = new Date(endAt.getTime() - 30 * 60 * 1000);

  await ScheduleEntry.findOneAndUpdate(
    { taskId: task._id },
    {
      studentProfileId: task.studentProfileId,
      instructorId: task.instructorId,
      entryType: "task_due",
      taskId: task._id,
      title: task.title,
      startAt,
      endAt,
      reminders: [{ minutesBefore: 1440, sentAt: null }],
      status: "scheduled",
      deletedAt: null,
    },
    { upsert: true, returnDocument: "after", runValidators: true, setDefaultsOnInsert: true },
  );
}

async function seedAssignmentDemoData() {
  await Db_Connection();

  try {
    const assignments = await StudentInstructorAssignment.find({ status: "active" })
      .populate({ path: "studentProfileId", populate: { path: "user", select: "FullName" } })
      .populate({ path: "instructorId", select: "FullName" });

    if (!assignments.length) {
      console.log("No active instructor assignments found. Create assignments in the admin dashboard before running this seed.");
      return;
    }

    let sessionsSeeded = 0;
    let tasksSeeded = 0;

    for (const assignment of assignments) {
      const profile = assignment.studentProfileId;
      const studentName = getDisplayName(profile.user);
      const instructorName = getDisplayName(assignment.instructorId);
      const identity = `${studentName}-${instructorName}`;

      const sessionDefinitions = [
        {
          title: `Demo ${identity} Coding Lab`,
          description: "A dummy upcoming coding session for testing the assigned learning team.",
          date: daysFromNow(2),
        },
        {
          title: `Demo ${identity} Progress Check`,
          description: "A dummy upcoming progress-review session for testing the assigned learning team.",
          date: daysFromNow(7),
        },
      ];

      const sessions = [];
      for (const definition of sessionDefinitions) {
        const session = await Session.findOneAndUpdate(
          {
            studentProfileId: profile._id,
            instructorId: assignment.instructorId._id,
            title: definition.title,
          },
          {
            ...definition,
            studentProfileId: profile._id,
            instructorId: assignment.instructorId._id,
            StudentAttended: true,
            status: "pending",
            notes: "Created by the assigned-demo-data seed.",
            summary: "",
            recapVideoLinks: [],
            attachmentsLinks: [],
            deletedAt: null,
          },
          { upsert: true, returnDocument: "after", runValidators: true, setDefaultsOnInsert: true },
        );
        await upsertSessionSchedule(session);
        sessions.push(session);
        sessionsSeeded += 1;
      }

      const taskDefinitions = [
        {
          title: `Demo ${identity} JavaScript Practice`,
          description: "Complete the dummy JavaScript practice task before the next coding lab.",
          dueDate: daysFromNow(4),
          sessionId: sessions[0]._id,
        },
        {
          title: `Demo ${identity} Weekly Reflection`,
          description: "Write a short reflection for the upcoming progress check.",
          dueDate: daysFromNow(8),
          sessionId: sessions[1]._id,
        },
      ];

      for (const definition of taskDefinitions) {
        const task = await Task.findOneAndUpdate(
          {
            studentProfileId: profile._id,
            instructorId: assignment.instructorId._id,
            title: definition.title,
          },
          {
            ...definition,
            studentProfileId: profile._id,
            instructorId: assignment.instructorId._id,
            status: "pending",
            taskLinks: [],
            deletedAt: null,
          },
          { upsert: true, returnDocument: "after", runValidators: true, setDefaultsOnInsert: true },
        );
        await upsertTaskSchedule(task);
        tasksSeeded += 1;
      }
    }

    console.log(`Created or refreshed ${sessionsSeeded} dummy sessions and ${tasksSeeded} dummy tasks.`);
    console.log("Only records with the Demo prefix are managed by this seed; it does not delete manual data.");
  } finally {
    await mongoose.connection.close();
  }
}

seedAssignmentDemoData().catch((error) => {
  console.error("Assigned demo-data seed failed:", error.message);
  process.exitCode = 1;
});
