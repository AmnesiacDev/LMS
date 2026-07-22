import auditLog from "../Utilities/AuditLogger.js";

const modelMapping = {
  user: "User",
  studentprofile: "StudentProfile",
  session: "Session",
  task: "Task",
  submission: "Submission",
  sessionreview: "SessionReview",
  "external-course": "ExternalCourse",
  "external-hw": "ExternalHW",
  exam: "Exam",
  progress: "Progress",
  messages: "Message",
  notifications: "Notification",
  announcements: "Announcement",
  schedule: "ScheduleEntry",
  gamification: "Gamification",
  challenges: "Challenge",
  leaderboard: "Leaderboard",
  curriculum: "Curriculum",
};

/**
 * Deep clones and redacts sensitive keys from meta/request body.
 */
const sanitizeMeta = (obj) => {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeMeta);
  const newObj = {};
  for (const [key, value] of Object.entries(obj)) {
    if (
      /password/i.test(key) ||
      /token/i.test(key) ||
      /secret/i.test(key) ||
      /key/i.test(key) ||
      /cookie/i.test(key) ||
      /auth/i.test(key)
    ) {
      newObj[key] = "[REDACTED]";
    } else {
      newObj[key] = sanitizeMeta(value);
    }
  }
  return newObj;
};

export const auditLogMiddleware = (req, res, next) => {
  const stateModifyingMethods = ["POST", "PUT", "PATCH", "DELETE"];
  if (!stateModifyingMethods.includes(req.method)) {
    return next();
  }

  res.on("finish", async () => {
    // Only log successful operations (2xx status codes)
    if (res.statusCode >= 200 && res.statusCode < 300) {
      try {
        // Only log if the request is authenticated (protectionController has run)
        if (req.user) {
          const pathParts = req.originalUrl.split("?")[0].split("/").filter(Boolean);
          // Standard path pattern: ["api", "v1", "modelName", "id"]
          let targetModel = "Unknown";
          let targetId = null;

          if (pathParts.length > 2) {
            const modelKey = pathParts[2].toLowerCase();
            targetModel = modelMapping[modelKey] || (modelKey.charAt(0).toUpperCase() + modelKey.slice(1));

            // Extract ID if the 4th segment is a 24-character hexadecimal ObjectId
            if (pathParts.length > 3 && /^[0-9a-fA-F]{24}$/.test(pathParts[3])) {
              targetId = pathParts[3];
            }
          }

          // Format a descriptive action
          let action = `${req.method.toLowerCase()}_${targetModel.toLowerCase()}`;
          if (req.method === "POST") action = `create_${targetModel.toLowerCase()}`;
          else if (req.method === "PATCH" || req.method === "PUT") action = `update_${targetModel.toLowerCase()}`;
          else if (req.method === "DELETE") action = `delete_${targetModel.toLowerCase()}`;

          const ip = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.ip;

          // Build metadata object with path, query, and sanitized body
          const meta = {
            path: req.originalUrl,
          };
          if (Object.keys(req.query || {}).length > 0) {
            meta.query = sanitizeMeta(req.query);
          }
          if (req.method !== "DELETE" && Object.keys(req.body || {}).length > 0) {
            meta.body = sanitizeMeta(req.body);
          }

          await auditLog({
            actor: req.user._id,
            actorRole: req.user.role,
            action,
            targetModel,
            targetId,
            meta,
            ip,
          });
        }
      } catch (err) {
        console.error("[AuditLogMiddleware] Error writing audit log:", err.message);
      }
    }
  });

  next();
};
