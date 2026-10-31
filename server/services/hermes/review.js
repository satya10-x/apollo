import {
  sectionAuditSchema,
  comparisonAuditSchema,
  validateSectionAudit,
  validateContradictions,
} from "./schemas.js";
import {
  blueprintContext,
  buildCorpus,
  sectionBatches,
  splitAuditBatch,
  sourceContext,
  evidenceContext,
  fingerprint,
  invalidClaimReason,
  enrichContradiction,
} from "./context.js";
import { calculateQuality, completionDecision } from "./quality.js";
import { ExecutionStopped } from "../apollo/errors.js";
import { providerDiagnostic } from "../provider-errors.js";
const priority = { high: 0, medium: 1, low: 2 };
const citation = (item, corpus) => ({
  ...item,
  sourceId: String(corpus.evidenceMap.get(item.evidenceId).source),
});
const unique = (items) => [...new Set(items)];
function aggregateQuestion(question, records, corpus) {
  const candidates = records.filter((item) => item.questionId === question.id);
  const status = candidates.some((q) => q.status === "ANSWERED")
    ? "ANSWERED"
    : candidates.some((q) => q.status === "PARTIALLY_ANSWERED")
      ? "PARTIALLY_ANSWERED"
      : "UNANSWERED";
  return {
    questionId: question.id,
    question: question.question,
    status,
    evidenceIds: unique(
      candidates
        .filter((item) => item.status !== "UNANSWERED")
        .flatMap((item) => item.evidenceIds),
    ).filter((id) => corpus.evidenceMap.has(id)),
    reason:
      unique(candidates.map((item) => item.reason))
        .join(" ")
        .slice(0, 1400) ||
      "No actual evidence was inspected for this question.",
  };
}
export async function performReview({
  state,
  sources,
  evidence,
  providers,
  budget,
  now = new Date(),
  onProgress = async () => {},
}) {
  const corpus = buildCorpus(state, sources, evidence),
    audits = [],
    calls = [],
    errors = [];
  const prior = state.reviews.at(-1)?.sectionAudits || [];
  let limitReason = null;
  for (const section of state.blueprint.sections) {
    await onProgress(
      `Verifying claims and assessing evidence coverage: ${section.title}`,
    );
    const batches = sectionBatches(section, corpus, state);
    for (const batch of batches) {
      const input = {
        blueprint: blueprintContext(state.blueprint),
        section,
        mode: state.mode,
        round: state.round,
        reviewDate: now.toISOString().slice(0, 10),
        claims: batch.claims,
        evidence: batch.evidence.map((item) => evidenceContext(item)),
        sources: batch.sources.map(sourceContext),
      };
      const key = fingerprint({ ...input, round: undefined });
      const cached = prior.find(
        (item) => item.inputFingerprint === key && item.status === "reviewed",
      );
      if (cached) {
        audits.push({ ...cached, reused: true });
        continue;
      }
      if (limitReason) continue;
      try {
        const result = await providers.generateJSON({
          system:
            "You are Hermes, Apollo’s critical research reviewer. HERMES_SECTION_AUDIT. Inspect the actual retrieved evidence passages, not the generated finding as proof. Review EVERY supplied blueprint question, claim and source exactly once. A question with no supporting passage is UNANSWERED. Check factual entailment, qualifiers and citation fit. Classify claims SUPPORTED, PARTIALLY_SUPPORTED, CONFLICTING or UNSUPPORTED. Cite exact substrings as quotes; never invent text or IDs. Compare sources for contradictions, dates, geography and methodology. Do not silently pick a winner. Mark absent or uncertain context explicitly. Assess source relevance, weak support, repetition, potential unreliability and freshness relative to the question, not age alone. Academic repository presence does not prove peer review. Return specific follow-ups with missing question, query, expected evidence, priority and reason. Be concise; no numeric quality scores or completion decisions.",
          input,
          schema: sectionAuditSchema,
          outputTokens: 2200,
          budget,
          validate: (value) => validateSectionAudit(value, batch),
        });
        audits.push({
          sectionId: section.id,
          inputFingerprint: key,
          status: "reviewed",
          evidenceIds: batch.evidence.map((item) => String(item._id)),
          claimIds: batch.claims.map((item) => item.claimId),
          sourceIds: batch.sources.map((item) => String(item._id)),
          data: result.data,
          auditedAt: now,
        });
        calls.push({
          provider: result.provider,
          model: result.model,
          operation: "section_audit",
        });
      } catch (error) {
        if (error.code === "provider_request_too_large") {
          const smaller = splitAuditBatch(batch);
          if (smaller.length) {
            batches.push(...smaller);
            await onProgress(
              "Provider request size limit reached. Retrying smaller evidence audit batches.",
            );
            continue;
          }
        }
        if (error instanceof ExecutionStopped) {
          if (error.code === "cancelled" || error.code === "server_shutdown")
            throw error;
          limitReason = error.code;
        }
        // A failed provider is not an evidence gap. Don't spend one retry cycle
        // per remaining batch (or trigger another search round).
        if (
          [
            "provider_rate_limit",
            "provider_unavailable",
            "provider_request_too_large",
          ].includes(error.code)
        )
          limitReason = error.code;
        errors.push({
          sectionId: section.id,
          ...providerDiagnostic(error),
          reason:
            error instanceof ExecutionStopped
              ? error.message
              : providerDiagnostic(error)?.reason ||
                "The structured section audit could not be completed.",
        });
      }
    }
  }
  await onProgress(
    "Section evidence inspected. Detecting gaps and checking cross-source contradictions.",
  );
  const inspected = new Set(audits.flatMap((a) => a.evidenceIds));
  const claimReviews = corpus.claims.map((claim) => {
    const invalid = invalidClaimReason(claim, corpus);
    const audited = audits
      .flatMap((a) => a.data.claims)
      .find((item) => item.claimId === claim.claimId);
    return {
      claimId: claim.claimId,
      sectionId: claim.sectionId,
      taskId: claim.taskId,
      statement: claim.statement,
      citedSourceIds: claim.sourceIds || [],
      citedEvidenceIds: claim.evidenceIds || [],
      classification: invalid
        ? "UNSUPPORTED"
        : audited?.classification || "UNSUPPORTED",
      reviewStatus: invalid
        ? "invalid_citations"
        : audited
          ? "reviewed"
          : "not_reviewed",
      support: invalid
        ? []
        : (audited?.support || []).map((item) => citation(item, corpus)),
      opposition: invalid
        ? []
        : (audited?.opposition || []).map((item) => citation(item, corpus)),
      reason:
        invalid ||
        audited?.reason ||
        "Claim was not inspected; no support is assumed.",
    };
  });
  const sourceReviews = corpus.sources.map((source) => {
    const records = audits
      .flatMap((a) => a.data.sourceReviews)
      .filter((item) => item.sourceId === String(source._id));
    const dated =
      source.publishedAt && !Number.isNaN(Date.parse(source.publishedAt));
    const freshness = !dated
      ? "UNKNOWN"
      : records.some((item) => item.freshness === "OUTDATED_FOR_QUESTION")
        ? "OUTDATED_FOR_QUESTION"
        : records.some((item) => item.freshness === "CURRENT")
          ? "CURRENT"
          : records.some(
                (item) => item.freshness === "HISTORICALLY_APPROPRIATE",
              )
            ? "HISTORICALLY_APPROPRIATE"
            : "UNKNOWN";
    return {
      sourceId: String(source._id),
      title: source.title,
      url: source.url,
      domain: source.domain,
      publishedAt: source.publishedAt || null,
      flags: unique(records.flatMap((item) => item.flags)),
      freshness,
      reviewStatus: records.length ? "reviewed" : "not_reviewed",
      reasons: unique(records.map((item) => item.reason)),
    };
  });
  const contradictions = [];
  for (const audit of audits)
    for (const item of audit.data.contradictions)
      contradictions.push(enrichContradiction(item, corpus, [audit.sectionId]));
  // A conflicting claim always produces an explicit conflict record even if the model omitted a duplicate entry.
  for (const claim of claimReviews.filter(
    (item) => item.classification === "CONFLICTING",
  )) {
    const left = claim.support[0],
      right = claim.opposition.find((item) => item.sourceId !== left?.sourceId);
    if (!left || !right) continue;
    if (
      contradictions.some(
        (c) =>
          [c.left.evidenceId, c.right.evidenceId].includes(left.evidenceId) &&
          [c.left.evidenceId, c.right.evidenceId].includes(right.evidenceId),
      )
    )
      continue;
    contradictions.push(
      enrichContradiction(
        {
          left: { ...left, claim: claim.statement },
          right: { ...right, claim: right.quote },
          classification: "UNRESOLVED",
          explanation: claim.reason,
          geographicalDifferences: "Not established.",
          methodologicalDifferences: "Not established.",
          temporalDifferences:
            "Compare the recorded publication dates; comparability is not established.",
          queries: [
            `${claim.statement} conflicting evidence methodology comparison`.slice(
              0,
              500,
            ),
          ],
        },
        corpus,
        [claim.sectionId],
      ),
    );
  }
  let comparisonComplete = false,
    comparisonNotes = "Cross-source comparison was not completed.",
    missingDimensions = [];
  // Actual representative passages from EVERY source are passed to the global comparison, not AI summaries.
  const representatives = corpus.sources.flatMap((source) => {
    const record = corpus.evidence.find(
      (item) => String(item.source) === String(source._id),
    );
    return record ? [record] : [];
  });
  if (!limitReason && representatives.length >= 2) {
    const provided = representatives.map((record) => ({
      ...record,
      passage: record.passage.slice(0, 600),
    }));
    const map = new Map(provided.map((record) => [String(record._id), record]));
    try {
      const input = {
        blueprint: blueprintContext(state.blueprint),
        reviewDate: now.toISOString().slice(0, 10),
        claims: claimReviews.map((c) => ({
          claimId: c.claimId,
          sectionId: c.sectionId,
          statement: c.statement.slice(0, 700),
          classification: c.classification,
        })),
        sources: corpus.sources.map(sourceContext),
        evidence: provided.map((record) => evidenceContext(record, 600)),
      };
      const key = fingerprint(input),
        cached = state.reviews.at(-1)?.comparisonAudit;
      let data;
      if (cached?.inputFingerprint === key) {
        data = cached.data;
      } else {
        const result = await providers.generateJSON({
          system:
            "You are Hermes. HERMES_COMPARISON_AUDIT. Compare actual passages from different sources across the entire research blueprint. Find conflicting factual claims and missing material research dimensions. Do not use generated claims as proof. Quote exact substrings from supplied passages on BOTH sides of every conflict; include geographical, methodological and temporal differences or explicitly say they are unknown. Classify GENUINE, CONTEXTUAL or UNRESOLVED; contextual differences must be explained, never silently prefer a source. Generate targeted queries for unresolved conflicts. Missing dimensions must be material to the original objective, associated with an existing section, and accompanied by specific expected evidence. Return concise, actionable output and no invented score or completion decision.",
          input,
          schema: comparisonAuditSchema,
          outputTokens: 1800,
          budget,
          validate: (value) => {
            validateContradictions(value.contradictions, map);
            if (
              value.missingDimensions.some(
                (item) =>
                  !state.blueprint.sections.some(
                    (section) => section.id === item.sectionId,
                  ),
              )
            )
              throw new Error(
                "Missing dimension references an unknown section.",
              );
          },
        });
        data = result.data;
        calls.push({
          provider: result.provider,
          model: result.model,
          operation: "cross_source_comparison",
        });
      }
      comparisonComplete = true;
      comparisonNotes = data.notes;
      missingDimensions = data.missingDimensions;
      for (const item of data.contradictions) {
        const sectionIds = unique(
          [item.left, item.right].flatMap(
            (side) => corpus.evidenceMap.get(side.evidenceId).sectionIds || [],
          ),
        ).filter((id) => state.blueprint.sections.some((s) => s.id === id));
        contradictions.push(
          enrichContradiction(
            item,
            corpus,
            sectionIds.length
              ? sectionIds
              : state.blueprint.sections.map((s) => s.id),
          ),
        );
      }
      var comparisonAudit = { inputFingerprint: key, data };
    } catch (error) {
      if (error instanceof ExecutionStopped) {
        if (error.code === "cancelled" || error.code === "server_shutdown")
          throw error;
        limitReason = error.code;
      }
      errors.push({
        ...providerDiagnostic(error),
        reason:
          providerDiagnostic(error)?.reason ||
          "Cross-source comparison did not finish; absence of conflicts is not assumed.",
      });
    }
  }
  const deduplicated = [
    ...new Map(
      contradictions.map((item) => [
        fingerprint([
          ...[item.left.evidenceId, item.right.evidenceId].sort(),
          item.classification,
        ]),
        item,
      ]),
    ).values(),
  ];
  const sourceReviewMap = new Map(
    sourceReviews.map((item) => [item.sourceId, item]),
  );
  const sections = state.blueprint.sections.map((section) => {
    const relevantAudits = audits.filter((a) => a.sectionId === section.id),
      questions = section.subQuestions.map((q) =>
        aggregateQuestion(
          q,
          relevantAudits.flatMap((a) => a.data.questions),
          corpus,
        ),
      );
    const sourceIds = unique(relevantAudits.flatMap((a) => a.sourceIds));
    const sectionTasks = new Set(
      state.tasks
        .filter((task) => task.sectionId === section.id)
        .map((task) => task.id),
    );
    const collectedEvidence = corpus.evidence.filter(
      (item) =>
        item.sectionIds?.includes(section.id) ||
        item.taskIds?.some((id) => sectionTasks.has(id)) ||
        corpus.claims.some(
          (claim) =>
            claim.sectionId === section.id &&
            claim.evidenceIds?.includes(String(item._id)),
        ),
    );
    const collectedSourceIds = unique(
      collectedEvidence.map((item) => String(item.source)),
    );
    const usable = sourceIds.filter(
      (id) => !sourceReviewMap.get(id)?.flags.includes("IRRELEVANT"),
    );
    const domains = unique(
      usable.map((id) => corpus.sourceMap.get(id).domain).filter(Boolean),
    );
    const requiresOfficial = section.subQuestions.some((q) =>
      q.expectedEvidence.some((type) =>
        /official|government|policy/i.test(type),
      ),
    );
    const requiresPrimary = section.subQuestions.some((q) =>
      q.expectedEvidence.some((type) =>
        /official|primary|government|statistics|dataset|filing|policy|original research/i.test(
          type,
        ),
      ),
    );
    const primary = usable.filter(
      (id) =>
        [
          "Government",
          "Statistical dataset",
          "Technical documentation",
          "Academic research",
        ].includes(corpus.sourceMap.get(id).category) ||
        [
          "likely_primary",
          "primary_for_own_claims",
          "potential_primary",
        ].includes(
          corpus.sourceMap.get(id).assessment?.dimensions?.primarySource
            ?.classification,
        ),
    );
    const timeSensitive =
      relevantAudits.some((a) => a.data.timeSensitive) ||
      /\b(current|latest|recent|today|forecast|future|trends)\b/i.test(
        `${state.blueprint.scope} ${section.title} ${section.subQuestions.map((q) => q.question).join(" ")}`,
      );
    const unresolved = deduplicated.filter(
      (c) => !c.resolved && c.sectionIds.includes(section.id),
    );
    if (unresolved.length)
      for (const q of questions)
        if (
          q.status === "ANSWERED" &&
          unresolved.some((c) =>
            [c.left.evidenceId, c.right.evidenceId].some((id) =>
              q.evidenceIds.includes(id),
            ),
          )
        ) {
          q.status = "PARTIALLY_ANSWERED";
          q.reason += " Unresolved cross-source contradiction.";
        }
    const coverage =
      (questions.reduce(
        (n, q) =>
          n +
          (q.status === "ANSWERED"
            ? 1
            : q.status === "PARTIALLY_ANSWERED"
              ? 0.5
              : 0),
        0,
      ) /
        questions.length) *
      100;
    return {
      sectionId: section.id,
      title: section.title,
      coverage: Math.round(coverage),
      questions,
      answeredQuestions: questions
        .filter((q) => q.status === "ANSWERED")
        .map((q) => q.questionId),
      partiallyAnsweredQuestions: questions
        .filter((q) => q.status === "PARTIALLY_ANSWERED")
        .map((q) => q.questionId),
      missingInformation: questions
        .filter((q) => q.status === "UNANSWERED")
        .map((q) => q.question),
      sourceIds,
      collectedSourceIds,
      collectedEvidenceIds: collectedEvidence.map((item) => String(item._id)),
      evidenceIds: unique(relevantAudits.flatMap((a) => a.evidenceIds)),
      sourceCoverage: {
        totalSources: collectedSourceIds.length,
        inspectedSources: sourceIds.length,
        usableSources: usable.length,
        uniqueDomains: domains.length,
        domains,
        primarySources: primary.length,
      },
      missingPrimarySources: requiresPrimary && !primary.length,
      missingOfficialSources:
        requiresOfficial &&
        !usable.some(
          (id) => corpus.sourceMap.get(id).category === "Government",
        ),
      timeSensitive,
      assessment: `${questions.filter((q) => q.status === "ANSWERED").length}/${questions.length} questions answered; ${collectedSourceIds.length} collected, ${sourceIds.length} inspected and ${usable.length} usable sources across ${domains.length} domains.`,
      completeness:
        coverage === 100 && !unresolved.length ? "covered" : "incomplete",
    };
  });
  for (const section of sections) {
    const sectionClaims = claimReviews.filter(
      (claim) => claim.sectionId === section.sectionId,
    );
    section.evidenceQuality = {
      supportedClaims: sectionClaims.filter(
        (c) => c.classification === "SUPPORTED",
      ).length,
      partiallySupportedClaims: sectionClaims.filter(
        (c) => c.classification === "PARTIALLY_SUPPORTED",
      ).length,
      conflictingClaims: sectionClaims.filter(
        (c) => c.classification === "CONFLICTING",
      ).length,
      unsupportedClaims: sectionClaims.filter(
        (c) => c.classification === "UNSUPPORTED",
      ).length,
      unreviewedClaims: sectionClaims.filter(
        (c) => c.reviewStatus !== "reviewed",
      ).length,
    };
    if (
      sectionClaims.some((c) => c.classification !== "SUPPORTED") ||
      section.missingPrimarySources ||
      section.sourceCoverage.usableSources < state.limits.minSourcesPerSection
    )
      section.completeness = "incomplete";
  }
  for (const source of sourceReviews) {
    const sensitive = sections.some(
      (section) =>
        section.timeSensitive && section.sourceIds.includes(source.sourceId),
    );
    const age = source.publishedAt
      ? (now - new Date(source.publishedAt)) / 86400000
      : null;
    source.ageDays = age === null ? null : Math.floor(age);
    if (age !== null && age < 0) {
      source.freshness = "UNKNOWN";
      source.reasons.push(
        "Publication date is in the future and cannot establish current evidence.",
      );
    }
    if (sensitive && age !== null && age > 1095) {
      source.freshness = "OUTDATED_FOR_QUESTION";
      source.flags = unique([...source.flags, "OUTDATED"]);
      source.reasons.push(
        "Time-sensitive research uses evidence over three years old; current corroboration is needed.",
      );
    }
    if (corpus.sourceMap.get(source.sourceId).duplicateMatches?.length) {
      source.flags = unique([...source.flags, "REPETITIVE"]);
      source.reasons.push(
        "Duplicate-copy provenance exists; this source is counted once, not as independent corroboration.",
      );
    }
  }
  const requests = [];
  function follow(
    section,
    question,
    reason,
    expectedEvidence,
    query,
    kind = "insufficient_evidence",
    importance = "high",
    questionId = null,
  ) {
    requests.push({
      sectionId: section.sectionId || section.id,
      questionId,
      missingQuestion: question,
      query: query.slice(0, 500),
      expectedEvidence: expectedEvidence.slice(0, 5),
      reason,
      priority: importance,
      kind,
    });
  }
  for (const section of sections) {
    const original = state.blueprint.sections.find(
      (s) => s.id === section.sectionId,
    );
    for (const q of section.questions)
      if (q.status !== "ANSWERED") {
        const planned = original.subQuestions.find(
          (item) => item.id === q.questionId,
        );
        follow(
          section,
          q.question,
          q.reason,
          planned.expectedEvidence,
          `${q.question} ${planned.expectedEvidence[0]} supporting evidence`,
          "unanswered_question",
          "high",
          q.questionId,
        );
      }
    if (
      section.sourceCoverage.uniqueDomains <
      Math.min(2, state.limits.minSourcesPerSection)
    )
      follow(
        section,
        original.subQuestions[0].question,
        "Source coverage lacks independent domains.",
        original.subQuestions[0].expectedEvidence,
        `${section.title} independent studies official data source comparison`,
        "weak_source_diversity",
      );
    if (
      section.evidenceIds.length &&
      !claimReviews.some(
        (claim) =>
          claim.sectionId === section.sectionId &&
          claim.classification === "SUPPORTED",
      )
    )
      follow(
        section,
        original.subQuestions[0].question,
        "Actual evidence exists but this section has no verified extracted claim.",
        original.subQuestions[0].expectedEvidence,
        `${section.title} official evidence key factual findings`,
        "missing_verified_findings",
      );
    if (
      section.sourceIds.some((id) =>
        sourceReviewMap
          .get(id)
          ?.flags.some((flag) =>
            ["WEAKLY_SUPPORTED", "POTENTIALLY_UNRELIABLE"].includes(flag),
          ),
      )
    )
      follow(
        section,
        original.subQuestions[0].question,
        "Source review found weak support or potential unreliability; independent corroboration is required.",
        ["Independent primary evidence corroborating the findings"],
        `${section.title} independent primary evidence corroboration`,
        "weak_source_quality",
      );
    if (section.missingOfficialSources)
      follow(
        section,
        original.subQuestions[0].question,
        "The blueprint requests official or government evidence, but none has been inspected successfully.",
        ["Official government publication or policy data"],
        `${section.title} official government publication primary data`,
        "missing_official_sources",
      );
    if (section.missingPrimarySources)
      follow(
        section,
        original.subQuestions[0].question,
        "No inspected official or likely primary evidence source is available.",
        original.subQuestions[0].expectedEvidence,
        `${section.title} official primary source original data`,
        "missing_primary_sources",
      );
    if (
      section.timeSensitive &&
      section.sourceIds.some((id) =>
        ["UNKNOWN", "OUTDATED_FOR_QUESTION"].includes(
          sourceReviewMap.get(id)?.freshness,
        ),
      )
    )
      follow(
        section,
        original.subQuestions[0].question,
        "Time-sensitive evidence has unknown dates or is outdated for this question.",
        ["Current dated primary evidence"],
        `${section.title} latest official dated evidence ${now.getUTCFullYear()}`,
        "outdated_or_undated_information",
      );
  }
  for (const audit of audits)
    for (const item of audit.data.followUps)
      follow(
        state.blueprint.sections.find((s) => s.id === audit.sectionId),
        item.missingQuestion,
        item.reason,
        item.expectedEvidence,
        item.query,
        "model_identified_gap",
        item.priority,
        item.questionId,
      );
  for (const claim of claimReviews.filter(
    (c) => c.classification !== "SUPPORTED",
  )) {
    const section = state.blueprint.sections.find(
      (s) => s.id === claim.sectionId,
    );
    follow(
      section,
      claim.statement,
      claim.reason,
      ["Primary evidence directly supporting or refuting the claim"],
      `${claim.statement} original study evidence verification`,
      "claim_verification",
    );
  }
  for (const conflict of deduplicated.filter((c) => !c.resolved))
    for (const query of conflict.queries) {
      const section = state.blueprint.sections.find((s) =>
        conflict.sectionIds.includes(s.id),
      );
      follow(
        section,
        `${conflict.left.claim} / ${conflict.right.claim}`,
        conflict.explanation,
        ["Comparable primary evidence with dates, geography and methodology"],
        query,
        "contradiction",
      );
    }
  for (const dimension of missingDimensions)
    follow(
      state.blueprint.sections.find((s) => s.id === dimension.sectionId),
      dimension.dimension,
      dimension.reason,
      dimension.expectedEvidence,
      dimension.query,
      "missing_dimension",
    );
  const followUpRequests = [
    ...new Map(
      requests
        .sort((a, b) => priority[a.priority] - priority[b.priority])
        .map((item) => [
          `${item.sectionId}:${item.query.toLowerCase().replace(/\s+/g, " ")}`,
          item,
        ]),
    ).values(),
  ];
  const inspection = {
    evidenceRecords: corpus.evidence.length,
    inspectedEvidenceRecords: inspected.size,
    invalidEvidenceIds: corpus.invalidEvidenceIds,
    unreviewedEvidenceIds: corpus.evidence
      .filter((item) => !inspected.has(String(item._id)))
      .map((item) => String(item._id)),
    claimCount: claimReviews.length,
    reviewedClaims: claimReviews.filter((c) => c.reviewStatus === "reviewed")
      .length,
    comparisonComplete,
    comparisonNotes,
    comparisonScope:
      "One actual 600-character representative passage per source across sections, plus full passage comparisons within section audits; not exhaustive pairwise fact checking.",
    errors,
    limitReason,
  };
  inspection.complete =
    corpus.evidence.length > 0 &&
    inspected.size === corpus.evidence.length &&
    !corpus.invalidEvidenceIds.length &&
    claimReviews.every((c) => c.reviewStatus === "reviewed") &&
    comparisonComplete &&
    !errors.length;
  const gaps = followUpRequests.map((item) => ({
    sectionId: item.sectionId,
    description: item.missingQuestion,
    priority: item.priority,
    queries: [item.query],
    expectedEvidence: item.expectedEvidence,
    reason: item.reason,
    kind: item.kind,
    questionId: item.questionId,
  }));
  const review = {
    coverage: Math.round(
      sections.reduce((n, s) => n + s.coverage, 0) / sections.length,
    ),
    sections,
    claimReviews,
    sourceReviews,
    contradictions: deduplicated,
    missingDimensions,
    followUpRequests,
    gaps,
    inspection,
    sectionAudits: audits,
    comparisonAudit,
    reviewedAt: now,
    limitations: unique([
      ...(corpus.evidence.length
        ? []
        : ["No valid external evidence records are available."]),
      ...errors.map((e) => e.reason),
      ...(corpus.invalidEvidenceIds.length
        ? ["Some evidence records were invalid or missing source links."]
        : []),
      "Claim support and contradiction interpretation are model judgments anchored to retrieved passages, not independent factual certification.",
    ]),
  };
  review.quality = calculateQuality({
    ...review,
    sources: corpus.sources,
    claims: claimReviews,
  });
  Object.assign(review, completionDecision(review, state));
  return {
    data: review,
    provider: calls.at(-1)?.provider || "backend",
    model: calls.at(-1)?.model || "deterministic-review",
    calls,
  };
}
