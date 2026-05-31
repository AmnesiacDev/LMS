# Backend Changes — What the Frontend Needs to Know

Companion to `FRONTEND_INTEGRATION.md`. This file is the **delta**: only what changed in this round of backend work that may affect the client.

Legend:
- 🚨 **Breaking** — existing frontend code likely needs an update.
- ➕ **New capability** — frontend can do something it couldn't before.
- 🐛 **Better error UX** — same endpoint, cleaner / more accurate responses.
- 🔒 **Internal hardening** — no client-visible change, listed for awareness.

---

## 🚨 Breaking changes (act on these)

### 1. Submission list endpoints are now staff-only

| Endpoint | Before | After |
|---|---|---|
| `GET /api/v1/submission/` | any logged-in user → all submissions in DB (leak!) | **admin / instructor only** — students get `403` |
| `GET /api/v1/submission/task/:taskId` | any logged-in user | **admin / instructor only** — students get `403` |

**Action:** any student/parent screens that hit these must switch to the `/me*` family:
- `GET /api/v1/submission/me`
- `GET /api/v1/submission/me/stats`
- `GET /api/v1/submission/me/:id`

### 2. Submission per-student endpoints are now ownership-gated

| Endpoint | Who can call it now |
|---|---|
| `GET /api/v1/submission/:id` | admin: all · instructor: own students · parent: own children · student: own only |
| `GET /api/v1/submission/student/:studentId` | same |
| `GET /api/v1/submission/student/:studentId/stats` | same |
| `GET /api/v1/submission/student/:studentId/due-buckets` | same |

Anyone else hitting another student's ID now gets **`404` (not 403)** — this is intentional, to prevent ID enumeration.

**Action:** treat 404 on these endpoints as "not available to this user" — don't assume the resource doesn't exist. Don't let a student client call `/student/:someoneElsesId`; route own-data through `/me*`.

### 3. Transcript download is now ownership-gated

`GET /api/v1/StudentProfile/:id/transcript.pdf`

| Caller | Before | After |
|---|---|---|
| Admin | any transcript | any transcript |
| Instructor | any transcript | only students they teach |
| Parent | **any transcript** (bug) | only their own children |
| Student | not allowed | not allowed |

Same 404-on-mismatch behavior. **Action:** don't expose a "download any transcript" UI for parents — only their own children.

### 4. Parents lost write access on exams

The role gate on `/api/v1/exam/*` changed from `("admin", "instructor", "parent")` to `("admin", "instructor")`. So as a **parent**, these now return `403`:
- `POST /api/v1/exam/`
- `GET /api/v1/exam/`
- `GET /api/v1/exam/:id`
- `GET /api/v1/exam/:id/student`
- `PATCH /api/v1/exam/:id`
- `DELETE /api/v1/exam/:id`

**Action:** parent UI must read exams via `/api/v1/exam/my-exams` and `/api/v1/exam/my-exams/:id` only.

### 5. Student profile create has stricter rules

`POST /api/v1/StudentProfile/:id` (where `:id` is the **user-id** of the student to attach the profile to)

- Student → must equal their own user-id. Anything else → `403`.
- Parent → the `parents` array you send is **ignored**; it's force-set to `[your_own_id]`. (You can't slip in third-party parents anymore.)
- Admin → unrestricted.
- If a profile already exists for that user → `409 "This user already has a Student profile"` (was previously a 500 or silent duplicate).

### 6. Student profile update is now field-whitelisted

`PATCH /api/v1/StudentProfile/:id` (where `:id` is the **profile-id**)

- Student/parent must own the profile; otherwise `404`.
- Whitelisted writable fields:
  - `grade` ✓ (any allowed role)
  - `notes` ✓ (any allowed role)
  - `parents` ✓ **admin only** — student/parent attempts to set this are silently dropped.
- Sending `user`, `attendanceStreak`, `longestStreak`, etc. is ignored (was always blocked by Joi, but the service now defends in depth).
- If your body only contains non-writable fields → `400 "No updatable fields provided!"`.

**Action:** if any "edit profile" form lets students/parents change `parents`, hide that field (it'll silently no-op).

### 7. Impersonation tokens are now 15 minutes (not regular access token lifetime)

`POST /api/v1/auth/impersonate/:userId` returns a token with:
- 15-minute expiry (was using `JWT_TOKEN_EXPIRES_IN`, typically longer)
- A new `impersonator` claim and `imp: true` flag inside the JWT (decode if you want to display it)

**Action:**
- Be prepared to redirect the admin back to their own session more often.
- Optionally decode the JWT (it's just base64) to surface "you're impersonating" in the UI without an extra API call.

### 8. The `/uploads/*` static route is removed

`GET /uploads/<anything>` used to serve files from a local folder. It now `404`s. Nothing in the app currently writes there, but if any old image URL was hardcoded against this path, it'll break. Files now live on Cloudinary; use the `url` returned in the submission's `fileAttachments[]`.

---

## ➕ New capabilities

### 9. Students can now delete their own submission files

`DELETE /api/v1/submission/:id/files?publicId=submissions/<publicId>`

Was previously instructor/admin only (route was placed below the role gate by mistake). Now available to:
- The owning **student** (must match the submission's `studentProfileId`)
- The submission's instructor or any admin

Returns the updated submission. **Action:** wire a "remove attachment" button into the student submission UI if it makes sense.

### 10. `req.user.isImpersonating` flag (server-side; not directly client-visible)

If you receive an impersonation token and call `/api/v1/auth/me` (or any authed route), the server now knows it's impersonated. Future endpoints may emit an `X-Impersonated: true` header or include it in audit metadata — keep an eye out.

---

## 🐛 Better error UX (no action needed, just nicer)

### 11. Production errors actually work

The production error path had a `const error = ...; error = ...` reassignment that crashed before any error response was sent. So in prod, certain server errors used to manifest as a hung request or a generic crash. Now you get the JSON error envelope reliably:

```json
{ "status": "fail" | "error", "message": "..." }
```

### 12. Multer file-too-large is now a clean 400

Uploading a file >10 MB used to return `500 "Something went wrong"`. Now:

```json
{ "status": "fail", "message": "File too large. Maximum size is 10 MB." }
```
HTTP `400`. Surface the message to the user verbatim.

Other multer error codes now also map cleanly:
- `LIMIT_FILE_COUNT` → `"Too many files uploaded."`
- `LIMIT_UNEXPECTED_FILE` → `"Unexpected file field \"<name>\". Use the \"files\" field for uploads."`

### 13. Unsupported file types no longer disappear

Multer's filter used to silently drop files whose MIME types weren't allowed (PDF + ZIP → only PDF stored, no warning). Now you get:

```json
{ "status": "fail", "message": "Unsupported file type: application/zip" }
```
HTTP `400`. **Action:** validate MIME on the client first if you want a faster UX, but the server is now honest about rejecting.

### 14. Duplicate-key errors format correctly

`PATCH /:id` with a duplicate unique field (e.g. `Email`) used to throw an internal `TypeError` (reading `err.KeyValue` instead of `err.keyValue`). Now you get the expected 400:

```json
{ "status": "fail", "message": "Duplicated value <value> for this key <field> , Please use another value" }
```

### 15. `NODE_ENV` is now case-insensitive

If anyone deploys with `NODE_ENV=Production` (capital P), error responses now correctly use the production path instead of leaking stack traces. No frontend action — just noting it for ops.

---

## 🔒 Internal hardening (no frontend change)

These changed but the client surface is the same. Listed only so you're not surprised when reading commit messages.

| Change | What it means |
|---|---|
| `app.set("trust proxy", 1)` added | `req.ip` and rate limiting now work correctly behind Render/Fly/Nginx. |
| Rate limiter, helmet, body parser unchanged | Same constraints as before (1000 req / 15 min per IP global, 10 / 15 min per email for login). |
| Refresh token expiry now parsed with `ms()` | `JWT_REFRESH_EXPIRES_IN=2h` now actually means 2 hours; previously `parseInt("2h")` treated it as 2 days. JWT exp claim and DB token expiry now agree. |
| Default refresh expiry unified to `7d` | Was `9d` in one place, `9` (days) in another. |
| Logging default | Stdout only. Disk logs only when `LOG_TO_DISK=true`. |
| DB connection | `serverSelectionTimeoutMS`, `socketTimeoutMS`, `maxPoolSize` set. Pool size configurable via `MONGO_POOL_SIZE` env. |
| Scheduler | Now only registers cron jobs on PM2 worker 0. Prevents duplicate emails/notifications in cluster mode. |
| `getStudentProfileService` | Already had ownership gating (`canAccessStudentProfile`); now exported for reuse in transcript controller and submission services. |

---

## Quick "what does the frontend need to do?" checklist

- [ ] Any student/parent UI calling `GET /api/v1/submission/`, `GET /api/v1/submission/task/:taskId`, `GET /api/v1/submission/student/:id*`, or `GET /api/v1/submission/:id` for cross-student data must move to `/me*`.
- [ ] Any parent UI calling exam writes or `GET /api/v1/exam/` should move to `/api/v1/exam/my-exams*`.
- [ ] Treat `404` on submission/profile/transcript reads as "not yours" — don't show a confusing "deleted" message.
- [ ] If you let parents edit the `parents` array on a profile, remove that input — it's silently ignored.
- [ ] If you handle file-upload errors, surface the `message` field directly to users; multer errors are now informative.
- [ ] If you use impersonation, expect to re-impersonate after 15 minutes.
- [ ] Drop any hard-coded URLs that start with `/uploads/`.

---

## Files modified on the backend (for context only)

- `App.js` — trust proxy, NODE_ENV normalization, log-to-disk gating, removed dead `/uploads` mount
- `Configs/DbConfig.js` — connection-pool + timeout tuning
- `Middleware/GlobalErrorHandler.js` — production crash fix, duplicate-key fix, multer mapping, case-insensitive env
- `Routes/SubmissionRouter.js` — staff-only on bulk reads, file routes promoted above role gate, multer filter throws instead of silently dropping
- `Routes/StudentProfileRouter.js` — (no change in this round)
- `Routes/ExamRouter.js` — parent removed from `restrictedToController` for the write block
- `Services/AuthServices.js` — `ms()` for refresh expiry, impersonation marker, `req.user.isImpersonating`
- `Services/SubmissionServices.js` — ownership gates on per-student + by-id reads, ownership in delete-file flow
- `Services/studentProfileServices.js` — create/update IDOR fixes; `canAccessStudentProfile` now exported
- `Controllers/SubmissionController.js` — passes `req.user` through to the four newly gated services
- `Controllers/StudentprofileController.js` — transcript ownership check, passes `req.user` on create/update
- `Utilities/JwtHelper.js` — `signImpersonationToken()` + default expiry alignment
- `Utilities/scheduler.js` — early-return on PM2 workers ≠ 0
- `package.json` — added `ms` direct dep
