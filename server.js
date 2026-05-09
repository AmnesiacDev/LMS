import "dotenv/config";
import http from "http";
import mongoose from "mongoose";
import app from "./App.js";
import Db_Connection from "./Configs/DbConfig.js";
import { validateEnv } from "./Configs/validateEnv.js";
import { initSocket } from "./Utilities/SocketManager.js";
import { startScheduler } from "./Utilities/scheduler.js";

const PortNumber = process.env.PORT;

// ─── Graceful shutdown ────────────────────────────────────────────────────────
// Stops accepting new requests, waits for in-flight ones, then closes the DB.
// Called on SIGTERM (PaaS redeploy), SIGINT (Ctrl+C), and unhandled errors.
const gracefulShutdown = (server, signal, exitCode = 0) => {
  console.log(`\n${signal} received — shutting down gracefully`);
  server.close(async () => {
    try {
      await mongoose.connection.close();
      console.log("MongoDB connection closed");
    } catch (err) {
      console.error("Error closing MongoDB connection", err.message);
    } finally {
      process.exit(exitCode);
    }
  });

  // Force-exit if graceful shutdown takes too long (e.g. stalled DB query)
  setTimeout(() => {
    console.error("Graceful shutdown timed out — forcing exit");
    process.exit(1);
  }, 10_000).unref();
};

// Must be registered before anything else so sync throws are caught
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION — shutting down");
  console.error(err.name, err.message, err.stack);
  // Server may not be up yet; exit directly
  process.exit(1);
});

async function StartServer() {
  try {
    validateEnv();

    await Db_Connection();

    // Wrap app in an HTTP server so Socket.IO and Express share the same port
    const server = http.createServer(app);
    initSocket(server);
    startScheduler();

    server.listen(PortNumber, () => {
      console.log(`Server is running on port ${PortNumber}`);
    });

    process.on("unhandledRejection", (err) => {
      console.error("UNHANDLED REJECTION — shutting down");
      console.error(err.name, err.message);
      gracefulShutdown(server, "unhandledRejection", 1);
    });

    // Sent by PaaS hosts (Render, Fly, etc.) on redeploy or scale-down
    process.on("SIGTERM", () => gracefulShutdown(server, "SIGTERM", 0));

    // Sent when the user presses Ctrl+C in development
    process.on("SIGINT",  () => gracefulShutdown(server, "SIGINT",  0));

  } catch (error) {
    console.error("Failed to start the server", error);
    process.exit(1);
  }
}

StartServer();
