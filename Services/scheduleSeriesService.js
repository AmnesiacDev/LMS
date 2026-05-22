import ScheduleSeries from "../Models/ScheduleSeries.js";
import ScheduleEntry from "../Models/ScheduleEntry.js";
import StudentProfile from "../Models/studentProfile.js";
import AppErrorHelper from "../Utilities/AppErrorHelper.js";

// ─── Helper: ISO week number ──────────────────────────────────────────────────
const getWeekNumber = (date) => {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
};

// ─── Materialize entries for a series between two dates ───────────────────────
const materializeSeriesService = async (series, fromDate, toDate) => {
  // 1. Parse startTime (e.g. "08:00") into hours and minutes
  const [hours, minutes] = series.startTime.split(":").map(Number);

  // 2. Compute week number of series.startsOn for biweekly parity check
  const startsOnWeek = getWeekNumber(new Date(series.startsOn));

  const entries = [];
  const current = new Date(fromDate);

  // Normalise exceptions to YYYY-MM-DD strings for fast lookup
  const exceptionSet = new Set(
    (series.exceptions || []).map((d) => new Date(d).toISOString().slice(0, 10))
  );

  // 3. Iterate day-by-day
  while (current <= toDate) {
    const dayOfWeek = current.getUTCDay();
    const dateStr = current.toISOString().slice(0, 10);

    // 4a. Check if current day is in series.daysOfWeek
    if (series.daysOfWeek.includes(dayOfWeek)) {
      // 4b. Biweekly parity check
      if (series.frequency === "biweekly") {
        const weekDiff = Math.abs(getWeekNumber(current) - startsOnWeek);
        if (weekDiff % 2 !== 0) {
          current.setUTCDate(current.getUTCDate() + 1);
          continue;
        }
      }

      // 4c. Skip exceptions
      if (exceptionSet.has(dateStr)) {
        current.setUTCDate(current.getUTCDate() + 1);
        continue;
      }

      // 4d. Skip if past endsOn
      if (series.endsOn && current > new Date(series.endsOn)) {
        current.setUTCDate(current.getUTCDate() + 1);
        continue;
      }

      // 5. Build entry
      const startAt = new Date(Date.UTC(
        current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate(),
        hours, minutes, 0
      ));
      const endAt = new Date(startAt.getTime() + series.durationMin * 60 * 1000);

      entries.push({
        studentProfileId: series.studentProfileId,
        instructorId: series.instructorId,
        entryType: "session",
        seriesId: series._id,
        title: series.templateTitle,
        subject: series.subject,
        startAt,
        endAt,
        reminders: [
          { minutesBefore: 60, sentAt: null },
          { minutesBefore: 1440, sentAt: null },
        ],
      });
    }

    current.setUTCDate(current.getUTCDate() + 1);
  }

  // 6. Bulk insert
  if (entries.length > 0) {
    await ScheduleEntry.insertMany(entries, { ordered: false });
  }

  // 7. Return count
  return entries.length;
};

// ─── Create a new series and materialize 12 weeks ahead ──────────────────────
const createSeriesService = async (payload) => {
  const series = await ScheduleSeries.create(payload);
  const horizon = new Date(Date.now() + 12 * 7 * 24 * 60 * 60 * 1000);
  await materializeSeriesService(series, series.startsOn, horizon);
  series.materializedUntil = horizon;
  await series.save();
  return series;
};

// ─── Update a series: soft-delete future entries and re-materialize ───────────
const updateSeriesService = async (seriesId, payload) => {
  const series = await ScheduleSeries.findByIdAndUpdate(seriesId, payload, {
    new: true,
    runValidators: true,
  });

  if (!series) {
    throw new AppErrorHelper("Schedule series not found!", 404);
  }

  const now = new Date();
  const horizon = new Date(Date.now() + 12 * 7 * 24 * 60 * 60 * 1000);

  // Soft-delete all future entries belonging to this series
  await ScheduleEntry.updateMany(
    { seriesId, startAt: { $gt: now } },
    { deletedAt: now },
    { setOptions: { withDeleted: true } }
  );

  // Re-materialize from now
  await materializeSeriesService(series, now, horizon);

  series.materializedUntil = horizon;
  await series.save();

  return series;
};

// ─── Soft-delete a series and all its future entries ─────────────────────────
const softDeleteSeriesService = async (seriesId) => {
  const series = await ScheduleSeries.findByIdAndUpdate(
    seriesId,
    { deletedAt: new Date() },
    { new: true }
  );

  if (!series) {
    throw new AppErrorHelper("Schedule series not found!", 404);
  }

  await ScheduleEntry.updateMany(
    { seriesId: series._id, startAt: { $gt: new Date() } },
    { deletedAt: new Date() },
    { setOptions: { withDeleted: true } }
  );

  return series;
};

// ─── Get all series visible to a user ────────────────────────────────────────
const getSeriesForUserService = async (user) => {
  if (user.role === "instructor") {
    return await ScheduleSeries.find({ instructorId: user._id });
  }

  if (user.role === "student") {
    const profile = await StudentProfile.findOne({ user: user._id });
    if (!profile) {
      throw new AppErrorHelper("Student profile not found!", 404);
    }
    return await ScheduleSeries.find({ studentProfileId: profile._id });
  }

  if (user.role === "admin") {
    return await ScheduleSeries.find({});
  }

  throw new AppErrorHelper("Not allowed!", 403);
};

export {
  createSeriesService,
  materializeSeriesService,
  updateSeriesService,
  softDeleteSeriesService,
  getSeriesForUserService,
};
