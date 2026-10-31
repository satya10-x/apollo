import { env } from "../../config/env.js";
export const MODES = Object.freeze({
  quick: {
    maxRounds: 1,
    timeoutMs: 300000,
    maxSearchRequests: 8,
    maxSources: 16,
    resultsPerSearch: 2,
    minSourcesPerSection: 1,
    queriesPerQuestion: 1,
    questionsPerSection: 1,
    maxTokens: 80000,
    outputTokens: 3500,
    coverageTarget: 70,
    maxFollowUps: 2,
    searchDepth: "basic",
  },
  standard: {
    maxRounds: 3,
    timeoutMs: 600000,
    maxSearchRequests: 32,
    maxSources: 60,
    resultsPerSearch: 4,
    minSourcesPerSection: 2,
    queriesPerQuestion: 2,
    questionsPerSection: 2,
    maxTokens: 250000,
    outputTokens: 5000,
    coverageTarget: 85,
    maxFollowUps: 6,
    searchDepth: "basic",
  },
  deep: {
    maxRounds: 5,
    timeoutMs: 1200000,
    maxSearchRequests: 72,
    maxSources: 120,
    resultsPerSearch: 6,
    minSourcesPerSection: 3,
    queriesPerQuestion: 3,
    questionsPerSection: 3,
    maxTokens: 600000,
    outputTokens: 7000,
    coverageTarget: 92,
    maxFollowUps: 12,
    searchDepth: "advanced",
  },
});
export function resolveLimits(mode, maxRounds, requested = {}) {
  const policy = MODES[mode];
  const limits = {
    ...policy,
    ...Object.fromEntries(
      Object.entries(requested).filter(([, value]) => value !== undefined),
    ),
  };
  limits.maxRounds = Math.min(
    maxRounds,
    policy.maxRounds,
    env.APOLLO_MAX_ROUNDS,
  );
  for (const field of [
    "timeoutMs",
    "maxSearchRequests",
    "maxSources",
    "maxTokens",
  ])
    limits[field] = Math.min(limits[field], policy[field]);
  limits.timeoutMs = Math.min(limits.timeoutMs, env.APOLLO_TIMEOUT_MS);
  limits.maxSearchRequests = Math.min(
    limits.maxSearchRequests,
    env.APOLLO_MAX_SEARCH_REQUESTS,
  );
  limits.maxTokens = Math.min(limits.maxTokens, env.APOLLO_MAX_TOKENS);
  if (env.APOLLO_MAX_COST_USD !== undefined)
    limits.maxCostUsd = Math.min(
      limits.maxCostUsd ?? Infinity,
      env.APOLLO_MAX_COST_USD,
    );
  return limits;
}
export function initialTasks(blueprint, limits) {
  return blueprint.sections.flatMap((section) =>
    section.subQuestions
      .slice(0, limits.questionsPerSection)
      .map((question) => ({
        id: `initial-${question.id}`,
        sectionId: section.id,
        questionId: question.id,
        question: question.question,
        queries: question.queries.slice(0, limits.queriesPerQuestion),
        expectedEvidence: question.expectedEvidence,
        priority: section.priority,
        dependsOn: section.dependsOn,
        status: "pending",
        round: 1,
        sourceIds: [],
      })),
  );
}
const rank = { high: 0, medium: 1, low: 2 };
export function nextTask(tasks, round) {
  return tasks
    .filter(
      (t) =>
        t.status === "pending" &&
        t.round <= round &&
        t.dependsOn.every(
          (dependency) =>
            !tasks.some(
              (other) =>
                other.sectionId === dependency &&
                ["pending", "running"].includes(other.status) &&
                other.round <= round,
            ),
        ),
    )
    .sort((a, b) => rank[a.priority] - rank[b.priority])[0];
}
export function planFollowUps(review, tasks, plan, round, limits) {
  const seen = new Set(
    tasks.flatMap((t) =>
      t.queries.map((q) => q.trim().toLowerCase().replace(/\s+/g, " ")),
    ),
  );
  const candidates = review.followUpRequests?.length
    ? review.followUpRequests.map((item) => ({
        ...item,
        description: item.missingQuestion,
        queries: [item.query],
      }))
    : review.gaps;
  return [...candidates]
    .sort((a, b) => rank[a.priority] - rank[b.priority])
    .slice(0, limits.maxFollowUps)
    .flatMap((gap, index) => {
      const queries = [];
      for (const query of gap.queries) {
        const normalized = query.trim().toLowerCase().replace(/\s+/g, " ");
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        queries.push(query);
        if (queries.length >= limits.queriesPerQuestion) break;
      }
      if (!queries.length) return [];
      return [
        {
          id: `followup-${round}-${index}`,
          sectionId: gap.sectionId,
          question: gap.description,
          queries,
          reason: gap.reason || gap.description,
          questionId: gap.questionId || undefined,
          expectedEvidence: gap.expectedEvidence?.length
            ? gap.expectedEvidence
            : plan.sections
                .find((s) => s.id === gap.sectionId)
                .subQuestions.flatMap((q) => q.expectedEvidence)
                .slice(0, 5),
          priority: gap.priority,
          dependsOn: [],
          status: "pending",
          round,
          sourceIds: [],
        },
      ];
    });
}
export function researchDecision(state, review) {
  if (review.decision === "COMPLETE")
    return { action: "report", reason: "sufficient_evidence" };
  if (review.decision === "INCOMPLETE_LIMIT_REACHED")
    return { action: "report", reason: review.limitReason || "maximum_rounds" };
  // Application limits remain authoritative even if an old or external review omits its decision.
  if (state.round >= state.limits.maxRounds)
    return { action: "report", reason: "maximum_rounds" };
  if (state.usage.searchRequests >= state.limits.maxSearchRequests)
    return { action: "report", reason: "search_limit" };
  if (state.sourceIds.length >= state.limits.maxSources)
    return { action: "report", reason: "source_limit" };
  return { action: "follow_up", reason: "evidence_gaps" };
}
