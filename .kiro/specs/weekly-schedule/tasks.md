# Implementation Plan: Weekly Schedule Feature

## Overview

Implements the Weekly Schedule feature end-to-end: two new Mongoose models, post-save hooks on Session and Task, two service modules, a controller, a router, App.js mount, and two cron jobs.

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1", "2", "3"], "description": "Foundation models and enum — no dependencies" },
    { "wave": 2, "tasks": ["4", "5"], "description": "Session and Task post-save hooks — depend on Task 1" },
    { "wave": 3, "tasks": ["6", "7"], "description": "Service layer — depends on Tasks 1 and 2" },
    { "wave": 4, "tasks": ["8", "11"], "description": "Controller and cron jobs — depend on Tasks 6 and 7" },
    { "wave": 5, "tasks": ["9"], "description": "Router — depends on Task 8" },
    { "wave": 6, "tasks": ["10"], "description": "App.js mount — depends on Task 9" }
  ]
}
```

## Tasks

- [x] 1. Create ScheduleEntry model
  - Create `Models/ScheduleEntry.js` with the full Mongoose schema
  - Define all fields: `studentProfileId`, `instructorId`, `entryType`, `sessionId`, `taskId`, `title`, `subject`, `color`, `notes`, `startAt`, `endAt`, `timezone`, `allDay`, `seriesId`, `isException`, `reminders`, `status`, `deletedAt`, and Mongoose `timestamps`
  - Define reminder sub-document schema with `minutesBefore`, `sentAt`, and `notificationId`
  - Add pre-validate hook that throws `AppErrorHelper("endAt must be after startAt", 400)` when `endAt <= startAt`
  - Add pre-find hook that excludes documents where `deletedAt` is not null unless `withDeleted: true` is set in query options
  - Add all 5 indexes: `{ studentProfileId: 1, startAt: 1 }`, `{ instructorId: 1, startAt: 1 }`, `{ taskId: 1 }`, `{ sessionId: 1 }`, `{ seriesId: 1, startAt: 1 }`
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 2. Create ScheduleSeries model
  - Create `Models/ScheduleSeries.js` with the full Mongoose schema
  - Define all fields: `studentProfileId`, `instructorId`, `templateTitle`, `subject`, `frequency`, `daysOfWeek`, `startTime`, `durationMin`, `startsOn`, `endsOn`, `exceptions`, `materializedUntil`, `deletedAt`, and Mongoose `timestamps`
  - Add pre-find hook that excludes documents where `deletedAt` is not null unless `withDeleted: true` is set in query options
  - _Requirements: 2.1, 2.2_

- [x] 3. Extend Notification type enum
  - Modify `Models/Notification.js` to add `"schedule_reminder"`, `"schedule_updated"`, and `"new_schedule_entry"` to the existing `type` enum
  - Do not remove or reorder any existing enum values
  - _Requirements: 11.1_

- [x] 4. Add Session post-save hooks
  - Depends on task 1
  - Modify `Models/Session.js` — append a single `post("save")` hook after the existing pre-save hook; do not rewrite the file
  - Inside the hook, lazily import `ScheduleEntry` via `const ScheduleEntry = (await import('./ScheduleEntry.js')).default` to avoid circular dependency
  - Branch 1 — `this.isNew`: create a linked `ScheduleEntry` with `entryType: "session"`, `sessionId: this._id`, `startAt: this.date`, `endAt: this.date + 60 minutes`, `title: this.title`, `studentProfileId` and `instructorId` copied from the session, and `reminders: [{ minutesBefore: 60 }, { minutesBefore: 1440 }]`
  - Branch 2 — `this.isModified('date')`: `findOneAndUpdate({ sessionId: this._id }, { startAt, endAt })`
  - Branch 3 — `this.isModified('status')`: `findOneAndUpdate({ sessionId: this._id }, { status: this.status })`
  - Branch 4 — `this.isModified('deletedAt') && this.deletedAt`: `findOneAndUpdate({ sessionId: this._id }, { deletedAt: new Date() })`
  - Wrap all logic in try/catch; on error call `console.error('[Session hook] ScheduleEntry sync failed:', err.message)` and never re-throw
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 5. Add Task post-save hooks
  - Depends on task 1
  - Modify `Models/Task.js` — append a single `post("save")` hook after the existing hooks; do not rewrite the file
  - Inside the hook, lazily import `ScheduleEntry` via `const ScheduleEntry = (await import('./ScheduleEntry.js')).default` to avoid circular dependency
  - Branch 1 — `this.isNew`: create a linked `ScheduleEntry` with `entryType: "task_due"`, `taskId: this._id`, `startAt: this.dueDate - 30 minutes`, `endAt: this.dueDate`, `title: this.title`, `studentProfileId` and `instructorId` copied from the task, and `reminders: [{ minutesBefore: 1440 }]`
  - Branch 2 — `this.isModified('dueDate')`: `findOneAndUpdate({ taskId: this._id }, { startAt: dueDate - 30 min, endAt: dueDate })`
  - Branch 3 — `this.isModified('status')`: `findOneAndUpdate({ taskId: this._id }, { status: this.status })`
  - Branch 4 — `this.isModified('deletedAt') && this.deletedAt`: `findOneAndUpdate({ taskId: this._id }, { deletedAt: new Date() })`
  - Wrap all logic in try/catch; on error call `console.error('[Task hook] ScheduleEntry sync failed:', err.message)` and never re-throw
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 6. Create scheduleEntryService.js
  - Depends on task 1
  - Depends on task 2
  - Create `Services/scheduleEntryService.js`; import `ScheduleEntry`, `Task`, `StudentProfile`, `AppErrorHelper`, and `ApiFeatures`
  - Implement `getEntriesService(user, startDate, endDate)`: build a role-scoped query (`student` → own profile, `parent` → children profiles, `instructor` → by `instructorId`, `admin` → all) filtered to `startAt >= startDate && startAt <= endDate`; return matching entries
  - Implement `getWeekEntriesService(user)`: compute current week's Monday 00:00:00 UTC and Sunday 23:59:59 UTC, then delegate to `getEntriesService`
  - Implement `getEntryByIdService(user, entryId)`: `findById`, throw 404 if not found; check role-based authorization; throw 403 if unauthorized
  - Implement `updateEntryService(entryId, payload)`: `findByIdAndUpdate` with `{ new: true, runValidators: true }`; if `payload.endAt` is present and entry has a `taskId`, also update `Task.dueDate` to `payload.endAt`; return updated entry
  - Implement `createCustomEntryService(payload)`: validate `entryType === "custom"` (throw 400 otherwise); detect conflicts; create entry; return `{ entry, conflicts: [conflictingEntryIds] }`
  - Implement `softDeleteEntryService(entryId)`: `findByIdAndUpdate(entryId, { deletedAt: new Date() }, { new: true })`; throw 404 if not found
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 12.1, 12.2_

- [x] 7. Create scheduleSeriesService.js
  - Depends on task 1
  - Depends on task 2
  - Create `Services/scheduleSeriesService.js`; import `ScheduleSeries`, `ScheduleEntry`, `StudentProfile`, and `AppErrorHelper`
  - Implement `createSeriesService(payload)`: create `ScheduleSeries` document; compute horizon as `now + 12 weeks`; call `materializeSeriesService`; set `series.materializedUntil = horizon` and save; return series
  - Implement `materializeSeriesService(series, fromDate, toDate)`: parse `series.startTime`; iterate day-by-day; check `daysOfWeek`, biweekly parity, `exceptions`, and `endsOn`; bulk-insert entries with `insertMany({ ordered: false })`; return count
  - Implement `updateSeriesService(seriesId, payload)`: update series; soft-delete all future entries; re-materialize; update `materializedUntil`; return updated series
  - Implement `softDeleteSeriesService(seriesId)`: soft-delete series and all future linked entries; throw 404 if not found
  - Implement `getSeriesForUserService(user)`: role-scoped list; throw 403 for unsupported roles
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

- [x] 8. Create ScheduleController.js
  - Depends on task 6
  - Depends on task 7
  - Create `Controllers/ScheduleController.js`; import `CatchAsync`, both services, and `ScheduleSeries`
  - Implement all 11 controller functions wrapped in `CatchAsync`: `getEntriesController`, `getWeekEntriesController`, `getEntryByIdController`, `updateEntryController`, `createCustomEntryController`, `softDeleteEntryController`, `createSeriesController`, `getSeriesController`, `getSeriesByIdController`, `updateSeriesController`, `deleteSeriesController`
  - Use consistent response envelope: `{ status: "success", data: { ... } }`
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

- [x] 9. Create ScheduleRouter.js
  - Depends on task 8
  - Create `Routes/ScheduleRouter.js`; import `express`, `protectionController`, `restrictedToController` from `AuthController.js`, and all controller functions
  - Apply `router.use(protectionController)` to require a valid JWT on all routes
  - Declare `/series` routes before `/:id` routes to prevent Express matching `"series"` as an `:id` param
  - Read-only routes (all authenticated roles): `GET /`, `GET /week`, `GET /series`, `GET /series/:id`, `GET /:id`
  - Instructor + admin only routes: `POST /custom`, `PATCH /:id`, `DELETE /:id`, `POST /series`, `PATCH /series/:id`, `DELETE /series/:id`
  - Export the router as default
  - _Requirements: 7.7, 7.8, 8.6_

- [x] 10. Mount schedule router in App.js
  - Depends on task 9
  - Modify `App.js` — add `import scheduleRouter from "./Routes/ScheduleRouter.js"` alongside the existing router imports
  - Add `app.use("/api/v1/schedule", scheduleRouter)` in the routes section
  - Do not remove or reorder any existing routes
  - _Requirements: 13.1_

- [x] 11. Add cron jobs to scheduler.js
  - Depends on task 6
  - Depends on task 7
  - Modify `Utilities/scheduler.js` — append two new `cron.schedule` calls inside the existing `startScheduler()` function
  - Add imports for `ScheduleEntry`, `ScheduleSeries`, `StudentProfile`, `Notification`, and `materializeSeriesService`
  - Cron Job 1 — Reminder Dispatcher (`*/5 * * * *`): query entries with unsent due reminders; create `Notification` documents; stamp `sentAt`; also notify instructor for session entries; catch per-entry errors and continue
  - Cron Job 2 — Series Horizon Extender (`0 0 * * *`): find series needing extension; call `materializeSeriesService`; update `materializedUntil`; catch per-series errors and continue
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 10.1, 10.2, 10.3_

## Notes

- Tasks 1, 2, and 3 have no dependencies and can run in parallel.
- Tasks 4 and 5 (hooks) must wait for Task 1 since they reference `ScheduleEntry`.
- Tasks 6 and 7 (services) must wait for both models (Tasks 1 and 2).
- Task 8 (controller) must wait for both services (Tasks 6 and 7).
- Tasks 9 → 10 form a strict chain: router depends on controller, App.js depends on router.
- Task 11 (cron jobs) depends on the services (Tasks 6 and 7) and can run in parallel with Tasks 8–10.
- All new files use ES module syntax (`import`/`export`).
- Post-save hooks use lazy dynamic `import()` to avoid circular dependency issues.
