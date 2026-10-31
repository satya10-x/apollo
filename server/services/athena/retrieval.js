import { env } from "../../config/env.js";
import { ExecutionStopped } from "../apollo/errors.js";
import {
  normalizeQuery,
  normalizeRetrievedSource,
  findDuplicateSource,
} from "./sources.js";
import { extractPassages } from "./excerpts.js";
function syncRecord(list, record) {
  const index = list.findIndex(
    (item) => String(item._id) === String(record._id),
  );
  if (index < 0) list.push(record);
  else list[index] = record;
}
const scholarly = (task) =>
  task.expectedEvidence?.some((value) =>
    /academic|peer.review|papers?|preprint|arxiv|scientific stud/i.test(value),
  );
export function createAthenaRetriever({
  repository,
  providers,
  config = env,
  now = () => new Date(),
}) {
  return async function collectTask({
    state,
    task,
    section,
    sources,
    evidence,
    budget,
    sourceAllowance,
    checkpoint,
  }) {
    const memory = state.researchMemory;
    const sourceIds = new Set(),
      evidenceIds = new Set();
    const jobs = [];
    const seen = new Set();
    for (const query of task.queries) {
      const key = `web:${normalizeQuery(query)}`;
      if (!seen.has(key)) {
        jobs.push({ query, key, kind: "web" });
        seen.add(key);
      }
    }
    if (config.ATHENA_ARXIV_ENABLED && scholarly(task) && task.queries.length) {
      const query = task.queries[0];
      jobs.push({
        query,
        key: `academic:${normalizeQuery(query)}`,
        kind: "academic",
      });
    }
    task.executedQueries = [];
    task.cachedQueries = [];
    task.retrievalWarnings = [];
    async function useCached(entry) {
      entry.taskIds = [...new Set([...entry.taskIds, task.id])];
      entry.sectionIds = [...new Set([...entry.sectionIds, section.id])];
      task.cachedQueries.push(entry.query);
      for (const sourceId of entry.sourceIds) {
        if (sourceIds.size >= sourceAllowance) break;
        if (!sources.some((source) => String(source._id) === sourceId))
          continue;
        const attached = await repository.attachSource(
          state._id,
          sourceId,
          section,
        );
        budget.check();
        if (attached) syncRecord(sources, attached);
        sourceIds.add(sourceId);
        for (const item of evidence.filter(
          (item) => String(item.source) === sourceId,
        )) {
          const saved = await repository.attachEvidence(
            state._id,
            item._id,
            task,
            section,
          );
          budget.check();
          if (saved) {
            syncRecord(evidence, saved);
            evidenceIds.add(String(saved._id));
          }
        }
      }
    }
    const pending = [];
    for (const job of jobs) {
      const existing = memory.queries.find(
        (entry) => entry.key === job.key && entry.status !== "not_dispatched",
      );
      if (existing) {
        await useCached(existing);
        if (existing.status === "failed")
          task.retrievalWarnings.push(
            `Previous query failed; not repeated: ${job.query}`,
          );
        continue;
      }
      if (
        sources.length >= state.limits.maxSources ||
        sourceIds.size >= sourceAllowance
      )
        continue;
      const entry = {
        ...job,
        status: "pending",
        taskIds: [task.id],
        sectionIds: [section.id],
        sourceIds: [],
        attempts: [],
        startedAt: now(),
      };
      memory.queries.push(entry);
      pending.push(entry);
    }
    await checkpoint(
      "Athena",
      `Retrieval plan: ${pending.length} new queries, ${task.cachedQueries.length} reused.`,
    );
    const concurrency = Math.max(
      1,
      Math.min(config.ATHENA_SEARCH_CONCURRENCY ?? 2, 4),
    );
    for (let offset = 0; offset < pending.length; offset += concurrency) {
      if (
        sources.length >= state.limits.maxSources ||
        sourceIds.size >= sourceAllowance
      )
        break;
      const batch = pending.slice(offset, offset + concurrency);
      await checkpoint(
        "Athena",
        `Searching ${batch.length} targeted ${task.round > 1 ? "follow-up " : ""}queries for ${section.title}.`,
      );
      const outcomes = await Promise.allSettled(
        batch.map(async (entry) => {
          budget.check();
          entry.status = "running";
          try {
            const results = await providers.search(entry.query, {
              budget,
              mode: state.mode,
              kind: entry.kind,
              onAttempt: (attempt) => entry.attempts.push(attempt),
            });
            budget.check();
            entry.status = results.length ? "completed" : "empty";
            entry.completedAt = now();
            task.executedQueries.push(entry.query);
            return { entry, results };
          } catch (error) {
            entry.status =
              error instanceof ExecutionStopped ? "limited" : "failed";
            entry.error =
              error instanceof ExecutionStopped
                ? error.message
                : "External search failed. See provider attempt metadata.";
            entry.completedAt = now();
            if (
              error instanceof ExecutionStopped &&
              error.code !== "search_limit"
            )
              throw error;
            task.retrievalWarnings.push(
              `${entry.kind} query ${entry.status}: ${entry.query}`,
            );
            return { entry, results: [] };
          }
        }),
      );
      const fatal = outcomes.find((outcome) => outcome.status === "rejected");
      if (fatal) throw fatal.reason;
      budget.check();
      // Ingest serially so concurrent results cannot exceed source limits or race duplicate merges.
      for (const outcome of outcomes) {
        const { entry, results } = outcome.value;
        const candidates = results
          .map((result) => normalizeRetrievedSource(result, entry.query, now()))
          .filter(Boolean)
          .sort((a, b) => b.assessment.score - a.assessment.score);
        for (const candidate of candidates) {
          if (sourceIds.size >= sourceAllowance) break;
          const duplicate = findDuplicateSource(sources, candidate);
          if (!duplicate && sources.length >= state.limits.maxSources) continue;
          const excerpts = extractPassages(
            candidate,
            task.question + " " + entry.query,
          );
          if (!excerpts.length) continue;
          const saved = await repository.addSource(
            state._id,
            candidate,
            section,
            { duplicate, task },
          );
          budget.check();
          if (!saved) continue;
          syncRecord(sources, saved);
          const sourceId = String(saved._id);
          sourceIds.add(sourceId);
          entry.sourceIds = [...new Set([...entry.sourceIds, sourceId])];
          for (const excerpt of excerpts) {
            // Hard boundary: an evidence passage must be exactly a span of this API response.
            if (
              candidate.content.slice(
                excerpt.startOffset,
                excerpt.endOffset,
              ) !== excerpt.passage
            )
              throw new Error(
                "Retrieved excerpt lost its original supporting span.",
              );
            const savedEvidence = await repository.addEvidence(
              state._id,
              sourceId,
              excerpt,
              task,
              section,
            );
            budget.check();
            syncRecord(evidence, savedEvidence);
            evidenceIds.add(String(savedEvidence._id));
          }
        }
        if (entry.status === "completed" && !entry.sourceIds.length)
          entry.status = "no_accepted_sources";
      }
      state.sourceIds = sources.map((source) => String(source._id));
      state.evidenceIds = evidence.map((item) => String(item._id));
      await checkpoint(
        "Athena",
        `Retrieved ${sourceIds.size} sources and ${evidenceIds.size} supporting excerpts for this task.`,
      );
    }
    for (const entry of pending)
      if (entry.status === "pending") {
        entry.status = "not_dispatched";
        entry.error = "Task source allowance reached before dispatch.";
        entry.completedAt = now();
      }
    task.sourceIds = [...sourceIds];
    task.evidenceIds = [...evidenceIds];
    memory.investigatedQuestions.push({
      taskId: task.id,
      sectionId: section.id,
      question: task.question,
      sourceIds: task.sourceIds,
      evidenceIds: task.evidenceIds,
      completedAt: now(),
    });
    state.sourceIds = sources.map((source) => String(source._id));
    state.evidenceIds = evidence.map((item) => String(item._id));
    return { sourceIds: task.sourceIds, evidenceIds: task.evidenceIds };
  };
}
