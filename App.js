import express from "express";
import path from "path";
import fs from "fs";
import cookieParser from "cookie-parser";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import helmet from "helmet";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import cors from "cors";
import compression from "compression";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";
import swaggerSpec from "./swagger.config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import GlobalErrorHandler from "./Middleware/GlobalErrorHandler.js";
import AppErrorHelper from "./Utilities/AppErrorHelper.js";
import { auditLogMiddleware } from "./Middleware/auditLogMiddleware.js";
import authRouter from "./Routes/authRouts.js";
import userRouter from "./Routes/userRouts.js";
import StudentProfileRouter from "./Routes/StudentProfileRouter.js";
import SessionRouter from "./Routes/SessionRouter.js";
import TaskRouter from "./Routes/TaskRouter.js";
import SubmissionRouter from "./Routes/SubmissionRouter.js";
import SessionReviewRouter from "./Routes/SessionReviewRouter.js";
import ExternalCourseRouter from "./Routes/ExternalCourseRouter.js";
import externalHWRouter from "./Routes/ExternalCourseHwRouter.js";
import ExamRouter from "./Routes/ExamRouter.js";
import ProgressTrendsRouter from "./Routes/ProgressTrendsRouter.js";
import MessageRouter from "./Routes/MessageRouter.js";
import NotificationRouter from "./Routes/NotificationRouter.js";
import AnnouncementRouter from "./Routes/AnnouncementRouter.js";
import AuditLogRouter from "./Routes/AuditLogRouter.js";
import scheduleRouter from "./Routes/ScheduleRouter.js";
import GamificationRouter from "./Routes/GamificationRouter.js";
import ChallengeRouter from "./Routes/ChallengeRouter.js";
import LeaderboardRouter from "./Routes/LeaderboardRouter.js";
import CurriculumRouter from "./Routes/CurriculumRouter.js";
import StudentInstructorAssignmentRouter from "./Routes/StudentInstructorAssignmentRouter.js";
import ChannelRouter from "./Routes/ChannelRouter.js";
import SessionCanvasRouter from "./Routes/SessionCanvasRouter.js";
import { MAX_BODY_BYTES as CANVAS_MAX_BODY_BYTES } from "./Validation/sessionCanvasValidation.js";

const app = express();

// ApiFeatures expects bracket filters like date[gte] to arrive as nested
// objects, e.g. { date: { gte: ... } }.
app.set("query parser", "extended");

// Behind a PaaS/reverse proxy (Render, Fly, Heroku, Nginx), trust the first
// X-Forwarded-* hop so req.ip and express-rate-limit key on the real client IP.
app.set("trust proxy", Number(process.env.TRUST_PROXY ?? 1));

// Normalize NODE_ENV once so every check below is case-insensitive and consistent.
const NODE_ENV = (process.env.NODE_ENV || "development").toLowerCase();
const isProduction = NODE_ENV === "production";
const isDevelopment = NODE_ENV === "development";

const corsOriginEnv = process.env.CORS_ORIGIN || process.env.ALLOWED_ORIGINS;
const allowedOrigins = corsOriginEnv
  ? corsOriginEnv
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  : ["http://localhost:5173", "http://127.0.0.1:5173"];

// ─── 1. Security Headers (Enhanced Helmet) ──────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "blob:"],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: isProduction
      ? {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true,
        }
      : false,
  }),
);

// ─── 2. CORS Configuration ──────────────────────────────────────────────────────
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    exposedHeaders: ["Content-Length", "X-Total-Count"],
    maxAge: 86400, // 24 hours
    optionsSuccessStatus: 200,
  }),
);

// ─── 3. General API Rate Limiter ───────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Increased default to prevent quick lockouts in general
  message: "Too many requests from this IP, please try again after 15 minutes.",
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => isDevelopment || req.path === "/api/v1/health" || req.path === "/api-docs",
});
app.use("/api", apiLimiter);

// NOTE: the auth rate limiters live further down, after the body parsers.
// They key partly on req.body, which does not exist until express.json() runs.

// ─── 5. Request ID + Logging ──────────────────────────────────────────────────
// Attach a unique ID to every request so errors can be traced across log lines
app.use((req, _res, next) => {
  req.id = randomUUID();
  next();
});

// Default everything to stdout so the PaaS host (Render/Fly/etc.) aggregates logs.
// Disk logs vanish on every deploy on ephemeral hosts, so only touch the filesystem
// when explicitly opted in via LOG_TO_DISK=true (typically a long-lived VPS / PM2 box).
const logToDisk = process.env.LOG_TO_DISK === "true";

if (logToDisk) {
  if (!fs.existsSync("logs")) fs.mkdirSync("logs", { recursive: true });

  const accessLogStream = fs.createWriteStream(path.join("logs", "access.log"), { flags: "a" });
  const authLogStream = fs.createWriteStream(path.join("logs", "auth.log"), { flags: "a" });

  app.use(morgan("combined", { stream: accessLogStream }));
  app.use("/api/v1/auth/login", morgan("combined", { stream: authLogStream }));
  app.use("/api/v1/auth/signup", morgan("combined", { stream: authLogStream }));
}

// Always log to stdout (combined in prod, dev-friendly format locally).
app.use(morgan(isProduction ? "combined" : "dev"));

// ─── 6. Body Parsers ───────────────────────────────────────────────────────────
// Whiteboard scenes are whole JSON documents (every element plus any embedded
// images), so they cannot fit the 10kb budget the rest of the API uses. Mount a
// dedicated parser for that one path *before* the global one: body-parser sets
// req._body once it has consumed the stream, so the 10kb parser below sees the
// body is already parsed and skips it rather than rejecting an oversized scene.
// Joi still enforces the real per-field caps; this is only the outer envelope.
app.use(
  "/api/v1/session-canvas",
  express.json({
    limit: CANVAS_MAX_BODY_BYTES,
    verify: (req, res, buf) => {
      try {
        JSON.parse(buf);
      } catch (e) {
        throw new AppErrorHelper("Invalid JSON in request body", 400);
      }
    },
  }),
);

app.use(
  express.json({
    limit: "10kb",
    verify: (req, res, buf) => {
      try {
        JSON.parse(buf);
      } catch (e) {
        throw new AppErrorHelper("Invalid JSON in request body", 400);
      }
    },
  }),
);
app.use(express.urlencoded({ extended: true, limit: "10kb", parameterLimit: 20 }));
app.use(cookieParser());

// ─── 7. NoSQL Injection Sanitization ───────────────────────────────────────────
// Returns a new sanitized copy — never mutates the original object.
// In Express 5, req.query is a getter and direct mutation throws.
const sanitizeObject = (obj) => {
  if (!obj || typeof obj !== "object") return obj;
  // Preserve arrays — Object.fromEntries(Object.entries(arr)) silently turns
  // them into plain objects ({"0": item}), which breaks Mongoose subdocument
  // array casting (surfaces as "Path X is required" on required subfields).
  if (Array.isArray(obj)) return obj.map(sanitizeObject);
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([key]) => !key.startsWith("$") && !key.includes("."))
      .map(([key, val]) => [key, sanitizeObject(val)]),
  );
};

app.use((req, _res, next) => {
  if (req.body) req.body = sanitizeObject(req.body);
  if (req.params) req.params = sanitizeObject(req.params);
  // Express 5 exposes req.query as a getter, so assignment throws.
  // Define a request-local value instead of writing through the getter.
  Object.defineProperty(req, "query", {
    value: sanitizeObject(req.query ?? {}),
    configurable: true,
    enumerable: true,
    writable: true,
  });
  next();
});

// ─── 7.5. Global Audit Logging Middleware ────────────────────────────────────
app.use(auditLogMiddleware);

// ─── 7.6. Auth Rate Limiters ──────────────────────────────────────────────────
// Mounted here, NOT next to apiLimiter: express.json() has to have run first or
// req.body is undefined and the per-account key below silently degrades to a
// pure IP key — which is exactly the bypass this ordering fixes.

// Rate-limit keys must never come from a header the caller controls.
// app.set("trust proxy") above already resolves req.ip through the configured
// number of proxy hops; ipKeyGenerator normalises IPv6 to a /64 subnet so a
// single client cannot walk its own address space for fresh buckets.
const clientIpKey = (req) => ipKeyGenerator(req.ip ?? req.socket?.remoteAddress ?? "unknown");

// Joi lowercases Email/email, but validation runs inside the router — after
// this middleware. Normalise here too, otherwise rotating the case of an
// address ("Victim@x.com", "vIctim@x.com", ...) mints an unlimited number of
// distinct buckets for the same account.
const accountKey = (req, field) => {
  const raw = req.body?.[field];
  return typeof raw === "string" ? raw.trim().toLowerCase() : null;
};

const authLimiterDefaults = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  message: "Too many authentication attempts, please try again after 15 minutes.",
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isDevelopment,
};

// Login gets two independent buckets, and either one can trip:
//   - per account, so one victim cannot be sprayed from a botnet
//   - per source IP, so one host cannot spray many accounts
const loginAccountLimiter = rateLimit({
  ...authLimiterDefaults,
  max: 10,
  keyGenerator: (req) => `login:acct:${accountKey(req, "email") ?? clientIpKey(req)}`,
});
const loginIpLimiter = rateLimit({
  ...authLimiterDefaults,
  max: 30,
  keyGenerator: (req) => `login:ip:${clientIpKey(req)}`,
});
app.use("/api/v1/auth/login", loginAccountLimiter, loginIpLimiter);

// Signup has its own bucket. Sharing one with login let a burst of failed
// logins lock out registration and vice versa.
app.use(
  "/api/v1/auth/signup",
  rateLimit({
    ...authLimiterDefaults,
    max: 10,
    keyGenerator: (req) => `signup:${clientIpKey(req)}`,
  }),
);

// Password reset was not rate limited at all: /forgot-password is an unauthenticated
// email trigger (spam amplifier) and /reset-password/:token is a 64-hex-char guess.
app.use(
  "/api/v1/auth/forgot-password",
  rateLimit({
    ...authLimiterDefaults,
    max: 5,
    keyGenerator: (req) => `forgot:${accountKey(req, "email") ?? clientIpKey(req)}`,
  }),
);
app.use(
  "/api/v1/auth/reset-password",
  rateLimit({
    ...authLimiterDefaults,
    max: 10,
    keyGenerator: (req) => `reset:${clientIpKey(req)}`,
  }),
);

// ─── 8. Compression ─────────────────────────────────────────────────────────────
app.use(compression());

// ─── 9. Swagger Documentation ────────────────────────────────────────────────
// (File uploads go straight to Cloudinary via memoryStorage; no local /uploads mount.)
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customCss: ".swagger-ui .topbar { display: none }",
    customSiteTitle: "LMS API Docs",
    customfavIcon: "/favicon.ico",
  }),
);
app.get("/api-docs.json", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(swaggerSpec);
});

// ─── 11. Health Check ───────────────────────────────────────────────────────────
app.get("/api/v1/health", async (req, res) => {
  let dbStatus = "disconnected";
  try {
    const mongoose = (await import("mongoose")).default;
    const state = mongoose.connection.readyState;
    if (state === 1) dbStatus = "connected";
    else if (state === 2) dbStatus = "connecting";
    else if (state === 3) dbStatus = "disconnecting";
  } catch (e) {
    dbStatus = "error";
  }

  const status = dbStatus === "connected" ? "success" : "unhealthy";
  const httpCode = dbStatus === "connected" ? 200 : 503;

  res.status(httpCode).json({
    status,
    message: "Server is running",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: dbStatus,
  });
});

// ─── 12. Request Timeout Middleware ───────────────────────────────────────────
app.use((req, res, next) => {
  res.setTimeout(30000, () => {
    res.status(408).json({
      status: "error",
      message: "Request timeout",
    });
  });
  next();
});

// ─── 12. Routes ────────────────────────────────────────────────────────────────
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/user", userRouter);
app.use("/api/v1/StudentProfile", StudentProfileRouter);
app.use("/api/v1/studentprofile", StudentProfileRouter);
app.use("/api/v1/session", SessionRouter);
app.use("/api/v1/task", TaskRouter);
app.use("/api/v1/submission", SubmissionRouter);
app.use("/api/v1/sessionReview", SessionReviewRouter);
app.use("/api/v1/external-course", ExternalCourseRouter);
app.use("/api/v1/external-hw", externalHWRouter);
app.use("/api/v1/exam", ExamRouter);
app.use("/api/v1/progress", ProgressTrendsRouter);
app.use("/api/v1/messages", MessageRouter);
app.use("/api/v1/notifications", NotificationRouter);
app.use("/api/v1/announcements", AnnouncementRouter);
app.use("/api/v1/audit-logs", AuditLogRouter);
app.use("/api/v1/schedule", scheduleRouter);
app.use("/api/v1/gamification", GamificationRouter);
app.use("/api/v1/challenges", ChallengeRouter);
app.use("/api/v1/leaderboard", LeaderboardRouter);
app.use("/api/v1/curriculum", CurriculumRouter);
app.use("/api/v1/student-instructor-assignments", StudentInstructorAssignmentRouter);
app.use("/api/v1/channels", ChannelRouter);
app.use("/api/v1/session-canvas", SessionCanvasRouter);

// ─── 14. 404 Handler ────────────────────────────────────────────────────────────
app.all(/.*/, (req, res, next) => {
  next(new AppErrorHelper(`Can't find ${req.originalUrl} on this server!`, 404));
});

// ─── 15. Global Error Handler ─────────────────────────────────────────────────
app.use(GlobalErrorHandler);

export default app;
