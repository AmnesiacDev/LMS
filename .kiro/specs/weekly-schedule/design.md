# Design Document — Weekly Schedule Feature

## Overview

The Weekly Schedule feature adds a calendar/timetable layer to the LMS. It introduces two new Mongoose models (`ScheduleEntry` and `ScheduleSeries`), post-save hooks on the existing `Session` and `Task` models, a service + controller + router layer, and two new cron jobs. The `ScheduleEntry` document is the single source of truth for every calendar block; sessions and tasks keep their linked entries in sync automatically through hooks.

---

## Components and Interfaces

See the detailed breakdown in the sections below — Models, Services, Controllers, and Routes each form a distinct component. The interfaces between them are plain async function calls following the existing project pattern.

---

## Architecture

The feature follows the existing project pattern:

```
Models → Services → Controllers → Routes
```

All new files are ES modules (`import`/`export`). Controllers use `CatchAsync`. Errors use `AppErrorHelper(message, statusCode)`. Auth uses `protectionController` + `restrictedToController` from `AuthController.js`. Soft-delete uses a `deletedAt` field with a pre-find hook.

---

## Files to Create / Modify

| # | File | Action |
|---|------|--------|
| 1 | `Models/ScheduleEntry.js` | Create — new model |
| 2 | `Models/ScheduleSeries.js` | Create — new model |
| 3 | `Models/Session.js` | Modify — add post-save hooks only |
| 4 | `Models/Task.js` | Modify — add post-save hooks only |
| 5 | `Models/Notification.js` | Modify — extend `type` enum |
| 6 | `Services/scheduleEntryService.js` | Create — new service |
| 7 | `Services/scheduleSeriesService.js` | Create — new service |
| 8 | `Controllers/ScheduleController.js` | Create — new controller |
| 9 | `Routes/ScheduleRouter.js` | Create — new router |
| 10 | `App.js` | Modify — import + mount `scheduleRouter` |
| 11 | `Utilities/scheduler.js` | Modify — add 2 new cron jobs |

---

## Data Models

### 1. `Models/ScheduleEntry.js`

The authoritative calendar document. Created automatically by Session/Task hooks or manually via the custom-entry endpoint.

**Schema fields:**

| Field | Type | Notes |
|-------|------|-------|
| `studentProfileId` | ObjectId ref `StudentProfile` | required |
| `instructorId` | ObjectId ref `User` | required |
| `entryType` | String enum `["session","task_due","custom"]` | required |
| `sessionId` | ObjectId ref `Session` | optional |
| `taskId` | ObjectId ref `Task` | optional |
| `title` | String | required |
| `subject` | String | optional |
| `color` | String | optional |
| `notes` | String | optional |
| `startAt` | Date | required |
| `endAt` | Date | required |
| `timezone` | String | default `"UTC"` |
| `allDay` | Boolean | default `false` |
| `seriesId` | ObjectId ref `ScheduleSeries` | optional |
| `isException` | Boolean | default `false` |
| `reminders` | Array of reminder sub-docs | see below |
| `status` | String enum `["scheduled","completed","canceled","rescheduled"]` | default `"scheduled"` |
| `deletedAt` | Date | default `null` |
| `timestamps` | Mongoose auto | `createdAt`, `updatedAt` |

**Reminder sub-document fields:**

| Field | Type | Notes |
|-------|------|-------|
| `minutesBefore` | Number | required |
| `sentAt` | Date | default `null` |
| `notificationId` | ObjectId ref `Notification` | optional |

**Validation:**
- Pre-validate hook enforces `endAt > startAt`. Throws `AppErrorHelper("endAt must be after startAt", 400)`.

**Soft-delete hook:**
```js
scheduleEntrySchema.pre(/^find/, function () {
  if (!this.getOptions().withDeleted) {
    this.find({ deletedAt: null });
  }
});
```

**Indexes:**
```js
scheduleEntrySchema.index({ studentProfileId: 1, startAt: 1 });
scheduleEntrySchema.index({ instructorId: 1, startAt: 1 });
scheduleEntrySchema.index({ taskId: 1 });
scheduleEntrySchema.index({ sessionId: 1 });
scheduleEntrySchema.index({ seriesId: 1, startAt: 1 });
```

---

### 2. `Models/ScheduleSeries.js`

Stores the recurrence rule for a repeating session pattern. Individual occurrences are materialized as `ScheduleEntry` documents.

**Schema fields:**

| Field | Type | Notes |
|-------|------|-------|
| `studentProfileId` | ObjectId ref `StudentProfile` | required |
| `instructorId` | ObjectId ref `User` | required |
| `templateTitle` | String | required |
| `subject` | String | optional |
| `frequency` | String enum `["weekly","biweekly"]` | required |
| `daysOfWeek` | `[Number]` | integers 0–6 (0 = Sunday) |
| `startTime` | String | required, e.g. `"08:00"` |
| `durationMin` | Number | required, session length in minutes |
| `startsOn` | Date | required |
| `endsOn` | Date | optional |
| `exceptions` | `[Date]` | dates to skip during materialization |
| `materializedUntil` | Date | optional, tracks horizon |
| `deletedAt` | Date | default `null` |
| `timestamps` | Mongoose auto | `createdAt`, `updatedAt` |

**Soft-delete hook** (same pattern as `ScheduleEntry`):
```js
scheduleSeriesSchema.pre(/^find/, function () {
  if (!this.getOptions().withDeleted) {
    this.find({ deletedAt: null });
  }
});
```

---

### 3. `Models/Session.js` — Post-Save Hooks (additions only)

Do **not** rewrite the file. Append four post-save hooks after the existing pre-save hook.

`ScheduleEntry` is imported lazily inside each hook to avoid circular dependency issues.

**Hook logic:**

```
post-save (async):
  const ScheduleEntry = (await import('./ScheduleEntry.js')).default;

  if (this.isNew:
    → ScheduleEntry.create({
        entryType: "session",
        sessionId: this._id,
        studentProfileId: this.studentProfileId,
        instructorId: this.instructorId,
        title: this.title,
        startAt: this.date,
        endAt: new Date(this.date.getTime() + 60 * 60 * 1000),
        reminders: [
          { minutesBefore: 60, sentAt: null },
          { minutesBefore: 1440, sentAt: null },
        ],
      })

  else if this.isModified('date'):
    → ScheduleEntry.findOneAndUpdate(
        { sessionId: this._id },
        { startAt: this.date, endAt: date + 60 min }
      )

  else if this.isModified('status'):
    → ScheduleEntry.findOneAndUpdate(
        { sessionId: this._id },
        { status: this.status }
      )

  else if this.isModified('deletedAt') && this.deletedAt:
    → ScheduleEntry.findOneAndUpdate(
        { sessionId: this._id },
        { deletedAt: new Date() }
      )

  catch (err):
    console.error('[Session hook] ScheduleEntry sync failed:', err.message)
    // never throw — session save must not be rolled back
```

---

### 4. `Models/Task.js` — Post-Save Hooks (additions only)

Same pattern as Session hooks. Append after the existing pre-find hooks.

**Hook logic:**

```
post-save (async):
  const ScheduleEntry = (await import('./ScheduleEntry.js')).default;

  if this.isNew:
    → ScheduleEntry.create({
        entryType: "task_due",
        taskId: this._id,
        studentProfileId: this.studentProfileId,
        instructorId: this.instructorId,
        title: this.title,
        startAt: new Date(this.dueDate.getTime() - 30 * 60 * 1000),
        endAt: this.dueDate,
        reminders: [{ minutesBefore: 1440, sentAt: null }],
      })

  else if this.isModified('dueDate'):
    → ScheduleEntry.findOneAndUpdate(
        { taskId: this._id },
        {
          startAt: new Date(this.dueDate.getTime() - 30 * 60 * 1000),
          endAt: this.dueDate,
        }
      )

  else if this.isModified('status'):
    → ScheduleEntry.findOneAndUpdate(
        { taskId: this._id },
        { status: this.status }
      )

  else if this.isModified('deletedAt') && this.deletedAt:
    → ScheduleEntry.findOneAndUpdate(
        { taskId: this._id },
        { deletedAt: new Date() }
      )

  catch (err):
    console.error('[Task hook] ScheduleEntry sync failed:', err.message)
    // never throw
```

---

### 5. `Models/Notification.js` — Enum Extension

Add three values to the existing `type` enum. The final enum becomes:

```js
enum: [
  "new_message",
  "new_task",
  "task_graded",
  "new_session",
  "session_review",
  "exam_result",
  "system_alert",
  "schedule_reminder",   // ← new
  "schedule_updated",    // ← new
  "new_schedule_entry",  // ← new
]
```

---

## Service Layer

### 6. `Services/scheduleEntryService.js`

Imports: `ScheduleEntry`, `Task`, `StudentProfile`, `AppErrorHelper`, `ApiFeatures`.

#### `getEntriesService(user, startDate, endDate)`

Builds a role-scoped query for entries where `startAt >= startDate` and `startAt <= endDate`:

- `student` → resolve `StudentProfile` by `user._id`, filter by `studentProfileId`
- `parent` → find all `StudentProfile` docs where `parents` contains `user._id`, filter by `studentProfileId: { $in: [...] }`
- `instructor` → filter by `instructorId: user._id`
- `admin` → no additional filter

Returns array of `ScheduleEntry` documents.

#### `getWeekEntriesService(user)`

Computes the current week's Monday 00:00:00 UTC and Sunday 23:59:59 UTC, then delegates to `getEntriesService`.

```
const now = new Date();
const day = now.getUTCDay(); // 0=Sun, 1=Mon, ...
const diffToMonday = (day === 0 ? -6 : 1 - day);
const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diffToMonday));
const sunday = new Date(monday.getTime() + 6 * 24 * 60 * 60 * 1000 + 23 * 3600000 + 59 * 60000 + 59000);
```

#### `getEntryByIdService(user, entryId)`

- `findById(entryId)` — throws 404 if not found
- Authorization check: student must own the entry, instructor must be the entry's instructor, parent must have the student as a child, admin always allowed
- Throws 403 `AppErrorHelper` if unauthorized

#### `updateEntryService(entryId, payload)`

- `findByIdAndUpdate(entryId, payload, { new: true, runValidators: true })`
- If `payload.endAt` is present and the entry has a `taskId`, also call `Task.findByIdAndUpdate(entry.taskId, { dueDate: payload.endAt })`
- Returns updated entry

#### `createCustomEntryService(payload)`

- Validates `entryType === "custom"` (throws 400 otherwise)
- Detects conflicts: query for non-deleted entries where `studentProfileId` matches and time ranges overlap:
  ```
  { studentProfileId, deletedAt: null, startAt: { $lt: endAt }, endAt: { $gt: startAt } }
  ```
- Creates the entry with `ScheduleEntry.create(payload)`
- Returns `{ entry, conflicts: [conflictingEntryIds] }`

#### `softDeleteEntryService(entryId)`

- `findByIdAndUpdate(entryId, { deletedAt: new Date() }, { new: true })`
- Throws 404 if not found

---

### 7. `Services/scheduleSeriesService.js`

Imports: `ScheduleSeries`, `ScheduleEntry`, `StudentProfile`, `AppErrorHelper`.

#### `createSeriesService(payload)`

1. Create `ScheduleSeries` document from payload
2. Compute horizon: `new Date(Date.now() + 12 * 7 * 24 * 60 * 60 * 1000)`
3. Call `materializeSeriesService(series, series.startsOn, horizon)`
4. Update `series.materializedUntil = horizon` and save
5. Return series

#### `materializeSeriesService(series, fromDate, toDate)`

Generates `ScheduleEntry` documents for all occurrences of the series between `fromDate` and `toDate`:

1. Parse `series.startTime` (e.g. `"08:00"`) into hours and minutes
2. Iterate day-by-day from `fromDate` to `toDate`
3. For each day, check if `day.getUTCDay()` is in `series.daysOfWeek`
4. If `series.frequency === "biweekly"`, skip alternate weeks using week-number parity relative to `series.startsOn`
5. Skip dates present in `series.exceptions` (compare by date string `YYYY-MM-DD`)
6. Skip dates after `series.endsOn` if set
7. For each qualifying date, build a `ScheduleEntry`:
   ```js
   {
     studentProfileId: series.studentProfileId,
     instructorId: series.instructorId,
     entryType: "session",
     seriesId: series._id,
     title: series.templateTitle,
     subject: series.subject,
     startAt: <date at startTime UTC>,
     endAt: <startAt + durationMin minutes>,
     reminders: [{ minutesBefore: 60 }, { minutesBefore: 1440 }],
   }
   ```
8. Bulk-insert with `ScheduleEntry.insertMany(entries, { ordered: false })`
9. Return count of created entries

#### `updateSeriesService(seriesId, payload)`

1. `findByIdAndUpdate(seriesId, payload, { new: true })`
2. Delete all future entries: `ScheduleEntry.updateMany({ seriesId, startAt: { $gt: now } }, { deletedAt: now })`
3. Re-materialize from `now` to `now + 12 weeks`
4. Update `series.materializedUntil` and save
5. Return updated series

#### `softDeleteSeriesService(seriesId)`

1. `ScheduleSeries.findByIdAndUpdate(seriesId, { deletedAt: new Date() })`
2. `ScheduleEntry.updateMany({ seriesId, startAt: { $gt: new Date() } }, { deletedAt: new Date() })`
3. Throws 404 if series not found

#### `getSeriesForUserService(user)`

- `instructor` → `ScheduleSeries.find({ instructorId: user._id })`
- `student` → resolve `StudentProfile`, then `ScheduleSeries.find({ studentProfileId: profile._id })`
- `admin` → `ScheduleSeries.find({})`
- Throws 403 for other roles

---

## Controller Layer

### 8. `Controllers/ScheduleController.js`

All functions use `CatchAsync`. Imports from both services.

| Controller | Method | Path | Service call |
|------------|--------|------|--------------|
| `getEntriesController` | GET | `/` | `getEntriesService(req.user, req.query.startDate, req.query.endDate)` |
| `getWeekEntriesController` | GET | `/week` | `getWeekEntriesService(req.user)` |
| `getEntryByIdController` | GET | `/:id` | `getEntryByIdService(req.user, req.params.id)` |
| `updateEntryController` | PATCH | `/:id` | `updateEntryService(req.params.id, req.body)` |
| `createCustomEntryController` | POST | `/custom` | `createCustomEntryService(req.body)` → 201 |
| `softDeleteEntryController` | DELETE | `/:id` | `softDeleteEntryService(req.params.id)` → 200 |
| `createSeriesController` | POST | `/series` | `createSeriesService(req.body)` → 201 |
| `getSeriesController` | GET | `/series` | `getSeriesForUserService(req.user)` |
| `getSeriesByIdController` | GET | `/series/:id` | `ScheduleSeries.findById(req.params.id)` |
| `updateSeriesController` | PATCH | `/series/:id` | `updateSeriesService(req.params.id, req.body)` |
| `deleteSeriesController` | DELETE | `/series/:id` | `softDeleteSeriesService(req.params.id)` → 200 |

**Response envelope** (consistent with existing controllers):
```js
res.status(200).json({ status: "success", data: { entry } });
res.status(201).json({ status: "success", data: { entry, conflicts } }); // custom entry
```

---

## Router Layer

### 9. `Routes/ScheduleRouter.js`

```
router.use(protectionController)   // all routes require valid JWT

// ── Read-only routes (all authenticated roles) ──────────────────────────────
GET  /                → getEntriesController
GET  /week            → getWeekEntriesController
GET  /series          → getSeriesController
GET  /series/:id      → getSeriesByIdController
GET  /:id             → getEntryByIdController

// ── Instructor + admin only ─────────────────────────────────────────────────
POST   /custom        → restrictedToController("instructor","admin"), createCustomEntryController
PATCH  /:id           → restrictedToController("instructor","admin"), updateEntryController
DELETE /:id           → restrictedToController("instructor","admin"), softDeleteEntryController

POST   /series        → restrictedToController("instructor","admin"), createSeriesController
PATCH  /series/:id    → restrictedToController("instructor","admin"), updateSeriesController
DELETE /series/:id    → restrictedToController("instructor","admin"), deleteSeriesController
```

> Note: `/series` routes must be declared before `/:id` to avoid Express matching `series` as an `:id` param.

---

## App.js Modification

Add one import and one `app.use` call in the routes section:

```js
// import (alongside existing router imports)
import scheduleRouter from "./Routes/ScheduleRouter.js";

// mount (in section 12 — Routes)
app.use("/api/v1/schedule", scheduleRouter);
```

---

## Cron Jobs — `Utilities/scheduler.js`

Two new jobs are appended inside the existing `startScheduler()` function.

### Cron Job 1 — Reminder Dispatcher (`*/5 * * * *`)

Runs every 5 minutes. Finds entries with unsent reminders that are now due.

**Query:**
```js
const now = new Date();
ScheduleEntry.find({
  deletedAt: null,
  "reminders.sentAt": null,
  startAt: { $gt: now }, // entry hasn't started yet
})
```

**Per-entry processing:**
1. For each reminder where `sentAt == null` and `now >= startAt - minutesBefore * 60000`:
   - Resolve student `User._id` via `StudentProfile.findById(entry.studentProfileId)`
   - Create `Notification` with:
     - `type: "schedule_reminder"`
     - `recipient`: student's `User._id`
     - `title`: entry's `title`
     - `message`: e.g. `"Reminder: '${entry.title}' starts in ${minutesBefore} minutes"`
   - If `entry.entryType === "session"`, also create a second `Notification` for `entry.instructorId`
   - Stamp `reminder.sentAt = now` and `reminder.notificationId = notification._id`
2. Save the entry with updated reminders
3. Catch per-entry errors, log, and continue

### Cron Job 2 — Series Horizon Extender (`0 0 * * *`)

Runs daily at midnight UTC. Extends materialization for all active series.

**Query:**
```js
const horizon = new Date(Date.now() + 12 * 7 * 24 * 60 * 60 * 1000);
ScheduleSeries.find({
  deletedAt: null,
  $or: [
    { materializedUntil: { $lt: horizon } },
    { materializedUntil: null },
  ],
})
```

**Per-series processing:**
1. Call `materializeSeriesService(series, series.materializedUntil ?? series.startsOn, horizon)`
2. Update `series.materializedUntil = horizon` and save
3. Catch per-series errors, log, and continue

---

## Error Handling

All service functions throw `AppErrorHelper(message, statusCode)` for expected failures (404 not found, 403 unauthorized, 400 bad input). Controllers wrap service calls with `CatchAsync`, which forwards thrown errors to the global error handler in `Middleware/GlobalErrorHandler.js`.

Post-save hooks on `Session` and `Task` are the exception: they catch errors internally and only `console.error`, never re-throw. This ensures a calendar sync failure never rolls back the primary model save.

Cron jobs follow the same pattern — per-item errors are caught and logged, and the job continues processing remaining items.

---

## Testing Strategy

Unit tests cover each service function with representative inputs, including edge cases (no entries in range, unauthorized user, missing linked document). Integration tests verify that creating a `Session` or `Task` produces the expected `ScheduleEntry`. Property-based tests cover the invariants listed in the Correctness Properties section below.

---

## Correctness Properties

### Property 1: endAt greater than startAt invariant
**Validates: Requirements 1.3**

For any `ScheduleEntry` document, `endAt` must always be strictly greater than `startAt`. This holds for entries created by Session hooks (endAt = startAt + 60 min), Task hooks (endAt = dueDate, startAt = dueDate - 30 min), custom entries (validated by pre-validate hook), and materialized series entries (endAt = startAt + durationMin).

### Property 2: Session hook creates exactly one linked entry
**Validates: Requirements 3.1**

For any newly created `Session`, exactly one `ScheduleEntry` with `sessionId === session._id` and `entryType === "session"` must exist after the post-save hook fires.

### Property 3: Task hook creates exactly one linked entry
**Validates: Requirements 4.1**

For any newly created `Task`, exactly one `ScheduleEntry` with `taskId === task._id` and `entryType === "task_due"` must exist after the post-save hook fires.

### Property 4: Soft-delete excludes from default queries
**Validates: Requirements 1.5, 2.2**

For any `ScheduleEntry` or `ScheduleSeries` with `deletedAt != null`, a default `find()` query (without `withDeleted: true`) must not return that document.

### Property 5: Materialization respects exceptions
**Validates: Requirements 6.6**

For any `ScheduleSeries` with a non-empty `exceptions` array, `materializeSeriesService` must not create a `ScheduleEntry` whose `startAt` date (YYYY-MM-DD) matches any date in `exceptions`.

### Property 6: Conflict detection is warn-only
**Validates: Requirements 12.2**

When `createCustomEntryService` detects overlapping entries, it must still create the new entry (HTTP 201) and return the `conflicts` array populated with the IDs of overlapping entries.

### Property 7: Role-scoped entry visibility
**Validates: Requirements 5.1**

A student must never receive entries belonging to a different student. An instructor must only receive entries where `instructorId` matches their own `_id`.

---

## Key Design Decisions

**Lazy import to avoid circular dependency.** `Session.js` and `Task.js` import `ScheduleEntry.js` inside the hook function body using dynamic `import()`. This prevents the circular reference that would occur if `ScheduleEntry.js` were imported at the top of the file (since `ScheduleEntry` references `Session` and `Task` via ObjectId refs).

**Hooks never throw.** All post-save hooks wrap their logic in try/catch and only `console.error` on failure. This ensures that a calendar sync failure never rolls back a session or task save — the primary operation always succeeds.

**Warn-only conflict detection.** Overlapping entries are reported in the response but do not block creation. This matches the product requirement (Requirement 12.2) and avoids false positives from legitimate back-to-back scheduling.

**Series entries are hard-deleted on update, then re-materialized.** When a series is updated, future entries are soft-deleted and new ones are generated from scratch. This is simpler and more correct than attempting to diff and patch individual entries.

**`/series` routes declared before `/:id`.** Express matches routes in declaration order. If `/:id` were declared first, `GET /series` would match with `id = "series"`. The router declares all `/series/*` routes before `/:id`.
