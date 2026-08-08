import { Server } from "socket.io";
import { verifyAccessToken } from "./JwtHelper.js";
import User from "../Models/user.js";
import { isAccountApproved } from "../Services/AuthServices.js";

let io;

// Map userId (string) → Set of socket IDs so one user can have multiple tabs open
const userSockets = new Map();

/**
 * Socket.IO handshake authentication.
 *
 * Exported so it can be tested without standing up a real client: call it with
 * a stub socket and a next() spy.
 */
export const authenticateSocket = async (socket, next) => {
  // Handshake auth only. There is no cookie fallback — the browser client sends
  // the access token in socket.handshake.auth.token.
  const token = socket.handshake?.auth?.token || socket.handshake?.headers?.authorization?.split(" ")[1];

  if (!token) return next(new Error("Authentication required"));

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    return next(new Error("Invalid token"));
  }

  try {
    // A valid signature is not enough. The HTTP path (ProtectionService) reloads
    // the user and rechecks status on every request; the handshake has to do the
    // same. Without it, deactivating an account left that user's socket live and
    // still receiving their notifications until the token happened to expire.
    const user = await User.findById(payload.id).select("_id role isActive approvalStatus").lean();

    if (!user || !user.isActive || !isAccountApproved(user)) {
      return next(new Error("Account is not active"));
    }

    socket.userId = user._id.toString();
    // Role comes from the database, not the token: a role changed after the
    // token was issued must not stay in effect for the socket's lifetime.
    socket.userRole = user.role;
    socket.tokenExpiresAt = typeof payload.exp === "number" ? payload.exp * 1000 : null;
    return next();
  } catch {
    return next(new Error("Authentication failed"));
  }
};

export const initSocket = (httpServer) => {
  const corsOriginEnv = process.env.CORS_ORIGIN || process.env.ALLOWED_ORIGINS;
  const allowedOrigins = corsOriginEnv
    ? corsOriginEnv
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
    : ["http://localhost:5173", "http://127.0.0.1:5173"];

  io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
  });

  io.use(authenticateSocket);

  io.on("connection", (socket) => {
    const uid = socket.userId;

    if (!userSockets.has(uid)) userSockets.set(uid, new Set());
    userSockets.get(uid).add(socket.id);

    socket.join(`user:${uid}`);

    // Socket.IO authenticates once, at the handshake. Without this the
    // connection outlived its access token indefinitely — a socket opened once
    // stayed authorised for as long as it stayed connected. Drop it at expiry
    // and let the client reconnect with a refreshed token.
    let expiryTimer = null;
    if (socket.tokenExpiresAt) {
      const msUntilExpiry = socket.tokenExpiresAt - Date.now();
      if (msUntilExpiry <= 0) {
        socket.disconnect(true);
        return;
      }
      expiryTimer = setTimeout(() => socket.disconnect(true), msUntilExpiry);
      expiryTimer.unref?.();
    }

    socket.on("disconnect", () => {
      if (expiryTimer) clearTimeout(expiryTimer);

      const sockets = userSockets.get(uid);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) userSockets.delete(uid);
      }
    });
  });

  return io;
};

/**
 * Emit a notification event to a specific user.
 * Safe to call even before socket server is initialised (no-op).
 */
export const emitToUser = (userId, event, payload) => {
  if (!io) return;
  io.to(`user:${userId.toString()}`).emit(event, payload);
};

/**
 * Emit a notification to all connected users (broadcast).
 */
export const emitToAll = (event, payload) => {
  if (!io) return;
  io.emit(event, payload);
};

export const getIo = () => io;
