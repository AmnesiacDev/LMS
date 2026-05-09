# Changelog

## [2.0.0] - 2026-05-09

### Overview

This release includes **19 bug fixes** and **15 new features** across the LMS backend, plus frontend alignment fixes. The changes span security hardening, new modules (announcements, audit logs), realtime notifications via Socket.IO, scheduled jobs, file uploads, PDF generation, and more.

---

## Bug Fixes (19)

### 1. Password Hashing on Update
- **File:** `Models/User.js`
- **Problem:** Updating a user's password via `findByIdAndUpdate` skipped the `pre('save')` hook, storing plaintext passwords.
- **Fix:** Added a `pre('findOneAndUpdate')` hook that hashes the password if `$set.password` is present in the update.

### 2. Token Refresh Endpoint
- **File:** `Controllers/AuthController.js`
- **Problem:** The refresh token endpoint didn't exist or returned malformed responses.
- **Fix:** Implemented `refreshTokenController` that reads the `refreshToken` cookie, verifies it, checks the Token model, and issues a new access token.

### 3. Email Verification Token Generation
- **File:** `Controllers/AuthController.js`
- **Problem:** Email verification used an incorrect token generation method that didn't match what was stored in the database.
- **Fix:** Used `crypto.randomBytes(32)` to generate the raw token, then SHA-256 hashed it before storing. The raw token is sent in the verification email URL, and on verification the incoming token is re-hashed and matched against the DB.

### 4. Soft-Delete Filtering on Queries
- **Files:** `Models/Session.js`, `Models/Task.js`, `Models/Submission.js`
- **Problem:** Soft-deleted documents (those with a `deletedAt` timestamp) were still returned in regular queries.
- **Fix:** Added `pre('find')` and `pre('findOne')` hooks that automatically inject `{ deletedAt: null }` into query conditions. A `withDeleted` option can bypass this filter when needed.

### 5. Calendar Export (ICS) Crash
- **File:** `Controllers/SessionController.js`
- **Problem:** The `ics` package v3 exports `createEvents`, but the code imported `createIcsCalendar` which doesn't exist, causing a runtime crash on `GET /session/me/calendar.ics`.
- **Fix:** Changed import from `import { createIcsCalendar } from "ics"` to `import { createEvents } from "ics"` and updated the function call accordingly.

### 6. Session Query Filtering
- **File:** `Services/sessionService.js`
- **Problem:** Query filters for sessions (by date, instructor, student) were not properly applied, returning unfiltered results.
- **Fix:** Updated the `getAllSessionsService` to properly parse and apply query parameters including date ranges, status filters, and population of related documents.

### 7. Task Status Validation
- **File:** `Services/taskService.js`
- **Problem:** Tasks could be set to invalid status values, causing inconsistent data.
- **Fix:** Added enum validation on status updates to only allow valid values: `pending`, `in-progress`, `completed`, `overdue`.

### 8. Submission Pagination
- **File:** `Services/SubmissionServices.js`
- **Problem:** Submission list endpoints returned all results without pagination support.
- **Fix:** Integrated the `APIFeatures` utility class for filtering, sorting, field selection, and pagination on submission queries.

### 9. Notification Read Status
- **File:** `Services/NotificationService.js`
- **Problem:** Marking notifications as read didn't properly update the `read` field.
- **Fix:** Fixed the update query to correctly set `read: true` and return the updated document.

### 10. Bulk Notification Operations
- **File:** `Controllers/NotificationController.js`
- **Problem:** Mark-all-as-read endpoint was missing or non-functional.
- **Fix:** Implemented `markAllAsReadController` that updates all unread notifications for the authenticated user in a single query.

### 11. Rate Limiting Configuration
- **File:** `App.js`
- **Problem:** Rate limiter was either missing or too permissive, leaving the API vulnerable to abuse.
- **Fix:** Configured `express-rate-limit` with appropriate windows and max requests per IP. Added a stricter limiter on auth endpoints.

### 12. CORS Configuration
- **File:** `App.js`
- **Problem:** CORS was configured with `origin: '*'` in production, which is insecure.
- **Fix:** Updated CORS to read allowed origins from `process.env.CORS_ORIGIN`, supporting comma-separated multiple origins, with `credentials: true` for cookie support.

### 13. Helmet Security Headers
- **File:** `App.js`
- **Problem:** Helmet was imported but not properly configured.
- **Fix:** Added `helmet()` middleware with appropriate CSP and other security header configurations.

### 14. Input Sanitization (NoSQL Injection)
- **File:** `App.js`
- **Problem:** The `sanitizeValue` function mutated `req.query` directly, which throws in Express 5 (getter-based `req.query`).
- **Fix:** Rewrote as `sanitizeObject()` that returns a new sanitized copy instead of mutating. Reassigns `req.body`, `req.params`, and `req.query` with sanitized copies.

### 15. Health Check Endpoint
- **File:** `App.js`
- **Problem:** The health check endpoint was removed or broken during refactoring.
- **Fix:** Moved health check into the router structure and ensured it returns proper status with uptime and timestamp.

### 16. Error Handler Response Format
- **File:** `Middleware/GlobalErrorHandler.js`
- **Problem:** Error responses were inconsistent between development and production modes.
- **Fix:** Standardized error response format with `status`, `message`, and conditional `stack` trace in development.

### 17. Cookie Parser Missing
- **File:** `App.js`
- **Problem:** `cookie-parser` was imported but not used as middleware, so refresh token cookies couldn't be read.
- **Fix:** Added `app.use(cookieParser())` to the middleware chain before auth routes.

### 18. Mongoose Population Errors
- **Files:** Various service files
- **Problem:** Some `.populate()` calls referenced fields that didn't exist on the schema, causing silent failures.
- **Fix:** Audited and corrected all populate paths to match actual schema field names and references.

### 19. Express 5 Compatibility
- **File:** `App.js`, various middleware
- **Problem:** Several patterns used Express 4 idioms that break in Express 5 (e.g., `req.query` mutation, error handler signatures).
- **Fix:** Updated all middleware to be Express 5 compatible, including error handlers using 4-argument signatures and immutable query objects.

---

## New Features (15)

### 1. Email Verification Flow
- **Files:** `Controllers/AuthController.js`, `Services/emailService.js`, `Models/User.js`
- **Description:** Students must verify their email before logging in. On signup, a verification email is sent with a unique token link. The token is hashed (SHA-256) and stored in the user document with an expiry. Clicking the link verifies the account and allows login.
- **Endpoints:**
  - `POST /api/v1/auth/signup` - Sends verification email for student role
  - `GET /api/v1/auth/verify-email/:token` - Verifies the email token
  - `POST /api/v1/auth/resend-verification` - Resends the verification email

### 2. Socket.IO Realtime Notifications
- **Files:** `Utilities/SocketManager.js`, `server.js`, `Services/NotificationService.js`
- **Description:** Integrated Socket.IO for realtime push notifications. When a notification is created in the database, it's simultaneously emitted to the recipient via WebSocket if they're connected.
- **Architecture:**
  - `initSocket(server)` initializes Socket.IO with JWT authentication middleware
  - `emitToUser(userId, event, data)` sends events to specific users
  - Clients connect with `io(url, { auth: { token } })` and listen for `notification` events
  - Users are tracked in a `Map<userId, Set<socketId>>` for multi-device support

### 3. iCalendar Export
- **File:** `Controllers/SessionController.js`
- **Description:** Students can export their upcoming sessions as an `.ics` calendar file for import into Google Calendar, Apple Calendar, Outlook, etc.
- **Endpoint:** `GET /api/v1/session/me/calendar.ics`
- **Details:** Uses the `ics` package (v3) `createEvents()` function. Returns `text/calendar` content type with proper event formatting including title, description, start/end times, and location.

### 4. Exam Analytics Summary
- **Files:** `Services/ProgressTrendsService.js`, `Controllers/ProgressTrendsController.js`, `Routes/ProgressTrendsRouter.js`
- **Description:** Provides aggregated exam performance data for a student, including average score, pass rate, weakest topics, topic breakdown, and score trend over time.
- **Endpoint:** `GET /api/v1/progress/student/:profileId/summary?lastN=10`
- **Response includes:**
  - `avgPercentage` - Average exam score as percentage
  - `passRate` - Percentage of exams passed
  - `weakestTopic` - Topic with lowest average score
  - `topicBreakdown` - Array of {topic, avgScore, count}
  - `scoreTrend` - Chronological array of {date, percentage}

### 5. Parent Dashboard
- **Files:** `Services/ProgressTrendsService.js`, `Controllers/ProgressTrendsController.js`, `Routes/ProgressTrendsRouter.js`
- **Description:** Consolidated dashboard for parents showing their child's key metrics in a single API call.
- **Endpoint:** `GET /api/v1/progress/parent/:profileId/dashboard`
- **Access:** Restricted to parent, admin, and instructor roles
- **Response includes:**
  - Student info (name, grade, enrollment date)
  - Attendance stats (total sessions, attended, streak)
  - Recent exam results (last 5)
  - Upcoming tasks (next 5 due)
  - Latest session review

### 6. Attendance Streak Tracking
- **Files:** `Services/studentProfileServices.js`, `Services/sessionService.js`, `Models/StudentProfile.js`
- **Description:** Automatically tracks consecutive attended sessions for each student. The streak counter updates whenever a session is created or its attendance status changes.
- **How it works:**
  - `recalculateAttendanceStreakService(studentProfileId)` queries sessions sorted newest-first
  - Counts consecutive sessions where `StudentAttended === true`
  - Updates both `attendanceStreak` (current) and `longestStreak` (all-time) on the student profile
  - Called automatically in `createSessionService` and `UpdateSessionByIdService`

### 7. File Uploads for Submissions (Cloudinary)
- **Files:** `Services/SubmissionServices.js`, `Controllers/SubmissionController.js`, `Routes/SubmissionRouter.js`, `Configs/cloudinary.js`
- **Description:** Students and instructors can upload files (images, PDFs, videos) to submissions. Files are stored in Cloudinary with automatic format detection.
- **Endpoints:**
  - `POST /api/v1/submission/:id/files` - Upload up to 5 files (10MB each)
  - `DELETE /api/v1/submission/:id/files?publicId=...` - Delete a specific file
- **Details:**
  - Uses `multer` with `memoryStorage` (no disk writes)
  - Buffers uploaded directly to Cloudinary via `uploadToCloudinary()`
  - Supports: JPEG, PNG, GIF, WebP, PDF, video formats
  - File metadata (URL, publicId, format, size) stored in submission's `fileAttachments` array

### 8. PDF Transcript Generation
- **Files:** `Controllers/StudentprofileController.js`, `Routes/StudentProfileRouter.js`
- **Description:** Generates a downloadable PDF transcript for any student, including personal info, attendance summary, exam results, and task completion stats.
- **Endpoint:** `GET /api/v1/StudentProfile/:id/transcript.pdf`
- **Access:** Restricted to admin, instructor, and parent roles
- **Details:**
  - Uses `pdfkit` to generate PDF in-memory
  - Streams directly to response (`doc.pipe(res)`)
  - Includes: student name, email, grade, enrollment date, attendance stats, exam scores table, task summary

### 9. Scheduled Jobs (Cron)
- **File:** `Utilities/scheduler.js`
- **Description:** Automated background tasks using `node-cron`.
- **Jobs:**
  | Schedule | Job | Description |
  |----------|-----|-------------|
  | Every hour | Auto-complete stale sessions | Marks pending sessions older than 2 hours as completed |
  | Daily 8:00 AM | Session reminders | Emails students about sessions in the next 24 hours |
  | Daily 9:00 AM | Task due reminders | Emails students about tasks due today |
  | Weekly Sunday 9:00 AM | Parent weekly summary | Emails parents a summary of their child's week |

### 10. Audit Logging
- **Files:** `Models/AuditLog.js`, `Utilities/AuditLogger.js`, `Controllers/AuditLogController.js`, `Routes/AuditLogRouter.js`
- **Description:** Tracks important actions (create, update, delete) across the system for accountability and debugging.
- **Endpoint:** `GET /api/v1/audit-logs` (admin only)
- **Logged data:** action type, target model, target ID, user who performed action, timestamp, before/after snapshots

### 11. Announcements Module
- **Files:** `Models/Announcement.js`, `Controllers/AnnouncementController.js`, `Routes/AnnouncementRouter.js`
- **Description:** Full CRUD for system-wide or targeted announcements from instructors/admins.
- **Endpoints:**
  - `GET /api/v1/announcements` - List all announcements
  - `POST /api/v1/announcements` - Create (instructor/admin)
  - `PATCH /api/v1/announcements/:id` - Update (instructor/admin)
  - `DELETE /api/v1/announcements/:id` - Delete (instructor/admin)

### 12. Cloudinary Configuration
- **File:** `Configs/cloudinary.js` (new)
- **Description:** Centralized Cloudinary setup with helper functions for upload and delete operations.
- **Exports:**
  - `uploadToCloudinary(buffer, folder, resourceType)` - Uploads a buffer and returns {url, publicId, format, bytes}
  - `deleteFromCloudinary(publicId)` - Deletes a resource by publicId
- **Environment variables:** `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`

### 13. Environment Validation
- **File:** `Configs/validateEnv.js` (new)
- **Description:** Validates all required environment variables on server startup, failing fast with clear error messages if any are missing.
- **Required variables checked:**
  - `PORT`, `MONGO_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`
  - `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRES_IN`
  - `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USERNAME`, `EMAIL_PASSWORD`, `EMAIL_FROM`
  - `CORS_ORIGIN`

### 14. HTTP Server + Socket.IO Wiring
- **File:** `server.js`
- **Description:** Refactored server startup to use `http.createServer(app)` instead of `app.listen()`, allowing Socket.IO and Express to share the same port.
- **Changes:**
  - `import http from "http"` and `import { initSocket } from "./Utilities/SocketManager.js"`
  - `const server = http.createServer(app)` wraps the Express app
  - `initSocket(server)` attaches Socket.IO before `server.listen()`
  - Graceful shutdown handles both HTTP and WebSocket connections

### 15. Route Wiring (Announcements + Audit Logs)
- **File:** `App.js`
- **Description:** Connected the new Announcement and AuditLog routers to the Express app.
- **Routes added:**
  - `app.use("/api/v1/announcements", AnnouncementRouter)`
  - `app.use("/api/v1/audit-logs", AuditLogRouter)`

---

## Frontend Alignment

Verified all **42 frontend API endpoints** match backend routes. Fixed one critical mismatch:

### Signup Flow (Email Verification)
- **Files:** `FrontEnd/src/context/AuthContext.jsx`, `FrontEnd/src/components/Auth/Auth.jsx`
- **Problem:** After adding email verification, the backend stopped returning a token for student signups. The frontend was navigating to the dashboard and getting bounced back.
- **Fix:**
  - `AuthContext.signup()` now returns `{ success, needsVerification, message }` instead of `true/false`
  - `Auth.jsx` checks `result.needsVerification` and shows a green verification banner instead of navigating
  - Verification message clears when toggling between login/signup modes

---

## New Environment Variables

Add these to your `.env` file:

```env
# JWT Refresh Tokens
JWT_REFRESH_SECRET=your-refresh-secret
JWT_REFRESH_EXPIRES_IN=7d

# Cloudinary (for file uploads)
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# CORS
CORS_ORIGIN=http://localhost:5173,http://localhost:3000

# Email
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USERNAME=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
EMAIL_FROM=your-email@gmail.com
```

---

## New Dependencies

```bash
npm install socket.io ics pdfkit cloudinary node-cron
```

| Package | Version | Purpose |
|---------|---------|---------|
| `socket.io` | ^4.x | Realtime WebSocket notifications |
| `ics` | ^3.x | iCalendar (.ics) file generation |
| `pdfkit` | ^0.13+ | PDF transcript generation |
| `cloudinary` | ^2.x | Cloud file storage for submissions |
| `node-cron` | ^3.x | Scheduled background jobs |

---

## API Endpoints (New)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/v1/auth/verify-email/:token` | Public | Verify email address |
| `POST` | `/api/v1/auth/resend-verification` | Public | Resend verification email |
| `POST` | `/api/v1/auth/refresh` | Cookie | Refresh access token |
| `GET` | `/api/v1/session/me/calendar.ics` | JWT | Export sessions as iCal |
| `GET` | `/api/v1/progress/student/:id/summary` | JWT | Exam analytics summary |
| `GET` | `/api/v1/progress/parent/:id/dashboard` | JWT (parent/admin) | Parent dashboard |
| `GET` | `/api/v1/StudentProfile/:id/transcript.pdf` | JWT (admin/instructor/parent) | PDF transcript |
| `POST` | `/api/v1/submission/:id/files` | JWT | Upload submission files |
| `DELETE` | `/api/v1/submission/:id/files?publicId=...` | JWT (admin/instructor) | Delete submission file |
| `GET` | `/api/v1/announcements` | JWT | List announcements |
| `POST` | `/api/v1/announcements` | JWT (instructor/admin) | Create announcement |
| `PATCH` | `/api/v1/announcements/:id` | JWT (instructor/admin) | Update announcement |
| `DELETE` | `/api/v1/announcements/:id` | JWT (instructor/admin) | Delete announcement |
| `GET` | `/api/v1/audit-logs` | JWT (admin) | List audit logs |

---

## Files Changed Summary

**42 files total** | **+2,803 additions** | **-212 deletions**

### New Files (8)
- `Configs/cloudinary.js` - Cloudinary upload/delete helpers
- `Configs/validateEnv.js` - Environment variable validation
- `Utilities/SocketManager.js` - Socket.IO initialization and user tracking
- `Utilities/scheduler.js` - Cron job scheduler
- `Utilities/AuditLogger.js` - Audit log creation helper
- `Models/AuditLog.js` - Audit log schema
- `Controllers/AuditLogController.js` - Audit log CRUD
- `Routes/AuditLogRouter.js` - Audit log routes

### Modified Files (34)
- `App.js` - Security middleware, route wiring, Express 5 fixes
- `server.js` - HTTP server, Socket.IO, scheduler integration
- `Controllers/AuthController.js` - Email verification, token refresh
- `Controllers/SessionController.js` - Calendar export fix
- `Controllers/SubmissionController.js` - File upload/delete controllers
- `Controllers/StudentprofileController.js` - PDF transcript
- `Controllers/ProgressTrendsController.js` - Analytics + parent dashboard
- `Controllers/NotificationController.js` - Bulk read operations
- `Models/User.js` - Password hash hook, verification fields
- `Models/Session.js` - Soft-delete hooks
- `Models/Task.js` - Soft-delete hooks
- `Models/Submission.js` - File attachments field, soft-delete
- `Models/StudentProfile.js` - Streak fields
- `Routes/SubmissionRouter.js` - File upload routes + multer
- `Routes/StudentProfileRouter.js` - Transcript route
- `Routes/ProgressTrendsRouter.js` - Analytics + dashboard routes
- `Services/SubmissionServices.js` - File upload/delete services
- `Services/sessionService.js` - Streak recalculation calls
- `Services/studentProfileServices.js` - Streak service
- `Services/ProgressTrendsService.js` - Analytics + dashboard services
- `Services/NotificationService.js` - Socket.IO emission
- `Services/emailService.js` - Verification email template
- ...and more
