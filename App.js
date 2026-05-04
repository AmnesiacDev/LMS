import express from "express";
import path from "path";
import fs from "fs";
import cookieParser from "cookie-parser";
import { fileURLToPath } from "url";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cors from "cors";
import compression from "compression";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";
import swaggerSpec from "./swagger.config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import GlobalErrorHandler from "./Middleware/GlobalErrorHandler.js";
import AppErrorHelper from "./Utilities/AppErrorHelper.js";
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

const app = express();

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
    hsts: process.env.NODE_ENV === "production" ? {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    } : false,
  })
);

// ─── 2. CORS Configuration ──────────────────────────────────────────────────────
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(",")
      : ["http://localhost:5173", "http://127.0.0.1:5173"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    exposedHeaders: ["Content-Length", "X-Total-Count"],
    maxAge: 86400, // 24 hours
    optionsSuccessStatus: 200,
  })
);

// ─── 3. General API Rate Limiter ───────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Increased default to prevent quick lockouts in general
  message: "Too many requests from this IP, please try again after 15 minutes.",
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV?.toLowerCase() === "development" || req.path === "/api/v1/health" || req.path === "/api-docs",
});
app.use("/api", apiLimiter);

// Helper function to extract client IP address
const getClientIp = (req) => {
  return (req.headers["x-forwarded-for"]?.split(",")[0].trim()) ||
    req.ip ||
    req.socket?.remoteAddress ||
    "unknown";
};

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 10 attempts per 15 minutes
  message: "Too many authentication attempts, please try again after 15 minutes.",
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === "development",
  keyGenerator: (req) => {
    // Use email for login, IP for signup to limit per account
    if (req.body?.email) {
      return `login:${req.body.email}`;
    }
    return `signup:${getClientIp(req)}`;
  },
});
app.use("/api/v1/auth/login", authLimiter);
app.use("/api/v1/auth/signup", authLimiter);

// ─── 5. Development Logging ───────────────────────────────────────────────────
// Ensure logs directory exists
if (!fs.existsSync("logs")) {
  fs.mkdirSync("logs", { recursive: true });
}

// Create write streams for different log files
const accessLogStream = fs.createWriteStream(path.join("logs", "access.log"), {
  flags: "a",
});

const authLogStream = fs.createWriteStream(path.join("logs", "auth.log"), {
  flags: "a",
});

// Log all requests to access.log
app.use(morgan("combined", { stream: accessLogStream }));

// Log auth requests to separate auth.log
app.use("/api/v1/auth/login", morgan("combined", { stream: authLogStream }));
app.use("/api/v1/auth/signup", morgan("combined", { stream: authLogStream }));

// Console logging for development
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// ─── 6. Body Parsers ───────────────────────────────────────────────────────────
app.use(express.json({
  limit: "10kb",
  verify: (req, res, buf) => {
    try {
      JSON.parse(buf);
    } catch (e) {
      throw new AppErrorHelper("Invalid JSON in request body", 400);
    }
  }
}));
app.use(express.urlencoded({ extended: true, limit: "10kb", parameterLimit: 20 }));
app.use(cookieParser());

// ─── 7. NoSQL Injection Sanitization ───────────────────────────────────────────
const sanitizeValue = (obj) => {
  if (obj && typeof obj === "object") {
    for (const key of Object.keys(obj)) {
      if (key.startsWith("$") || key.includes(".")) {
        delete obj[key];
      } else {
        sanitizeValue(obj[key]); // recurse into nested objects
      }
    }
  }
};

app.use((req, res, next) => {
  sanitizeValue(req.body);
  sanitizeValue(req.params);
  sanitizeValue(req.query);
  next();
});

// ─── 8. Compression ─────────────────────────────────────────────────────────────
app.use(compression());

// ─── 9. Static Files (with security) ───────────────────────────────────────────
app.use("/uploads", express.static("uploads", {
  maxAge: "1h",
  etag: true,
  immutable: false,
}));

// ─── 10. Swagger Documentation ────────────────────────────────────────────────
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customCss: ".swagger-ui .topbar { display: none }",
    customSiteTitle: "LMS API Docs",
    customfavIcon: "/favicon.ico",
  })
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

// ─── 12. Health Check ──────────────────────────────────────────────────────────
app.get("/api/v1/health", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "Server is healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ─── 13. Routes ────────────────────────────────────────────────────────────────
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/user", userRouter);
app.use("/api/v1/StudentProfile", StudentProfileRouter);
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

// ─── 14. 404 Handler ────────────────────────────────────────────────────────────
app.all(/.*/, (req, res, next) => {
  next(new AppErrorHelper(`Can't find ${req.originalUrl} on this server!`, 404));
});

// ─── 15. Global Error Handler ─────────────────────────────────────────────────
app.use(GlobalErrorHandler);

export default app;
