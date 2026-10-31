import { z } from "zod";
import { ResearchSession, Source, Report, Evidence } from "../models/index.js";
import { env } from "../config/env.js";
import { AppError } from "../middleware/errors.js";
import {
  runResearch,
  cancelResearch,
  waitForResearch,
} from "../services/research.js";
import { resolveLimits } from "../services/apollo/policies.js";
import {
  costBudgetAvailable,
  searchConfigured,
} from "../services/providers.js";
import { publish } from "../services/events.js";
import { events } from "../services/events.js";
export const createSchema = z.object({
  topic: z
    .string()
    .trim()
    .min(8, "Use at least 8 characters for your topic.")
    .max(500),
  mode: z.enum(["quick", "standard", "deep"]),
  maxRounds: z.number().int().min(1).max(5),
  requirePlanApproval: z.boolean().default(false),
  limits: z
    .object({
      timeoutMs: z.number().int().min(1000).max(3600000).optional(),
      maxSearchRequests: z.number().int().min(1).max(200).optional(),
      maxSources: z.number().int().min(1).max(200).optional(),
      maxTokens: z.number().int().min(1000).max(2000000).optional(),
      maxCostUsd: z.number().finite().positive().optional(),
    })
    .strict()
    .optional(),
});
export async function list(req, res) {
  const sessions = await ResearchSession.find()
    .sort({ createdAt: -1 })
    .limit(100)
    .select(
      "topic mode maxRounds status stage round coverage createdAt updatedAt",
    );
  res.json({ sessions });
}
export async function create(req, res) {
  const input = createSchema.parse(req.body);
  if (input.mode === "quick") input.maxRounds = 1;
  if (!env.GROQ_API_KEY || !searchConfigured())
    throw new AppError(
      "Configure Groq and Tavily (or enabled Exa fallback) in the server .env to start research.",
      503,
    );
  const active = await ResearchSession.countDocuments({
    status: { $in: ["queued", "running"] },
  });
  if (active >= 3)
    throw new AppError(
      "Three sessions are already running. Please wait for one to finish.",
      429,
    );
  const limits = resolveLimits(input.mode, input.maxRounds, input.limits);
  if (limits.maxCostUsd !== undefined && !costBudgetAvailable())
    throw new AppError(
      "A cost budget requires input/output token prices for each enabled LLM and configured Tavily/Exa request prices.",
      400,
    );
  const session = await ResearchSession.create({
    ...input,
    maxRounds: limits.maxRounds,
    limits,
  });
  res.status(201).json({ session });
  void runResearch(session.id).catch((error) =>
    console.error("Research worker failed:", error.message),
  );
}
export async function get(req, res) {
  const session = await ResearchSession.findById(req.params.id);
  if (!session) throw new AppError("Research session not found.", 404);
  res.json({ session });
}
export async function sources(req, res) {
  res.json({
    sources: await Source.find({ session: req.params.id })
      .sort({ createdAt: 1, _id: 1 })
      .select("-content -fingerprint"),
  });
}
export async function report(req, res) {
  const session = await ResearchSession.findById(req.params.id).select(
    "status",
  );
  if (!session) throw new AppError("Research session not found.", 404);
  const report =
    session.status === "completed"
      ? await Report.findOne({ session: req.params.id })
      : null;
  res.json({ report });
}
export async function stats(req, res) {
  const [sessions, reports, sources] = await Promise.all([
    ResearchSession.countDocuments(),
    Report.countDocuments(),
    Source.countDocuments(),
  ]);
  res.json({ sessions, reports, sources });
}
export async function stream(req, res) {
  const session = await ResearchSession.findById(req.params.id);
  if (!session) throw new AppError("Research session not found.", 404);
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  const eventName = String(req.params.id);
  events.on(eventName, send);
  send(session);
  const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 15000);
  req.on("close", () => {
    clearInterval(heartbeat);
    events.off(eventName, send);
  });
}

export async function cancel(req, res) {
  const session = await ResearchSession.findOneAndUpdate(
    { _id: req.params.id, status: { $in: ["queued", "running"] } },
    {
      $set: {
        cancelRequested: true,
        status: "cancelled",
        stage: "cancelled",
        stopReason: "cancelled",
        finishedAt: new Date(),
      },
      $push: {
        events: {
          agent: "Apollo",
          stage: "cancelled",
          message: "Cancellation requested. Stopping active provider requests.",
          at: new Date(),
        },
      },
    },
    { new: true },
  );
  if (!session) {
    const existing = await ResearchSession.findById(req.params.id);
    if (!existing) throw new AppError("Research session not found.", 404);
    if (existing.status === "cancelled") return res.json({ session: existing });
    throw new AppError("This session has already finished.", 409);
  }
  cancelResearch(session.id);
  publish(session.id, session);
  res.json({ session });
}

export async function evidence(req, res) {
  const query = z
    .object({
      sourceId: z
        .string()
        .regex(/^[a-f0-9]{24}$/i)
        .optional(),
      after: z
        .string()
        .regex(/^[a-f0-9]{24}$/i)
        .optional(),
      limit: z.coerce.number().int().min(1).max(100).default(20),
    })
    .parse(req.query);
  const filter = {
    session: req.params.id,
    ...(query.sourceId ? { source: query.sourceId } : {}),
    ...(query.after ? { _id: { $gt: query.after } } : {}),
  };
  const records = await Evidence.find(filter)
    .sort({ _id: 1 })
    .limit(query.limit + 1)
    .lean();
  const hasMore = records.length > query.limit;
  const items = records.slice(0, query.limit);
  res.json({
    evidence: items,
    nextCursor: hasMore ? String(items.at(-1)._id) : null,
  });
}

export async function review(req, res) {
  const session = await ResearchSession.findById(req.params.id).select(
    "reviews",
  );
  if (!session) throw new AppError("Research session not found.", 404);
  res.json({ review: session.reviews?.at(-1) || null });
}

export async function approvePlan(req, res) {
  const session = await ResearchSession.findOneAndUpdate(
    {
      _id: req.params.id,
      status: "running",
      stage: "awaiting_approval",
      cancelRequested: { $ne: true },
    },
    { $set: { planApprovedAt: new Date() } },
    { new: true },
  );
  if (!session)
    throw new AppError("This plan is no longer awaiting approval.", 409);
  publish(session.id, session);
  res.json({ session });
}

export async function remove(req, res) {
  const session = await ResearchSession.findOneAndUpdate(
    {
      _id: req.params.id,
      status: { $in: ["completed", "failed", "cancelled"] },
      deleting: { $ne: true },
      $or: [
        { reportUpdatingUntil: { $exists: false } },
        { reportUpdatingUntil: null },
        { reportUpdatingUntil: { $lte: new Date() } },
      ],
    },
    { $set: { deleting: true } },
    { new: true },
  );
  if (!session) {
    if (!(await ResearchSession.exists({ _id: req.params.id })))
      throw new AppError("Research session not found.", 404);
    throw new AppError(
      "Cancel active research and wait for report updates to finish before deleting.",
      409,
    );
  }
  try {
    await waitForResearch(req.params.id);
    await Promise.all([
      Source.deleteMany({ session: req.params.id }),
      Evidence.deleteMany({ session: req.params.id }),
      Report.deleteMany({ session: req.params.id }),
    ]);
    await ResearchSession.deleteOne({ _id: req.params.id, deleting: true });
    res.json({ deleted: true });
  } catch (error) {
    await ResearchSession.updateOne(
      { _id: req.params.id },
      { $set: { deleting: false } },
    );
    throw error;
  }
}
