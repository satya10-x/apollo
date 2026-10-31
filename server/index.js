import mongoose from "mongoose";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { shutdownResearch } from "./services/research.js";
import { ResearchSession } from "./models/index.js";
const bootedAt = new Date();
const server = app.listen(env.PORT, env.HOST, () =>
  console.log(`Apollo API: http://${env.HOST}:${env.PORT}`),
);
let closing = false,
  reconnectTimer,
  reconnectAttempt = 0;
async function connectDatabase() {
  if (closing) return;
  try {
    await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
      socketTimeoutMS: 10000,
      timeoutMS: 15000,
      wtimeoutMS: 10000,
    });
    reconnectAttempt = 0;
    console.log("MongoDB connected.");
    await ResearchSession.updateMany(
      { status: { $in: ["queued", "running"] }, createdAt: { $lt: bootedAt } },
      {
        $set: {
          status: "failed",
          stage: "failed",
          error:
            "The server restarted during research. Start a new session to retry.",
        },
      },
    );
  } catch {
    if (closing) return;
    const retryMs = Math.min(
      30000,
      2000 * 2 ** Math.min(reconnectAttempt++, 4),
    );
    console.error(
      `MongoDB connection unavailable. Retrying in ${retryMs / 1000}s.`,
    );
    reconnectTimer = setTimeout(connectDatabase, retryMs);
    reconnectTimer.unref();
  }
}
if (env.MONGODB_URI) {
  void connectDatabase();
} else {
  console.log("Set MONGODB_URI in .env to enable persistent research.");
}
async function shutdown() {
  closing = true;
  clearTimeout(reconnectTimer);
  server.close();
  const shutdownDeadline = setTimeout(() => process.exit(1), 10000);
  shutdownDeadline.unref();
  await shutdownResearch();
  await mongoose.disconnect();
  clearTimeout(shutdownDeadline);
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
