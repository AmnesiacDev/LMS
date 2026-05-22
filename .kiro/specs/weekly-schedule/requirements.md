# Requirements Document

## Introduction

This document specifies the requirements for the **Weekly Schedule** feature in the LMS backend. The feature adds a timetable/calendar system that surfaces sessions as time blocks, task due dates as deadline markers, and fires in-app notifications via schedule reminders. It introduces two new Mongoose models (`ScheduleEntry` and `ScheduleSeries`), post-save/post-remove hooks on the existing `Session` and `Task` models, a set of REST API endpoints, and two new cron jobs integrated into the existing `scheduler.js`.

The `ScheduleEntry` model is the authoritative calendar record. Sessions and Tasks create, update, and soft-delete their linked entries automatically through hooks. Recurring sessions are managed through `ScheduleSeries` documents whose occurrences are materialized as individual `ScheduleEntry` documents up to a 12-week rolling horizon.

---

## Glossary

- **ScheduleEntry**: A Mongoose document that represents one calendar block. It is the single source of truth for what appears on the weekly schedule grid.
- **ScheduleSeries**: A Mongoose document that stores the recurrence rule (weekly or biweekly) for a repeating session pattern. It owns the materialization horizon.
- **Materialization**: The process of generating individual `ScheduleEntry` documents from a `ScheduleSeries` rule up to a defined future horizon.
- **Reminder**: A sub-document inside a `ScheduleEntry` that records how many minutes before the entry start a `Notification` should be sent, and whether it has already been sent (`sentAt`).
- **Soft-delete**: Setting `deletedAt` to the current timestamp instead of removing the document. Pre-find hooks exclude soft-deleted documents from all queries by default.
- **Session**: An existing LMS model representing a tutoring session between an instructor and a student.
- **Task**: An existing LMS model representing a homework or assignment with a due date.
- **Notification**: An existing LMS model used to deliver in-app alerts to users.
- **StudentProfile**: An existing LMS model linking a student `User` to their parents and academic metadata.
- **Scheduler**: The `scheduler.js` utility that registers all `node-cron` jobs at server startup.
- **ApiFeatures**: An existing utility class that applies filter, sort, field selection, and pagination to a Mongoose query.
- **CatchAsync**: An existing higher-order function that wraps async controller functions and forwards errors to the global error handler.
- **AppErrorHelper**: An existing error class that creates operational errors with an HTTP status code.

---

## Requirements

### Requirement 1: ScheduleEntry Model

**User Story:** As a developer, I want a `ScheduleEntry` Mongoose model, so that the system has a single authoritative document for every calendar block displayed on the weekly schedule.

#### Acceptance Criteria

1. THE `ScheduleEntry` model SHALL define the fields: `studentProfileId` (ObjectId ref `StudentProfile`, required), `instructorId` (ObjectId ref `User`, required), `entryType` (String enum `["session", "task_due", "custom"]`, required), `sessionId` (ObjectId ref `Session`, optional), `taskId` (ObjectId ref `Task`, optional), `title` (String, required), `subject` (String, optional), `color` (String, optional), `notes` (String, optional), `startAt` (Date, required), `endAt` (Date, required), `timezone` (String, default `"UTC"`), `allDay` (Boolean, default `false`), `seriesId` (ObjectId ref `ScheduleSeries`, optional), `isException` (Boolean, default `false`), `reminders` (Array of sub-documents), `status` (String enum `["scheduled","completed","canceled","rescheduled"]`, default `"scheduled"`), `deletedAt` (Date, default `null`), and Mongoose `timestamps`.
2. THE `ScheduleEntry` model SHALL define each reminder sub-document with the fields: `minutesBefore` (Number, required), `sentAt` (Date, default `null`), and `notificationId` (ObjectId ref `Notification`, optional).
3. WHEN a `ScheduleEntry` document is validated, THE `ScheduleEntry` model SHALL enforce that `endAt` is strictly greater than `startAt`.
4. THE `ScheduleEntry` model SHALL define the following indexes: `{ studentProfileId: 1, startAt: 1 }`, `{ instructorId: 1, startAt: 1 }`, `{ taskId: 1 }`, `{ sessionId: 1 }`, and `{ seriesId: 1, startAt: 1 }`.
5. THE `ScheduleEntry` model SHALL apply a pre-find hook that excludes documents where `deletedAt` is not `null`, unless the query option `withDeleted: true` is set.

---

### Requirement 2: ScheduleSeries Model

**User Story:** As a developer, I want a `ScheduleSeries` Mongoose model, so that the system can store recurrence rules for repeating sessions and track how far entries have been materialized.

#### Acceptance Criteria

1. THE `ScheduleSeries` model SHALL define the fields: `studentProfileId` (ObjectId ref `StudentProfile`, required), `instructorId` (ObjectId ref `User`, required), `templateTitle` (String, required), `subject` (String, optional), `frequency` (String enum `["weekly","biweekly"]`, required), `daysOfWeek` (Array of Numbers 0–6), `startTime` (String, required, e.g. `"08:00"`), `durationMin` (Number, required), `startsOn` (Date, required), `endsOn` (Date, optional), `exceptions` (Array of Dates), `materializedUntil` (Date, optional), `deletedAt` (Date, default `null`), and Mongoose `timestamps`.
2. THE `ScheduleSeries` model SHALL apply a pre-find hook that excludes documents where `deletedAt` is not `null`, unless the query option `withDeleted: true` is set.

---

### Requirement 3: Session Hook — ScheduleEntry Synchronization

**User Story:** As an instructor, I want session create/update/delete actions to automatically keep the schedule calendar in sync, so that I never have to manually manage calendar entries for sessions.

#### Acceptance Criteria

1. WHEN a `Session` document is created, THE `Session` model SHALL trigger a post-save hook that creates a linked `ScheduleEntry` with `entryType: "session"`, `sessionId` set to the session's `_id`, `startAt` set to `session.date`, `endAt` set to `session.date + 60 minutes`, `title` set to `session.title`, `studentProfileId` and `instructorId` copied from the session, and `reminders` set to `[{ minutesBefore: 60, sentAt: null }, { minutesBefore: 1440, sentAt: null }]`.
2. WHEN a `Session` document's `date` field is modified and saved, THE `Session` model SHALL trigger a post-save hook that updates the linked `ScheduleEntry`'s `startAt` and `endAt` to reflect the new date.
3. WHEN a `Session` document's `status` field is modified and saved, THE `Session` model SHALL trigger a post-save hook that updates the linked `ScheduleEntry`'s `status` to match the session status.
4. WHEN a `Session` document is soft-deleted (i.e. `deletedAt` is set to a non-null value), THE `Session` model SHALL trigger a post-save hook that soft-deletes the linked `ScheduleEntry` by setting its `deletedAt` to the current timestamp.
5. IF a `Session` post-save hook fails to find or update the linked `ScheduleEntry`, THEN THE `Session` model SHALL log the error without throwing, so that the session save operation is not rolled back.

---

### Requirement 4: Task Hook — ScheduleEntry Synchronization

**User Story:** As an instructor, I want task create/update/delete actions to automatically keep the schedule calendar in sync, so that task due dates always appear correctly on the calendar.

#### Acceptance Criteria

1. WHEN a `Task` document is created, THE `Task` model SHALL trigger a post-save hook that creates a linked `ScheduleEntry` with `entryType: "task_due"`, `taskId` set to the task's `_id`, `endAt` set to `task.dueDate`, `startAt` set to `task.dueDate - 30 minutes`, `title` set to `task.title`, `studentProfileId` and `instructorId` copied from the task, and `reminders` set to `[{ minutesBefore: 1440, sentAt: null }]`.
2. WHEN a `Task` document's `dueDate` field is modified and saved, THE `Task` model SHALL trigger a post-save hook that updates the linked `ScheduleEntry`'s `startAt` to `newDueDate - 30 minutes` and `endAt` to `newDueDate`.
3. WHEN a `Task` document's `status` field is modified and saved to `"completed"` or `"canceled"`, THE `Task` model SHALL trigger a post-save hook that updates the linked `ScheduleEntry`'s `status` to match.
4. WHEN a `Task` document is soft-deleted (i.e. `deletedAt` is set to a non-null value), THE `Task` model SHALL trigger a post-save hook that soft-deletes the linked `ScheduleEntry` by setting its `deletedAt` to the current timestamp.
5. IF a `Task` post-save hook fails to find or update the linked `ScheduleEntry`, THEN THE `Task` model SHALL log the error without throwing, so that the task save operation is not rolled back.

---

### Requirement 5: Schedule Entry Service Layer

**User Story:** As a developer, I want a `scheduleEntryService.js` module, so that all business logic for reading and mutating `ScheduleEntry` documents is encapsulated and reusable.

#### Acceptance Criteria

1. WHEN `getEntriesService` is called with a user object and a date range (`startDate`, `endDate`), THE `ScheduleEntry_Service` SHALL return all non-deleted `ScheduleEntry` documents within that range, scoped by role: a student sees only their own entries, an instructor sees entries for all their students, a parent sees entries for their linked children, and an admin sees all entries.
2. WHEN `getEntryByIdService` is called with an entry ID and a user object, THE `ScheduleEntry_Service` SHALL return the matching `ScheduleEntry` document if the requesting user is authorized to view it, or throw a 403 `AppErrorHelper` if not.
3. WHEN `updateEntryService` is called with an entry ID and an update payload containing `startAt` and/or `endAt`, THE `ScheduleEntry_Service` SHALL update the `ScheduleEntry` document and, if the entry has a `taskId`, also update the linked `Task`'s `dueDate` to the new `endAt` value.
4. WHEN `createCustomEntryService` is called with a payload where `entryType` is `"custom"`, THE `ScheduleEntry_Service` SHALL create and return a new `ScheduleEntry` document.
5. WHEN `softDeleteEntryService` is called with an entry ID, THE `ScheduleEntry_Service` SHALL set `deletedAt` to the current timestamp on the matching `ScheduleEntry` document.
6. IF `getEntryByIdService` is called with an ID that does not match any document, THEN THE `ScheduleEntry_Service` SHALL throw a 404 `AppErrorHelper`.

---

### Requirement 6: Schedule Series Service Layer

**User Story:** As a developer, I want a `scheduleSeriesService.js` module, so that all business logic for creating, materializing, and managing recurring session series is encapsulated.

#### Acceptance Criteria

1. WHEN `createSeriesService` is called with a valid series payload, THE `ScheduleSeries_Service` SHALL create a `ScheduleSeries` document and immediately materialize `ScheduleEntry` documents for all occurrences from `startsOn` up to `now + 12 weeks`, setting `materializedUntil` on the series.
2. WHEN `materializeSeriesService` is called for a given `ScheduleSeries`, THE `ScheduleSeries_Service` SHALL generate `ScheduleEntry` documents only for dates not already materialized (i.e. dates after `materializedUntil`), respecting the `exceptions` array and the `endsOn` date if set.
3. WHEN `updateSeriesService` is called with an update payload, THE `ScheduleSeries_Service` SHALL update the `ScheduleSeries` document and delete all future `ScheduleEntry` documents linked to that series (where `startAt > now`), then re-materialize from `now` up to `now + 12 weeks`.
4. WHEN `softDeleteSeriesService` is called with a series ID, THE `ScheduleSeries_Service` SHALL soft-delete the `ScheduleSeries` document and soft-delete all future `ScheduleEntry` documents linked to that series (where `startAt > now`).
5. WHEN `getSeriesForUserService` is called with a user object, THE `ScheduleSeries_Service` SHALL return all non-deleted `ScheduleSeries` documents where `instructorId` or `studentProfileId` matches the requesting user's context.
6. IF `materializeSeriesService` encounters a date in the `exceptions` array, THEN THE `ScheduleSeries_Service` SHALL skip that date and not create a `ScheduleEntry` for it.

---

### Requirement 7: Schedule Entry API Endpoints

**User Story:** As a frontend developer, I want REST API endpoints for schedule entries, so that the calendar UI can read, create, update, and delete entries.

#### Acceptance Criteria

1. WHEN an authenticated user sends `GET /api/v1/schedule` with `startDate` and `endDate` query parameters, THE `Schedule_API` SHALL return all `ScheduleEntry` documents within that range, scoped by the user's role as defined in Requirement 5.1.
2. WHEN an authenticated user sends `GET /api/v1/schedule/week`, THE `Schedule_API` SHALL return all `ScheduleEntry` documents for the current calendar week (Monday 00:00 to Sunday 23:59 in UTC).
3. WHEN an authenticated user sends `GET /api/v1/schedule/:id`, THE `Schedule_API` SHALL return the single `ScheduleEntry` document with that ID, subject to the authorization rules in Requirement 5.2.
4. WHEN an authenticated user sends `PATCH /api/v1/schedule/:id` with a body containing `startAt` and/or `endAt`, THE `Schedule_API` SHALL update the entry and, if the entry has a `taskId`, update the linked `Task`'s `dueDate` as defined in Requirement 5.3.
5. WHEN an authenticated instructor or admin sends `POST /api/v1/schedule/custom` with a valid body, THE `Schedule_API` SHALL create a new `ScheduleEntry` with `entryType: "custom"`.
6. WHEN an authenticated user sends `DELETE /api/v1/schedule/:id`, THE `Schedule_API` SHALL soft-delete the `ScheduleEntry` as defined in Requirement 5.5.
7. IF a request to any schedule endpoint is made without a valid JWT, THEN THE `Schedule_API` SHALL return a 401 response.
8. IF a student sends a request to `POST /api/v1/schedule/custom`, THEN THE `Schedule_API` SHALL return a 403 response.

---

### Requirement 8: Schedule Series API Endpoints

**User Story:** As an instructor, I want REST API endpoints for schedule series, so that I can create and manage recurring session patterns from the UI.

#### Acceptance Criteria

1. WHEN an authenticated instructor or admin sends `POST /api/v1/schedule/series` with a valid body, THE `Schedule_API` SHALL create a `ScheduleSeries` and materialize its entries as defined in Requirement 6.1.
2. WHEN an authenticated user sends `GET /api/v1/schedule/series`, THE `Schedule_API` SHALL return all non-deleted `ScheduleSeries` documents scoped to the requesting user's context.
3. WHEN an authenticated user sends `GET /api/v1/schedule/series/:id`, THE `Schedule_API` SHALL return the single `ScheduleSeries` document with that ID.
4. WHEN an authenticated instructor or admin sends `PATCH /api/v1/schedule/series/:id` with an update payload, THE `Schedule_API` SHALL update the series and regenerate future entries as defined in Requirement 6.3.
5. WHEN an authenticated instructor or admin sends `DELETE /api/v1/schedule/series/:id`, THE `Schedule_API` SHALL soft-delete the series and all its future entries as defined in Requirement 6.4.
6. IF a student sends a `POST`, `PATCH`, or `DELETE` request to any `/api/v1/schedule/series` endpoint, THEN THE `Schedule_API` SHALL return a 403 response.

---

### Requirement 9: Reminder Cron Job

**User Story:** As a student or instructor, I want to receive in-app notifications before scheduled entries, so that I am reminded of upcoming sessions and task deadlines.

#### Acceptance Criteria

1. THE `Scheduler` SHALL register a cron job that runs every 5 minutes and queries for `ScheduleEntry` documents where at least one reminder sub-document has `sentAt == null` and `now >= startAt - minutesBefore minutes`.
2. WHEN the reminder cron job finds a due reminder, THE `Scheduler` SHALL create a `Notification` document with `type: "schedule_reminder"`, `recipient` set to the student's `User` ID (resolved via `StudentProfile`), `title` set to the entry's `title`, and `message` describing the time until the entry starts.
3. WHEN the reminder cron job creates a `Notification`, THE `Scheduler` SHALL stamp the reminder sub-document's `sentAt` with the current timestamp and set `notificationId` to the new notification's `_id`.
4. IF the reminder cron job encounters an error processing a single entry, THEN THE `Scheduler` SHALL log the error and continue processing remaining entries without stopping the job.
5. THE `Scheduler` SHALL also send a reminder `Notification` to the `instructorId` user when a session-type entry reminder fires.

---

### Requirement 10: Series Materialization Cron Job

**User Story:** As a developer, I want a daily cron job that extends the materialized horizon for all active series, so that the calendar always shows entries at least 12 weeks into the future.

#### Acceptance Criteria

1. THE `Scheduler` SHALL register a cron job that runs daily at midnight (UTC) and queries for all non-deleted `ScheduleSeries` documents where `materializedUntil < now + 12 weeks`.
2. WHEN the materialization cron job finds a series that needs extending, THE `Scheduler` SHALL call `materializeSeriesService` to generate new `ScheduleEntry` documents from `materializedUntil` up to `now + 12 weeks` and update `materializedUntil` on the series.
3. IF the materialization cron job encounters an error processing a single series, THEN THE `Scheduler` SHALL log the error and continue processing remaining series without stopping the job.

---

### Requirement 11: Notification Type Enum Extension

**User Story:** As a developer, I want the `Notification` model's `type` enum to include schedule-related values, so that schedule notifications can be stored and categorized correctly.

#### Acceptance Criteria

1. THE `Notification` model SHALL include `"schedule_reminder"`, `"schedule_updated"`, and `"new_schedule_entry"` in its `type` enum alongside the existing values.

---

### Requirement 12: Conflict Detection

**User Story:** As an instructor, I want the system to warn me when a new schedule entry overlaps with an existing one for the same student, so that I can avoid accidental double-booking.

#### Acceptance Criteria

1. WHEN `createCustomEntryService` or `createSeriesService` is called and a new entry's time range overlaps with an existing non-deleted `ScheduleEntry` for the same `studentProfileId`, THE `ScheduleEntry_Service` SHALL include a `conflicts` array in the response containing the overlapping entry IDs.
2. WHEN a conflict is detected, THE `ScheduleEntry_Service` SHALL still create the entry (warn-only policy) and return HTTP 201 with the `conflicts` array populated.

---

### Requirement 13: App.js Route Registration

**User Story:** As a developer, I want the schedule router mounted in `App.js`, so that all schedule endpoints are reachable under `/api/v1/schedule`.

#### Acceptance Criteria

1. THE `App` SHALL import `scheduleRouter` from `./Routes/ScheduleRouter.js` and mount it at `/api/v1/schedule`.
