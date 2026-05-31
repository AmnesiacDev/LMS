# Frontend Integration Guide

Everything a client (React/Vite, Next, mobile) needs to talk to this LMS backend.

---

## 1. Base URL & conventions

| Thing | Value |
|---|---|
| Base URL (dev) | `http://localhost:3000` |
| Base URL (prod) | whatever you set as the public domain |
| API prefix | `/api/v1` |
| Content type | `application/json` (or `multipart/form-data` for uploads) |
| Health check | `GET /api/v1/health` |
| OpenAPI docs | `GET /api-docs` (Swagger UI) |

All examples below assume `API_BASE = "http://localhost:3000"` or your deployed origin.

---

## 2. CORS & credentials

The backend reads `CORS_ORIGIN` (comma-separated list) and allows credentialed requests **only** from those origins. In dev it defaults to `http://localhost:5173` and `http://127.0.0.1:5173`.

**Every request from the frontend must use `credentials: "include"`** if you want cookies (access/refresh) to flow.

```js
// fetch
await fetch(`${API_BASE}/api/v1/auth/login`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});

// axios
import axios from "axios";
export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});
```

---

## 3. Authentication

### 3.1 Tokens — how they work

| Token | Default lifetime | Where it lives | Purpose |
|---|---|---|---|
| Access | 15 min (configurable via `JWT_TOKEN_EXPIRES_IN`) | `accessToken` HttpOnly cookie **and** returned in JSON body as `data.token` | Sent on every authed request |
| Refresh | 7 days (configurable via `JWT_REFRESH_EXPIRES_IN`) | `refreshToken` HttpOnly cookie only | Used to mint new access tokens |

Cookies are `HttpOnly`, `sameSite=none; secure=true` in HTTPS/prod and `sameSite=lax; secure=false` in plain-HTTP dev.

You can authenticate by either:
- **Cookies (recommended for web)** — set `credentials: "include"` and the browser handles the rest.
- **Bearer header (for mobile / non-browser clients)** — send `Authorization: Bearer <accessToken>`.

The server accepts whichever it finds first (`Authorization` header takes priority).

**Limits:** max 3 active sessions per user. When you log in a 4th time, the oldest session is revoked.

### 3.2 Sign up

```http
POST /api/v1/auth/signup
Content-Type: application/json

{
  "FullName": "Karem Atef",
  "UserName": "karemA",
  "Email":    "karem@test.com",
  "password": "MyStrongPass1!",
  "role":     "student",
  "avatar":   "https://..."        // optional
}
```

Response `201`:
```json
{ "status": "success", "message": "Account created. You are logged in.",
  "data": { "user": { ... }, "token": "<accessToken>" } }
```
Cookies `accessToken` + `refreshToken` are set automatically.

### 3.3 Log in

```http
POST /api/v1/auth/login
Content-Type: application/json

{ "email": "karem@test.com", "password": "MyStrongPass1!" }
```

Rate-limited: **10 attempts / 15 min per email** (and per IP for signup). On lockout you'll get `429`.

### 3.4 Refresh access token

```http
POST /api/v1/auth/refresh
```
The server reads `refreshToken` from the cookie. No body. On success it rotates *both* tokens (old refresh token is invalidated). If the refresh token is missing/expired/already used, response is `401` and the frontend should redirect to login.

### 3.5 Log out

```http
POST /api/v1/auth/logout
```
Deletes **all** refresh tokens for the user server-side. Frontend should then clear any in-memory state and redirect.

### 3.6 Forgot / reset password

```http
POST /api/v1/auth/forgot-password
{ "email": "karem@test.com" }
```
Always returns `200` (intentional, to prevent email enumeration). If the email exists, a reset link is emailed pointing to `${CLIENT_URL}/reset-password/<token>`.

```http
POST /api/v1/auth/reset-password/:token
{ "password": "NewStrongPass1!" }
```
On success, **all existing sessions for that user are invalidated**.

### 3.7 Verify email

```http
GET /api/v1/auth/verify-email/:token
```

### 3.8 Impersonation (admin only)

```http
POST /api/v1/auth/impersonate/:userId
Authorization: Bearer <ADMIN_ACCESS_TOKEN>
```
Returns a **15-minute** access token for the target user with an `impersonator` claim baked in. Frontend rules:
- Store the impersonation token **separately** from the admin's own session — don't overwrite it.
- Show a persistent "Impersonating <name> — exit" banner.
- "Stop impersonating" simply discards the token client-side and re-uses the admin's original session.

The token includes `{ id, role, impersonator: <adminId>, imp: true }` and the server's `req.user` will have `user.isImpersonating === true` so audit/RBAC can react.

### 3.9 Parent API key (parents only)

```http
POST /api/v1/auth/api-key
Authorization: Bearer <PARENT_TOKEN>
```
Returns `{ apiKey: "lms_<hex>" }` — **shown only once**. Use to authenticate webhook/script clients.

---

## 4. Standard response shapes

### Success
```json
{ "status": "success", "data": { ... }, "message": "..." }
```
- `data` shape varies per endpoint.
- `result` (a number) is added on list endpoints.

### Error
Production:
```json
{ "status": "fail" | "error", "message": "Human-readable" }
```
Development additionally includes `stack` and a debug `error` object.

### Status codes you'll see

| Code | Meaning | What the frontend should do |
|---|---|---|
| `400` | Validation / bad input / file too large / unsupported MIME | Show the message to the user |
| `401` | Not logged in or access token expired | Try refresh once, then redirect to login |
| `403` | Wrong role for this route | Hide the action from this user's UI |
| `404` | Not found *or* you don't have access to it (intentional — prevents ID enumeration) | Treat as "not available" |
| `409` | Duplicate (e.g. profile already exists, duplicate email) | Show conflict message |
| `429` | Rate limited | Show "try again in N minutes" |
| `500` | Server error | Generic error toast |

### Recommended auto-refresh pattern

```js
api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry && !original.url.includes("/auth/")) {
      original._retry = true;
      try {
        await api.post("/api/v1/auth/refresh");  // cookie-driven
        return api(original);                     // replay
      } catch {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);
```

---

## 5. File uploads

The only file-upload endpoint right now is on submissions, but the rules apply if you add more:

| Constraint | Value |
|---|---|
| Field name | **must be `files`** literally |
| Max files / request | 5 |
| Max size / file | 10 MB |
| Allowed MIME | `image/jpeg|png|gif|webp`, `application/pdf`, `video/*` |

```js
const fd = new FormData();
files.forEach((f) => fd.append("files", f));

await fetch(`${API_BASE}/api/v1/submission/${submissionId}/files`, {
  method: "POST",
  credentials: "include",
  headers: { Authorization: `Bearer ${accessToken}` },
  // ⚠️ Do NOT set Content-Type — the browser writes the multipart boundary itself
  body: fd,
});
```

Server uploads each file's buffer directly to Cloudinary; nothing touches local disk. The response contains the full updated `submission` with its `fileAttachments[]` array.

Delete a file:
```http
DELETE /api/v1/submission/:id/files?publicId=submissions/<the-public-id>
```

---

## 6. Endpoints reference

> Roles in parens = allowed callers. Ownership is then enforced inside the service when relevant.

### 6.1 Auth
```
POST   /api/v1/auth/signup                     (public)
POST   /api/v1/auth/login                      (public, rate-limited)
POST   /api/v1/auth/refresh                    (cookie)
POST   /api/v1/auth/logout                     (any)
POST   /api/v1/auth/forgot-password            (public)
POST   /api/v1/auth/reset-password/:token      (public)
GET    /api/v1/auth/verify-email/:token        (public)
POST   /api/v1/auth/impersonate/:userId        (admin)
POST   /api/v1/auth/api-key                    (parent)
```

### 6.2 Users (admin only)
```
GET    /api/v1/user                            (admin)
GET    /api/v1/user/:id                        (admin)
PATCH  /api/v1/user/:id                        (admin)
DELETE /api/v1/user/:id                        (admin)
```

### 6.3 Student profiles
```
GET    /api/v1/StudentProfile/me               (student, parent)
GET    /api/v1/StudentProfile/me/:id           (student, parent)   # a parent's child by user-id
GET    /api/v1/StudentProfile/all              (admin, instructor)
GET    /api/v1/StudentProfile/:id              (any) — ownership-gated in service
GET    /api/v1/StudentProfile/:id/transcript.pdf (admin, instructor, parent) — ownership-gated
POST   /api/v1/StudentProfile/:id              (parent, student, admin) — see notes
PATCH  /api/v1/StudentProfile/:id              (parent, student, admin) — whitelisted fields only
```
- `POST /:id` — `:id` is the **user-id** to attach the profile to. A student can only create their own. A parent can onboard any student-role user but the `parents` array is force-set to `[themselves]`. Admin can do anything.
- `PATCH /:id` — `:id` is the **profile-id**. Student/parent can change `grade` and `notes`. Only admin can change `parents`.

### 6.4 Sessions
```
GET  /api/v1/session/me                                  (student, parent, instructor)
GET  /api/v1/session/me/:id                              (student, parent, instructor)
GET  /api/v1/session/me/calendar.ics                     (student, parent, instructor)
GET  /api/v1/session/me/students                         (instructor, admin)
GET  /api/v1/session/parent/:studentProfileId            (parent)
GET  /api/v1/session/                                    (admin, instructor)
GET  /api/v1/session/student/:id                         (admin, instructor)
GET  /api/v1/session/instructor/:id                      (admin, instructor)
GET  /api/v1/session/:id                                 (admin, instructor)
POST   /api/v1/session/                                  (admin, instructor)
PATCH  /api/v1/session/:id                               (admin, instructor)
DELETE /api/v1/session/:id                               (admin)
```

### 6.5 Tasks
```
GET  /api/v1/task/me                       (student, parent)
GET  /api/v1/task/me/stats                 (student, parent)
GET  /api/v1/task/me/:id                   (student, parent)
GET  /api/v1/task/student/:id              (admin, instructor)
GET  /api/v1/task/student/:id/stats        (admin, instructor)
GET  /api/v1/task/session/:id              (admin, instructor)
GET  /api/v1/task/                         (admin, instructor)
GET  /api/v1/task/:id                      (admin, instructor)
POST   /api/v1/task                         (admin, instructor)
PATCH  /api/v1/task/:id                     (admin, instructor)
DELETE /api/v1/task/:id                     (admin, instructor)
```

### 6.6 Submissions
```
GET  /api/v1/submission/me                                  (any logged-in — student sees own)
GET  /api/v1/submission/me/stats                            (any logged-in)
GET  /api/v1/submission/me/:id                              (any logged-in)
GET  /api/v1/submission/                                    (admin, instructor)        # bulk
GET  /api/v1/submission/task/:taskId                        (admin, instructor)
GET  /api/v1/submission/student/:studentId                  (ownership-gated)
GET  /api/v1/submission/student/:studentId/stats            (ownership-gated)
GET  /api/v1/submission/student/:studentId/due-buckets      (ownership-gated)
GET  /api/v1/submission/:id                                 (ownership-gated)
POST   /api/v1/submission/                                  (any logged-in — student must own)
PATCH  /api/v1/submission/:id/submit                        (any logged-in — student must own)
POST   /api/v1/submission/:id/files                         (any logged-in — student must own)
DELETE /api/v1/submission/:id/files?publicId=...            (any logged-in — student must own)
PATCH  /api/v1/submission/:id                               (admin, instructor)
PATCH  /api/v1/submission/:id/status                        (admin, instructor)
PATCH  /api/v1/submission/:id/review                        (admin, instructor)
DELETE /api/v1/submission/:id                               (admin, instructor)
```
"Ownership-gated" = admin sees all, instructor only their students, parent only their children, student only themselves; everyone else gets `404`.

### 6.7 Session reviews
```
GET  /api/v1/sessionReview/student/:id        (admin, instructor)
GET  /api/v1/sessionReview/:id                (admin, instructor)
GET  /api/v1/sessionReview/                   (admin, instructor)
POST   /api/v1/sessionReview                  (admin, instructor)
PATCH  /api/v1/sessionReview/:id              (admin, instructor)
DELETE /api/v1/sessionReview/:id              (admin, instructor)
```

### 6.8 External courses
```
GET  /api/v1/external-course/my-course        (student, parent)
GET  /api/v1/external-course/my-course/:id    (student, parent)
GET  /api/v1/external-course/                 (admin, instructor, parent)
GET  /api/v1/external-course/:id              (admin, instructor, parent)
POST   / PATCH  / DELETE  /api/v1/external-course[/...]   (admin, instructor, parent)
```

### 6.9 External-course homework
Same shape as external-course under `/api/v1/external-hw`.

### 6.10 Exams
```
GET  /api/v1/exam/my-exams           (student, parent)
GET  /api/v1/exam/my-exams/:id       (student, parent)
GET  /api/v1/exam/                   (admin, instructor)
GET  /api/v1/exam/:id                (admin, instructor)
GET  /api/v1/exam/:id/student        (admin, instructor)
POST   /api/v1/exam                  (admin, instructor)
PATCH  /api/v1/exam/:id              (admin, instructor)
DELETE /api/v1/exam/:id              (admin, instructor)
```

### 6.11 Progress trends
```
GET /api/v1/progress/me                            (student, parent)
GET /api/v1/progress/me/reviews                    (student, parent)
GET /api/v1/progress/me/tasks                      (student, parent)
GET /api/v1/progress/me/submissions                (student, parent)
GET /api/v1/progress/me/exams                      (student, parent)
GET /api/v1/progress/me/attendance                 (student, parent)
GET /api/v1/progress/compare-children              (parent)
GET /api/v1/progress/parent/:profileId/dashboard   (parent, admin, instructor)
```

### 6.12 Messages
```
GET  /api/v1/messages/conversations              (any logged-in)
GET  /api/v1/messages/:otherUserId               (any logged-in)
POST   /api/v1/messages                          (any logged-in)
PATCH  /api/v1/messages/:senderId/read           (any logged-in)
```

### 6.13 Notifications
```
GET    /api/v1/notifications/                    (any logged-in — own only)
GET    /api/v1/notifications/unread-count        (any logged-in)
PATCH  /api/v1/notifications/:id/read            (any logged-in)
PATCH  /api/v1/notifications/read-all            (any logged-in)
```

### 6.14 Announcements
```
GET    /api/v1/announcements/             (any logged-in)
GET    /api/v1/announcements/:id          (any logged-in)
POST   /api/v1/announcements              (admin, instructor)
PATCH  /api/v1/announcements/:id          (admin, instructor)
DELETE /api/v1/announcements/:id          (admin, instructor)
```

### 6.15 Audit logs (admin only)
```
GET /api/v1/audit-logs/   (admin)
```

---

## 7. Real-time (Socket.IO)

Connect *with* your access token (server requires it on handshake):

```js
import { io } from "socket.io-client";

export const socket = io(API_BASE, {
  withCredentials: true,
  auth: { token: accessToken },              // primary
  // OR  extraHeaders: { Authorization: `Bearer ${accessToken}` },
  autoConnect: false,
});

socket.connect();

socket.on("connect_error", (err) => {
  // err.message === "Authentication required" or "Invalid token"
});
```

Each connected client is auto-joined to room `user:<theirUserId>`. Server emits per-user events using `emitToUser(userId, event, payload)`. Subscribe like:

```js
socket.on("notification", (n) => { /* show toast, bump badge */ });
socket.on("message",      (m) => { /* update chat list */ });
```

When a user logs out or refreshes a stale token, reconnect with the new token.

---

## 8. Filtering, sorting, pagination

List endpoints accept these query params (`ApiFeatures` helper):

| Param | Effect | Example |
|---|---|---|
| `page` | Page number (1-based) | `?page=2` |
| `limit` | Page size | `?limit=20` |
| `sort` | Comma-separated fields, prefix `-` for desc | `?sort=-createdAt,FullName` |
| `fields` | Project specific fields | `?fields=Email,FullName` |
| Any model field | Filter equality | `?status=Pending` |
| `<field>[gt|gte|lt|lte]` | Comparison | `?dueDate[gte]=2026-01-01` |

---

## 9. Role-based UI hints

| UI surface | Show for |
|---|---|
| Admin panel, impersonation, user CRUD, audit logs | `admin` |
| Create/edit tasks, sessions, exams, reviews; instructor dashboard | `admin`, `instructor` |
| "My children" view, parent dashboard, generate API key | `parent` |
| "My tasks", "My submissions", "My progress" | `student`, `parent` |

`user.role` is returned on login. Cache it in your app state. Don't trust it for security — the backend re-enforces on every request.

---

## 10. Environment template for the frontend

```env
# Vite example
VITE_API_BASE=http://localhost:3000
VITE_SOCKET_URL=http://localhost:3000
```

In production:
```env
VITE_API_BASE=https://api.your-domain.com
VITE_SOCKET_URL=https://api.your-domain.com
```

---

## 11. Common gotchas

1. **`Content-Type` on uploads** — never set it manually for `FormData`. Browser sets `multipart/form-data; boundary=...` itself.
2. **Cookies not flowing** — you forgot `credentials: "include"` on fetch / `withCredentials: true` on axios. The backend also requires the calling origin to be in `CORS_ORIGIN`.
3. **`404` on a route you *think* should work** — could mean the URL/method is wrong (e.g. `GET /submission/:id/files` doesn't exist — it's `POST` for upload, `DELETE` for delete), or it could mean "you don't own that resource" (the backend uses `404` instead of `403` on ownership mismatches to prevent ID enumeration).
4. **Rate-limited on login** — 10 attempts per 15 min per email. Show the user a cooldown message; don't burn them retrying.
5. **`/me*` is the right path for "my own" data** — never read `/student/:myId` from a student client. The `/me` endpoints have no role-leak risk.
6. **Refresh after profile reset** — `POST /auth/reset-password/:token` invalidates *all* sessions. The user will need to log in again.
7. **Cookies on different domains** — if the frontend is on `app.example.com` and the API is on `api.example.com`, both must be served over HTTPS in production for cookies to work (`secure: true`, `sameSite: "none"`).
8. **Sockets stop receiving events** — likely the JWT expired. Reconnect with a fresh access token.

---

## 12. Quickstart snippet (React + Axios + Zustand-style auth)

```js
// api.js
import axios from "axios";
export const api = axios.create({ baseURL: import.meta.env.VITE_API_BASE, withCredentials: true });

let accessToken = null;
export const setAccessToken = (t) => (accessToken = t);
api.interceptors.request.use((cfg) => {
  if (accessToken) cfg.headers.Authorization = `Bearer ${accessToken}`;
  return cfg;
});
api.interceptors.response.use(
  (r) => r,
  async (err) => {
    if (err.response?.status === 401 && !err.config._retry && !err.config.url.includes("/auth/")) {
      err.config._retry = true;
      const { data } = await api.post("/api/v1/auth/refresh");
      setAccessToken(data?.data?.token);
      return api(err.config);
    }
    return Promise.reject(err);
  },
);

// auth.js
export async function login(email, password) {
  const { data } = await api.post("/api/v1/auth/login", { email, password });
  setAccessToken(data.data.token);
  return data.data.user;
}

export async function logout() {
  await api.post("/api/v1/auth/logout");
  setAccessToken(null);
}
```

That should be everything you need. If you hit a 4xx you don't understand, the server's `message` field is the source of truth.
