import { Server } from "socket.io";
import { verifyAccessToken } from "./JwtHelper.js";

let io;

// Map userId (string) → Set of socket IDs so one user can have multiple tabs open
const userSockets = new Map();

export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(",")
        : ["http://localhost:5173", "http://127.0.0.1:5173"],
      credentials: true,
    },
  });

  io.use((socket, next) => {
    // Accept JWT from cookie or auth handshake header
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.split(" ")[1];

    if (!token) return next(new Error("Authentication required"));

    try {
      const payload = verifyAccessToken(token);
      socket.userId = payload.id.toString();
      socket.userRole = payload.role;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    const uid = socket.userId;

    if (!userSockets.has(uid)) userSockets.set(uid, new Set());
    userSockets.get(uid).add(socket.id);

    socket.join(`user:${uid}`);

    socket.on("disconnect", () => {
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
