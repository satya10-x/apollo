import {
  ResearchSession,
  Source,
  Report,
  Evidence,
} from "../../models/index.js";
import { publish } from "../events.js";
import { setTimeout as delay } from "node:timers/promises";
import { Types } from "mongoose";
import { ExecutionStopped } from "./errors.js";
const runtimeFields = [
  "sessionId",
  "status",
  "stage",
  "round",
  "coverage",
  "plan",
  "blueprint",
  "tasks",
  "completedTasks",
  "pendingTasks",
  "findings",
  "sourceIds",
  "evidenceIds",
  "researchMemory",
  "gaps",
  "gapDetails",
  "reviews",
  "decisions",
  "events",
  "limits",
  "usage",
  "startedAt",
  "deadlineAt",
  "finishedAt",
  "researchFinishedAt",
  "reportProgress",
  "stopReason",
  "error",
];
function snapshot(state) {
  return Object.fromEntries(
    runtimeFields
      .filter((key) => state[key] !== undefined)
      .map((key) => [key, state[key]]),
  );
}
export const mongoRepository = {
  async waitForPlanApproval(state, budget) {
    while (true) {
      budget.check();
      const current = await ResearchSession.findById(state._id)
        .select("status cancelRequested planApprovedAt")
        .lean();
      if (!current || current.cancelRequested || current.status !== "running")
        throw new ExecutionStopped(
          "cancelled",
          "Research approval was cancelled.",
        );
      if (current.planApprovedAt) return current.planApprovedAt;
      await delay(1000, undefined, { signal: budget.signal });
    }
  },
  async claim(id) {
    return ResearchSession.findOneAndUpdate(
      { _id: id, status: "queued", cancelRequested: { $ne: true } },
      { $set: { status: "running" } },
      { new: true },
    ).lean();
  },
  async save(state) {
    const session = await ResearchSession.findOneAndUpdate(
      {
        _id: state._id,
        status: "running",
        cancelRequested: { $ne: true },
        ...(state.status === "completed"
          ? { $expr: { $gt: ["$deadlineAt", "$$NOW"] } }
          : {}),
      },
      { $set: snapshot(state) },
      { new: true, runValidators: true },
    ).lean();
    if (!session && state.status === "completed") {
      const latest = await ResearchSession.findById(state._id)
        .select("status cancelRequested")
        .lean();
      if (latest?.status === "running" && !latest.cancelRequested)
        throw new ExecutionStopped(
          "timeout",
          "Research reached its execution timeout before report publication.",
        );
    }
    if (!session)
      throw new ExecutionStopped(
        "cancelled",
        "Research was cancelled or execution ownership was lost.",
      );
    publish(state._id, session);
    return session;
  },
  async stop(state) {
    let session = await ResearchSession.findOneAndUpdate(
      {
        _id: state._id,
        status: { $in: ["running", "cancelled"] },
        cancelRequested: true,
      },
      {
        $set: {
          ...snapshot(state),
          status: "cancelled",
          stage: "cancelled",
          stopReason: "cancelled",
          error: undefined,
        },
      },
      { new: true },
    ).lean();
    if (!session)
      session = await ResearchSession.findOneAndUpdate(
        { _id: state._id, status: "running", cancelRequested: { $ne: true } },
        { $set: snapshot(state) },
        { new: true },
      ).lean();
    if (session) publish(state._id, session);
    return session;
  },
  async listSources(id) {
    return Source.find({ session: id }).sort({ createdAt: 1, _id: 1 }).lean();
  },
  async addSource(id, source, section, { duplicate, task } = {}) {
    const filter = duplicate
      ? { session: id, _id: duplicate.source._id }
      : { session: id, url: source.url };
    const generatedSourceId = new Types.ObjectId();
    const metadata = {
      _id: generatedSourceId,
      sourceId: String(generatedSourceId),
      title: source.title,
      url: source.url,
      canonicalUrl: source.canonicalUrl,
      domain: source.domain,
      category: source.category,
      publishedAt: source.publishedAt,
      relevance: source.relevance,
      assessment: source.assessment,
      contentHash: source.contentHash,
      fingerprint: source.fingerprint,
      retrievedAt: source.retrievedAt,
      section: section.title,
    };
    const provenance = {
      ...source.provenance,
      sectionId: section.id,
      taskId: task?.id,
    };
    const additions = {
      sectionIds: section.id,
      sections: section.title,
      canonicalUrls: source.canonicalUrl,
      originalUrls: source.url,
      provenance,
      assessments: {
        ...source.assessment,
        sectionId: section.id,
        taskId: task?.id,
      },
    };
    if (source.contentHash) additions.contentHashes = source.contentHash;
    if (duplicate)
      additions.duplicateMatches = {
        method: duplicate.method,
        similarity: duplicate.similarity,
        originalUrl: source.url,
      };
    return Source.findOneAndUpdate(
      filter,
      {
        $setOnInsert: metadata,
        $set: { lastRetrievedAt: source.retrievedAt },
        $addToSet: additions,
      },
      { new: true, upsert: !duplicate, runValidators: true },
    ).lean();
  },
  async attachSource(id, sourceId, section) {
    return Source.findOneAndUpdate(
      { session: id, _id: sourceId },
      { $addToSet: { sectionIds: section.id, sections: section.title } },
      { new: true },
    ).lean();
  },
  async addEvidence(id, sourceId, excerpt, task, section) {
    const { passage, passageHash, origin, selectionMethod, ...provenance } =
      excerpt;
    const generatedEvidenceId = new Types.ObjectId();
    return Evidence.findOneAndUpdate(
      { session: id, source: sourceId, passageHash },
      {
        $setOnInsert: {
          _id: generatedEvidenceId,
          evidenceId: String(generatedEvidenceId),
          passage,
          origin,
          selectionMethod,
          retrievedAt: excerpt.retrievedAt,
        },
        $addToSet: {
          sectionIds: section.id,
          sections: section.title,
          taskIds: task.id,
          questions: task.question,
          provenance,
        },
      },
      { new: true, upsert: true, runValidators: true },
    ).lean();
  },
  async attachEvidence(id, evidenceId, task, section) {
    return Evidence.findOneAndUpdate(
      { session: id, _id: evidenceId },
      {
        $addToSet: {
          sectionIds: section.id,
          sections: section.title,
          taskIds: task.id,
          questions: task.question,
        },
      },
      { new: true },
    ).lean();
  },
  async listEvidence(id) {
    return Evidence.find({ session: id }).sort({ createdAt: 1, _id: 1 }).lean();
  },
  async finish(state, report, { check = () => {} } = {}) {
    const record = await Report.create({ ...report, session: state._id });
    try {
      check();
      return await this.save(state);
    } catch (error) {
      await Report.deleteOne({ _id: record._id });
      throw error;
    }
  },
};
