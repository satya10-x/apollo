const round = (value) => Math.round(value * 10) / 10;
export function calculateQuality({
  sections,
  claims,
  sources,
  sourceReviews,
  contradictions,
  inspection,
}) {
  const component = (
    score,
    weight,
    measured,
    total,
    explanation,
    status = "measured",
  ) => ({
    score: score === null ? null : round(score),
    weight,
    measured,
    total,
    explanation,
    status,
  });
  const questionCount = sections.reduce((n, s) => n + s.questions.length, 0);
  const answeredUnits = sections
    .flatMap((s) => s.questions)
    .reduce(
      (n, q) =>
        n +
        (q.status === "ANSWERED"
          ? 1
          : q.status === "PARTIALLY_ANSWERED"
            ? 0.5
            : 0),
      0,
    );
  const supportUnits = claims.reduce(
    (n, c) =>
      n +
      (c.reviewStatus === "reviewed" && c.classification === "SUPPORTED"
        ? 1
        : c.reviewStatus === "reviewed" &&
            c.classification === "PARTIALLY_SUPPORTED"
          ? 0.5
          : 0),
    0,
  );
  const usedSources = sources.filter((s) =>
    sections.some((section) => section.sourceIds.includes(String(s._id))),
  );
  let qualityTotal = 0,
    knownQuality = 0;
  for (const source of usedSources) {
    const score = source.assessment?.score;
    if (!Number.isFinite(score)) continue;
    knownQuality++;
    const flags =
      sourceReviews.find((item) => item.sourceId === String(source._id))
        ?.flags || [];
    qualityTotal +=
      Math.max(0, Math.min(100, score)) *
      (flags.includes("IRRELEVANT")
        ? 0
        : flags.includes("POTENTIALLY_UNRELIABLE")
          ? 0.4
          : flags.includes("WEAKLY_SUPPORTED")
            ? 0.6
            : 1);
  }
  const sensitiveIds = new Set(
    sections.filter((s) => s.timeSensitive).flatMap((s) => s.sourceIds),
  );
  const sensitive = sourceReviews.filter((s) => sensitiveIds.has(s.sourceId));
  const current = sensitive.filter((s) => s.freshness === "CURRENT").length;
  const unresolved = contradictions.filter((c) => !c.resolved).length;
  const comparisonsAvailable =
    inspection.comparisonComplete && usedSources.length >= 2;
  const components = {
    sectionCoverage: component(
      questionCount ? (answeredUnits / questionCount) * 100 : 0,
      0.3,
      answeredUnits,
      questionCount,
      "Answered question = 1; partially answered = 0.5; missing or unreviewed = 0.",
    ),
    evidenceSupport: component(
      claims.length ? (supportUnits / claims.length) * 100 : 0,
      0.3,
      supportUnits,
      claims.length,
      "Supported claim = 1; partially supported = 0.5; conflicting, unsupported or unreviewed = 0.",
      claims.length ? "measured" : "unknown",
    ),
    sourceQuality: component(
      usedSources.length ? qualityTotal / usedSources.length : 0,
      0.2,
      knownQuality,
      usedSources.length,
      "Stored heuristic quality, adjusted for review flags. Unknown assessments contribute zero; these are not independently verified credibility scores.",
      knownQuality ? "measured" : "unknown",
    ),
    sourceFreshness: sensitiveIds.size
      ? component(
          (current / sensitiveIds.size) * 100,
          0.1,
          current,
          sensitiveIds.size,
          "For time-sensitive sections: current dated sources / all used sources. Unknown dates contribute zero.",
        )
      : component(
          null,
          0.1,
          0,
          0,
          "Not applicable: no reviewed question requires current information.",
          "not_applicable",
        ),
    contradictionResolution: component(
      comparisonsAvailable
        ? contradictions.length
          ? ((contradictions.length - unresolved) / contradictions.length) * 100
          : 100
        : 0,
      0.1,
      contradictions.length - unresolved,
      contradictions.length,
      comparisonsAvailable
        ? contradictions.length
          ? "Contextualized conflicts / identified conflicts. Genuine and unresolved conflicts contribute zero."
          : "No conflicts identified in the inspected comparison set. This does not prove their absence."
        : "Cross-source comparison is incomplete or fewer than two usable sources exist.",
      comparisonsAvailable ? "measured" : "unknown",
    ),
  };
  const active = Object.values(components).filter(
    (c) => c.status !== "not_applicable",
  );
  const weight = active.reduce((sum, c) => sum + c.weight, 0);
  const score = round(
    active.reduce((sum, c) => sum + (c.score || 0) * c.weight, 0) /
      (weight || 1),
  );
  return {
    method: "hermes-evidence-review-v1",
    score,
    components,
    formula:
      "sum(component score × weight) / applicable weights; unknown applicable components contribute zero",
    disclaimer:
      "A transparent research-quality indicator based on evidence review and source heuristics, not a guarantee of factual accuracy.",
    inspectionComplete: inspection.complete,
  };
}
export function completionDecision(review, state, { stopReason } = {}) {
  const criticalSource = review.sourceReviews.some((item) =>
    item.flags.some((flag) =>
      ["IRRELEVANT", "POTENTIALLY_UNRELIABLE", "WEAKLY_SUPPORTED"].includes(
        flag,
      ),
    ),
  );
  const ready =
    review.inspection.complete &&
    review.claimReviews.length > 0 &&
    review.claimReviews.every(
      (c) => c.reviewStatus === "reviewed" && c.classification === "SUPPORTED",
    ) &&
    review.sections.every(
      (s) =>
        s.coverage >= state.limits.coverageTarget &&
        s.sourceCoverage.usableSources >= state.limits.minSourcesPerSection &&
        s.sourceCoverage.uniqueDomains >=
          Math.min(2, state.limits.minSourcesPerSection) &&
        !s.missingPrimarySources &&
        !s.missingOfficialSources &&
        s.evidenceQuality.supportedClaims > 0,
    ) &&
    !review.contradictions.some((c) => !c.resolved) &&
    !review.gaps.some((g) => g.priority === "high") &&
    !criticalSource;
  if (ready)
    return {
      decision: "COMPLETE",
      readyForReport: true,
      limitReason: null,
      rationale:
        "Every section meets the coverage and source requirements; claims have inspected support and no unresolved conflicts or high-priority gaps remain.",
    };
  const limit =
    stopReason ||
    review.inspection.limitReason ||
    (state.round >= state.limits.maxRounds
      ? "maximum_rounds"
      : state.usage.searchRequests >= state.limits.maxSearchRequests
        ? "search_limit"
        : state.sourceIds.length >= state.limits.maxSources
          ? "source_limit"
          : null);
  if (limit)
    return {
      decision: "INCOMPLETE_LIMIT_REACHED",
      readyForReport: false,
      limitReason: limit,
      rationale: `Evidence remains incomplete. Execution stopped: ${limit.replaceAll("_", " ")}. Any report must disclose the review limitations.`,
    };
  return {
    decision: "NEEDS_MORE_RESEARCH",
    readyForReport: false,
    limitReason: null,
    rationale:
      "Specific questions, evidence support, source coverage or contradiction checks still require research.",
  };
}
