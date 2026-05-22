import ScheduleEntry from "../Models/ScheduleEntry.js";
import Task from "../Models/Task.js";
import StudentProfile from "../Models/studentProfile.js";
import AppErrorHelper from "../Utilities/AppErrorHelper.js";

// ─── Get entries within a date range, scoped by role ─────────────────────────
const getEntriesService = async (user, startDate, endDate) => {
  let filter = {
    startAt: { $gte: startDate, $lte: endDate },
  };

  if (user.role === "student") {
    const profile = await StudentProfile.findOne({ user: user._id });
    if (!profile) throw new AppErrorHelper("Student profile not found", 404);
    filter.studentProfileId = profile._id;
  } else if (user.role === "parent") {
    const profiles = await StudentProfile.find({ parents: user._id }, { _id: 1 });
    const ids = profiles.map((p) => p._id);
    filter.studentProfileId = { $in: ids };
  } else if (user.role === "instructor") {
    filter.instructorId = user._id;
  } else if (user.role === "admin") {
    // no additional filter
  } else {
    throw new AppErrorHelper("Not allowed", 403);
  }

  return await ScheduleEntry.find(filter).sort("startAt");
};

// ─── Get entries for the current week (Mon 00:00 UTC – Sun 23:59:59 UTC) ─────
const getWeekEntriesService = async (user) => {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + diffToMonday,
      0,
      0,
      0,
    ),
  );
  const sunday = new Date(
    monday.getTime() + 6 * 24 * 60 * 60 * 1000 + 23 * 3600000 + 59 * 60000 + 59000,
  );

  return await getEntriesService(user, monday, sunday);
};

// ─── Get a single entry by ID with role-based authorization ──────────────────
const getEntryByIdService = async (user, entryId) => {
  const entry = await ScheduleEntry.findById(entryId);
  if (!entry) throw new AppErrorHelper("Schedule entry not found", 404);

  if (user.role === "admin") {
    return entry;
  }

  if (user.role === "instructor") {
    if (String(entry.instructorId) !== String(user._id)) {
      throw new AppErrorHelper("Not allowed", 403);
    }
    return entry;
  }

  if (user.role === "student") {
    const profile = await StudentProfile.findOne({ user: user._id });
    if (!profile || String(entry.studentProfileId) !== String(profile._id)) {
      throw new AppErrorHelper("Not allowed", 403);
    }
    return entry;
  }

  if (user.role === "parent") {
    const profiles = await StudentProfile.find({ parents: user._id }, { _id: 1 });
    const ids = profiles.map((p) => String(p._id));
    if (!ids.includes(String(entry.studentProfileId))) {
      throw new AppErrorHelper("Not allowed", 403);
    }
    return entry;
  }

  throw new AppErrorHelper("Not allowed", 403);
};

// ─── Update an entry; sync task dueDate when endAt changes ───────────────────
const updateEntryService = async (entryId, payload) => {
  const entry = await ScheduleEntry.findByIdAndUpdate(entryId, payload, {
    new: true,
    runValidators: true,
  });

  if (!entry) throw new AppErrorHelper("Schedule entry not found", 404);

  if (payload.endAt && entry.taskId) {
    await Task.findByIdAndUpdate(entry.taskId, { dueDate: payload.endAt });
  }

  return entry;
};

// ─── Create a custom entry with conflict detection ───────────────────────────
const createCustomEntryService = async (payload) => {
  if (payload.entryType !== "custom") {
    throw new AppErrorHelper("entryType must be 'custom' for this endpoint", 400);
  }

  const conflicts = await ScheduleEntry.find({
    studentProfileId: payload.studentProfileId,
    deletedAt: null,
    startAt: { $lt: new Date(payload.endAt) },
    endAt: { $gt: new Date(payload.startAt) },
  }).select("_id title startAt endAt");

  const entry = await ScheduleEntry.create(payload);

  return { entry, conflicts };
};

// ─── Soft-delete an entry ─────────────────────────────────────────────────────
const softDeleteEntryService = async (entryId) => {
  const entry = await ScheduleEntry.findByIdAndUpdate(
    entryId,
    { deletedAt: new Date() },
    { new: true },
  );

  if (!entry) throw new AppErrorHelper("Schedule entry not found", 404);

  return entry;
};

export {
  getEntriesService,
  getWeekEntriesService,
  getEntryByIdService,
  updateEntryService,
  createCustomEntryService,
  softDeleteEntryService,
};
