import { z } from "zod";
import { ResearchSession, Report, Source, Evidence } from "../models/index.js";
import { AppError } from "../middleware/errors.js";
import { providers } from "../services/providers.js";
import { ExecutionBudget, emptyUsage } from "../services/apollo/budget.js";
import { ExecutionStopped } from "../services/apollo/errors.js";
import { regenerateSection } from "../services/reports/regenerate.js";
import { publish } from "../services/events.js";

export async function regenerate(req, res) {
  const { sectionId } = z
    .object({ sectionId: z.string().min(1).max(100) })
    .parse(req.body);
  const lease = new Date(Date.now() + 120000);
  const session = await ResearchSession.findOneAndUpdate(
    {
      _id: req.params.id,
      status: "completed",
      deleting: { $ne: true },
      $or: [
        { reportUpdatingUntil: { $exists: false } },
        { reportUpdatingUntil: null },
        { reportUpdatingUntil: { $lte: new Date() } },
      ],
    },
    { $set: { reportUpdatingUntil: lease } },
    { new: true },
  ).lean();
  if (!session)
    throw new AppError(
      "Report is unavailable or another update is in progress.",
      409,
    );
  const controller = new AbortController();
  const disconnect = () => {
    if (!res.writableEnded)
      controller.abort(
        new ExecutionStopped("cancelled", "Report update cancelled."),
      );
  };
  res.on("close", disconnect);
  publish(req.params.id, session);
  try {
    const [stored, sources, evidence] = await Promise.all([
      Report.findOne({ session: req.params.id }).lean(),
      Source.find({ session: req.params.id })
        .sort({ createdAt: 1, _id: 1 })
        .lean(),
      Evidence.find({ session: req.params.id }).lean(),
    ]);
    if (!stored) throw new AppError("Report not found.", 404);
    const state = {
      ...session,
      usage: emptyUsage(),
      deadlineAt: new Date(
        Date.now() + Math.min(90000, session.limits?.timeoutMs || 90000),
      ),
    };
    const budget = new ExecutionBudget(state, {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(90000)]),
    });
    const report = await regenerateSection({
      state,
      stored,
      sectionId,
      sources,
      evidence,
      providers,
      budget,
    });
    budget.check();
    // The lease is longer than the execution deadline. A delayed request cannot
    // publish after a newer revision acquires this session.
    if (Date.now() >= lease.getTime())
      throw new AppError("Report update expired. Please retry.", 409);
    const saved = await Report.findOneAndUpdate(
      { _id: stored._id, __v: stored.__v },
      { $set: report, $inc: { __v: 1 } },
      { new: true, runValidators: true },
    );
    if (!saved)
      throw new AppError(
        "Report changed during this update. Reload and retry.",
        409,
      );
    const updated = await ResearchSession.findOneAndUpdate(
      { _id: req.params.id, reportUpdatingUntil: lease },
      {
        $push: {
          events: {
            agent: "Apollo",
            stage: "completed",
            message: `Regenerated report section from existing verified evidence: ${sectionId}. Reassembled report and citations.`,
            at: new Date(),
          },
        },
      },
      { new: true },
    );
    if (updated) publish(req.params.id, updated);
    res.json({ report: saved });
  } catch (error) {
    if (error instanceof ExecutionStopped)
      throw new AppError(error.message, 409);
    throw error;
  } finally {
    res.off("close", disconnect);
    const unlocked = await ResearchSession.findOneAndUpdate(
      { _id: req.params.id, reportUpdatingUntil: lease },
      { $unset: { reportUpdatingUntil: 1 } },
      { new: true },
    );
    if (unlocked) publish(req.params.id, unlocked);
  }
}
