import { ProviderError, providerDiagnostic } from "../provider-errors.js";
import { blueprintSchema } from "./schemas.js";
import {
  resolveLimits,
  initialTasks,
  nextTask,
  planFollowUps,
  researchDecision,
} from "./policies.js";
import { ExecutionBudget, emptyUsage } from "./budget.js";
import { ExecutionStopped } from "./errors.js";
import { createAthenaRetriever } from "../athena/retrieval.js";
import { researchTask } from "../agents/athena.js";
import { completionDecision } from "../hermes/quality.js";
import { reviewFindings, writeReport } from "../agents/hermes.js";

export function createOrchestrator({ repository, providers, now = Date.now }) {
  return async function run(id, { signal } = {}) {
    const claimed = await repository.claim(id);
    if (!claimed) return null;
    const limits =
      claimed.limits || resolveLimits(claimed.mode, claimed.maxRounds);
    const state = {
      ...claimed,
      sessionId: String(claimed._id),
      status: "running",
      stage: "planning",
      round: 0,
      coverage: 0,
      plan: [],
      blueprint: null,
      tasks: [],
      completedTasks: [],
      pendingTasks: [],
      findings: [],
      sourceIds: [],
      evidenceIds: [],
      researchMemory: { queries: [], investigatedQuestions: [] },
      gaps: [],
      gapDetails: [],
      reviews: [],
      decisions: [],
      events: claimed.events || [],
      limits,
      usage: emptyUsage(),
      startedAt: new Date(now()),
      deadlineAt: new Date(now() + limits.timeoutMs),
    };
    const deadline = new AbortController();
    const timer = setTimeout(
      () =>
        deadline.abort(
          new ExecutionStopped(
            "timeout",
            "Research reached its execution timeout.",
          ),
        ),
      limits.timeoutMs,
    );
    timer.unref?.();
    const budget = new ExecutionBudget(state, {
      signal: AbortSignal.any([deadline.signal, ...(signal ? [signal] : [])]),
      now,
    });
    const startedMs = new Date(state.startedAt).getTime();
    const gatheringBudget = budget.forPhase(
      startedMs + limits.timeoutMs * 0.6,
      "research_time_reserve",
    );
    const reviewBudget = budget.forPhase(
      startedMs + limits.timeoutMs * 0.85,
      "review_time_reserve",
    );
    const writingBudget = budget.forPhase(
      startedMs + limits.timeoutMs * 0.9,
      "report_time_reserve",
    );
    // Optional prose generation must not consume the time needed to assemble
    // and persist already-verified claims. No new claims are invented here.
    const reportProviders = {
      ...providers,
      async generateJSON(options) {
        try {
          writingBudget.check();
          return await providers.generateJSON({
            ...options,
            budget: writingBudget,
          });
        } catch (error) {
          if (error.code === "report_time_reserve")
            throw new ProviderError(
              "backend",
              "report_time_reserve",
              "Report time reserved for assembling verified claims.",
            );
          throw error;
        }
      },
    };
    let sources = [];
    let evidence = [];
    const collectTask = createAthenaRetriever({
      repository,
      providers,
      now: () => new Date(now()),
    });
    function event(agent, message) {
      state.events.push({
        agent,
        stage: state.stage,
        message,
        at: new Date(now()),
      });
    }
    function decision(action, reason, details) {
      state.decisions.push({
        round: state.round,
        action,
        reason,
        details,
        at: new Date(now()),
      });
    }
    function syncTasks() {
      state.completedTasks = state.tasks
        .filter((t) => t.status === "completed")
        .map((t) => t.id);
      state.pendingTasks = state.tasks
        .filter((t) => ["pending", "running"].includes(t.status))
        .map((t) => t.id);
    }
    async function checkpoint(agent, message) {
      budget.check();
      syncTasks();
      if (message) event(agent, message);
      await repository.save(state);
      budget.check();
    }
    function recordModel(result, operation) {
      decision("model_result", operation, `${result.provider}/${result.model}`);
    }
    try {
      await checkpoint(
        "Apollo",
        "Understanding the objective, domain and research scope.",
      );
      const planned = await providers.generateJSON({
        system: `You are Apollo, the central research manager. Understand the topic before planning: objective, scope, domain, complexity, key dimensions and information needed. Create ${state.mode === "quick" ? "exactly 4" : "4–8"} coherent sections based on complexity. Include unique section and globally unique sub-question IDs, priorities, acyclic dependencies, sub-questions, targeted search queries for EACH question, and expected evidence types (official statistics, research papers, policy documents, company filings, etc.). For ${state.mode} mode use at most ${limits.questionsPerSection} sub-questions per section and ${limits.queriesPerQuestion} queries per question. Fit the most important work within ${limits.maxSearchRequests} searches. Research depth must be appropriate to this mode.`,
        input: { topic: state.topic, mode: state.mode, limits },
        schema: blueprintSchema,
        budget,
        validate: (plan) => {
          if (
            (state.mode === "quick" && plan.sections.length !== 4) ||
            plan.sections.some(
              (s) =>
                s.subQuestions.length > limits.questionsPerSection ||
                s.subQuestions.some(
                  (q) => q.queries.length > limits.queriesPerQuestion,
                ),
            )
          )
            throw new Error("Blueprint exceeds mode-specific planning limits.");
        },
      });
      state.blueprint = blueprintSchema.parse(planned.data);
      recordModel(planned, "research_blueprint");
      state.plan = state.blueprint.sections.map((section) => section.title);
      state.tasks = initialTasks(state.blueprint, limits);
      decision(
        "dispatch",
        "initial_plan",
        `${state.tasks.length} section tasks assigned to Athena.`,
      );
      if (state.requirePlanApproval) {
        state.stage = "awaiting_approval";
        await checkpoint(
          "Apollo",
          "Research blueprint ready. Waiting for your approval before any searches. Execution timeout still applies.",
        );
        state.planApprovedAt = await repository.waitForPlanApproval(
          state,
          budget,
        );
        await checkpoint(
          "Apollo",
          "Research plan approved. Assigning Athena’s tasks.",
        );
      }
      state.stage = "searching";
      await checkpoint(
        "Apollo",
        "Research blueprint ready. Dispatching section tasks to Athena.",
      );
      for (let round = 1; round <= limits.maxRounds; round++) {
        state.round = round;
        // Keep source capacity available for gap-driven follow-up rounds.
        const roundSourceCeiling =
          round === limits.maxRounds
            ? limits.maxSources
            : sources.length +
              Math.max(
                1,
                Math.floor((limits.maxSources - sources.length) * 0.7),
              );
        let task;
        try {
          while ((task = nextTask(state.tasks, round))) {
            gatheringBudget.check();
            task.status = "running";
            state.stage = "searching";
            await checkpoint("Apollo", `Dispatching ${task.question}`);
            const section = state.blueprint.sections.find(
              (section) => section.id === task.sectionId,
            );
            const remainingTasks = state.tasks.filter(
              (item) =>
                ["pending", "running"].includes(item.status) &&
                item.round <= round,
            ).length;
            const sourceAllowance = Math.max(
              1,
              Math.floor(
                (roundSourceCeiling - sources.length) /
                  Math.max(remainingTasks, 1),
              ),
            );
            await collectTask({
              state,
              task,
              section,
              sources,
              evidence,
              budget: gatheringBudget,
              sourceAllowance,
              checkpoint,
            });
            const taskSourceIds = new Set(task.sourceIds);
            if (!task.sourceIds.length) {
              task.status = "skipped";
              task.reason =
                state.usage.searchRequests >= limits.maxSearchRequests
                  ? "search_limit"
                  : sources.length >= limits.maxSources
                    ? "source_limit"
                    : "no_usable_evidence";
              await checkpoint(
                "Athena",
                `No evidence available for: ${task.question}`,
              );
              continue;
            }
            state.stage = "synthesizing";
            await checkpoint(
              "Athena",
              `Assessing evidence for: ${task.question}`,
            );
            const dependencyFindings = state.findings.filter((finding) =>
              task.dependsOn.includes(finding.sectionId),
            );
            const contextSourceIds = new Set(
              dependencyFindings.flatMap((finding) =>
                finding.claims.flatMap((claim) => claim.sourceIds),
              ),
            );
            let finding;
            try {
              finding = await researchTask({
                task,
                evidence: evidence.filter(
                  (item) =>
                    task.evidenceIds.includes(String(item._id)) ||
                    contextSourceIds.has(String(item.source)),
                ),
                sources: sources.filter(
                  (source) =>
                    taskSourceIds.has(String(source._id)) ||
                    contextSourceIds.has(String(source._id)),
                ),
                providers,
                budget: gatheringBudget,
                dependencies: {
                  findings: dependencyFindings,
                  unresolvedSections: task.dependsOn.filter(
                    (sectionId) =>
                      !dependencyFindings.some(
                        (finding) =>
                          finding.sectionId === sectionId &&
                          finding.claims.length,
                      ),
                  ),
                },
              });
            } catch (error) {
              if (error instanceof ExecutionStopped) throw error;
              task.status = "skipped";
              task.reason = "finding_synthesis_failed";
              task.providerError = providerDiagnostic(error);
              // Retrying unavailable models for every task creates a search/retry
              // storm. The provider service has already exhausted its bounded recovery.
              if (
                [
                  "provider_rate_limit",
                  "provider_unavailable",
                  "provider_request_too_large",
                ].includes(error.code)
              )
                throw error;
              task.retrievalWarnings.push(
                "Retrieved evidence is available, but structured finding synthesis failed. Hermes must inspect the actual records without assuming claim support.",
              );
              await checkpoint(
                "Apollo",
                task.providerError
                  ? `Athena synthesis failed: ${task.providerError.reason}`
                  : "Athena synthesis failed. Preserving the retrieved evidence for Hermes review.",
              );
              continue;
            }
            recordModel(finding, "athena_finding");
            state.findings.push({
              taskId: task.id,
              sectionId: task.sectionId,
              ...finding.data,
            });
            task.status = "completed";
            task.completedAt = new Date(now());
            await checkpoint("Athena", `Task complete: ${task.question}`);
          }
        } catch (error) {
          if (error.code !== "research_time_reserve") throw error;
          state.stopReason = "research_time_reserve";
          for (const pending of state.tasks) {
            if (["pending", "running"].includes(pending.status)) {
              pending.status = "skipped";
              pending.reason = state.stopReason;
            }
          }
          await checkpoint(
            "Apollo",
            "Research time reserved for Hermes verification and report completion.",
          );
        }
        if (
          state.tasks.some(
            (task) => task.status === "pending" && task.round <= round,
          )
        )
          throw new Error(
            "Research dependency graph stalled before all scheduled tasks could run.",
          );
        state.stage = "reviewing";
        await checkpoint(
          "Apollo",
          "Sending collected findings to Hermes for evidence and gap review.",
        );
        sources = await repository.listSources(id);
        evidence = await repository.listEvidence(id);
        const reviewed = await reviewFindings({
          state,
          sources,
          evidence,
          providers,
          budget: reviewBudget,
          now: new Date(now()),
          onProgress: async (message) => checkpoint("Hermes", message),
        });
        recordModel(reviewed, "hermes_review");
        const review = reviewed.data;
        if (
          !review.inspection.limitReason &&
          (state.stopReason === "research_time_reserve" ||
            gatheringBudget.remainingMs() === 0)
        ) {
          state.stopReason = "research_time_reserve";
          Object.assign(
            review,
            completionDecision(review, state, { stopReason: state.stopReason }),
          );
        }
        await checkpoint(
          "Hermes",
          `Evidence review finished: ${review.decision.replaceAll("_", " ").toLowerCase()}. ${review.gaps.length} gaps identified; ${review.contradictions.length} source disagreements inspected.`,
        );
        state.reviews = state.reviews.map(
          ({ sectionAudits, comparisonAudit, ...historical }) => historical,
        );
        state.reviews.push({ round, ...review });
        state.coverage = review.coverage;
        state.gapDetails = review.gaps;
        state.gaps = review.gaps.map((gap) => gap.description);
        const choice = researchDecision(state, review);
        decision(choice.action, choice.reason, review.rationale);
        await checkpoint(
          "Apollo",
          `Hermes review interpreted: ${choice.reason.replaceAll("_", " ")}.`,
        );
        if (choice.action === "report") {
          if (!sources.length || !review.inspection.evidenceRecords)
            throw new ExecutionStopped(
              "no_evidence",
              "Hermes found no valid external evidence records; a reliable report cannot be produced.",
            );
          state.stopReason = choice.reason;
          break;
        }
        const followUps = planFollowUps(
          review,
          state.tasks,
          state.blueprint,
          round + 1,
          limits,
        );
        if (!followUps.length) {
          state.stopReason = "no_new_queries";
          Object.assign(
            review,
            completionDecision(review, state, { stopReason: "no_new_queries" }),
          );
          state.reviews[state.reviews.length - 1] = { round, ...review };
          if (!sources.length || !review.inspection.evidenceRecords)
            throw new ExecutionStopped(
              "no_evidence",
              "Hermes found no valid external evidence records; a reliable report cannot be produced.",
            );
          decision(
            "report",
            "no_new_queries",
            "No novel follow-up queries remain.",
          );
          break;
        }
        state.tasks.push(...followUps);
        await checkpoint(
          "Apollo",
          `Scheduled ${followUps.length} follow-up tasks to address evidence gaps.`,
        );
      }
      budget.check();
      state.stopReason ||= "maximum_rounds";
      state.researchFinishedAt = new Date(now());
      state.stage = "writing_sections";
      await checkpoint(
        "Apollo",
        "Research loop finished. Starting independent section writers.",
      );
      // Re-read the exact reference order exposed by the existing sources API.
      sources = await repository.listSources(id);
      evidence = await repository.listEvidence(id);
      budget.check();
      const written = await writeReport({
        state,
        sources,
        evidence,
        providers: reportProviders,
        budget,
        onProgress: async (progress) => {
          state.stage = progress.stage;
          state.reportProgress = progress;
          await checkpoint(
            "Apollo",
            progress.sectionId
              ? `Report section ${progress.sectionId}: ${progress.status}.`
              : `Report assembly: ${progress.status}.`,
          );
        },
      });
      recordModel(written, "two_stage_report");
      written.data.limitations = [
        ...new Set([
          ...written.data.limitations,
          ...(state.gapDetails || []).map((gap) => gap.reason).filter(Boolean),
          `Apollo stopped evidence gathering: ${state.stopReason.replaceAll("_", " ")}.`,
        ]),
      ];
      state.status = "completed";
      state.stage = "completed";
      state.finishedAt = new Date(now());
      syncTasks();
      event("Apollo", "Your evidence-backed research report is ready.");
      budget.check();
      await repository.finish(state, written.data, {
        check: () => budget.check(),
      });
      return state;
    } catch (error) {
      const aborted = budget.signal.aborted ? budget.signal.reason : null;
      const stopped = aborted instanceof ExecutionStopped ? aborted : error;
      state.stopReason = stopped.code || "execution_error";
      state.status = state.stopReason === "cancelled" ? "cancelled" : "failed";
      state.stage = state.status;
      state.finishedAt = new Date(now());
      state.error = state.status === "cancelled" ? null : stopped.message;
      for (const task of state.tasks)
        if (["pending", "running"].includes(task.status)) {
          task.status = state.status === "cancelled" ? "cancelled" : "skipped";
          task.reason = state.stopReason;
        }
      syncTasks();
      decision(
        "stop",
        state.stopReason,
        state.error || "Cancelled by the user.",
      );
      event("Apollo", state.error || "Research cancelled.");
      try {
        state.evidenceIds = (await repository.listEvidence(id)).map((item) =>
          String(item._id),
        );
        state.sourceIds = (await repository.listSources(id)).map((source) =>
          String(source._id),
        );
      } catch {
        /* Preserve the last checkpoint if the database is unavailable. */
      }
      const persisted = await repository.stop(state);
      return persisted || state;
    } finally {
      clearTimeout(timer);
    }
  };
}
