import mongoose from "mongoose";

// Tuned for Atlas free tier (M0 = 100 total connections, easy to exhaust).
// maxPoolSize is per-process — keep it low so a PM2 cluster doesn't saturate Atlas.
// Override via env when you upgrade the cluster (M10+ has 1500 connections).
const DEFAULT_POOL    = parseInt(process.env.MONGO_POOL_SIZE      || "10", 10);
const DEFAULT_SELECT  = parseInt(process.env.MONGO_SELECT_TIMEOUT || "10000", 10);
const DEFAULT_SOCKET  = parseInt(process.env.MONGO_SOCKET_TIMEOUT || "45000", 10);

const Db_Connection = async () => {
  // Log lifecycle events so transient disconnects in prod are visible in the host log stream.
  // Registered once before connect() so the initial handshake events are captured too.
  mongoose.connection.on("disconnected", () => {
    console.warn("[Mongo] disconnected");
  });
  mongoose.connection.on("reconnected", () => {
    console.log("[Mongo] reconnected");
  });
  mongoose.connection.on("error", (err) => {
    console.error("[Mongo] connection error:", err.message);
  });

  try {
    await mongoose.connect(process.env.CONNECTION_STRING, {
      serverSelectionTimeoutMS: DEFAULT_SELECT,
      socketTimeoutMS: DEFAULT_SOCKET,
      maxPoolSize: DEFAULT_POOL,
      // Fail fast on heartbeat instead of hanging requests when the cluster is unreachable.
      heartbeatFrequencyMS: 10000,
    });
    console.log(`Database Connected (pool=${DEFAULT_POOL})`);
  } catch (err) {
    console.log("Database Connection error", err.message);
    process.exit(1);
  }
};
export default Db_Connection;
