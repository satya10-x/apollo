import express from "express";
import cors from "cors";
import helmet from "helmet";
import mongoose from "mongoose";
import path from "node:path";
import { existsSync } from "node:fs";
import { env } from "./config/env.js";
import { searchConfigured } from "./services/providers.js";
import sessions from "./routes/sessions.js";
import { errorHandler } from "./middleware/errors.js";
export const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: env.CLIENT_URL }));
app.use(express.json({ limit: "16kb" }));
app.get("/api/health", (req, res) =>
  res.json({
    status: "ok",
    database:
      mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    researchConfigured: Boolean(env.GROQ_API_KEY && searchConfigured()),
  }),
);
app.use("/api/sessions", sessions);
app.use("/api", (req, res) =>
  res.status(404).json({ error: "API endpoint not found." }),
);
const dist = path.resolve("client/dist");
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get("/{*path}", (req, res) =>
    res.sendFile(path.join(dist, "index.html")),
  );
}
app.use(errorHandler);
