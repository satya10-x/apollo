// Structured test responses for the production Hermes audit contracts; never imported by the app.
export function sectionAudit(
  input,
  {
    questionStatus = "ANSWERED",
    classification = "SUPPORTED",
    followUps = [],
    sourceFlags = [],
    timeSensitive = false,
  } = {},
) {
  const evidence = new Map(
    input.evidence.map((item) => [item.evidenceId, item]),
  );
  return {
    questions: input.section.subQuestions.map((q) => ({
      questionId: q.id,
      status: questionStatus,
      evidenceIds:
        questionStatus === "UNANSWERED"
          ? []
          : input.evidence.slice(0, 2).map((item) => item.evidenceId),
      reason: "Assessment based on supplied retrieved passages.",
    })),
    claims: input.claims.map((claim) => ({
      claimId: claim.claimId,
      classification,
      support:
        classification === "UNSUPPORTED"
          ? []
          : [
              {
                evidenceId: claim.evidenceIds[0],
                quote: evidence.get(claim.evidenceIds[0]).passage.slice(0, 120),
              },
            ],
      opposition: [],
      reason: "Checked against the actual quoted passage.",
    })),
    sourceReviews: input.sources.map((source) => ({
      sourceId: source.sourceId,
      flags: sourceFlags,
      freshness: source.publishedAt ? "CURRENT" : "UNKNOWN",
      reason: "Reviewed metadata and retrieved evidence.",
    })),
    contradictions: [],
    followUps,
    timeSensitive,
  };
}
export function comparisonAudit() {
  return {
    contradictions: [],
    missingDimensions: [],
    notes: "No conflicts identified in the supplied representative passages.",
  };
}
export function hermesProvider({
  audit = sectionAudit,
  comparison = comparisonAudit,
  onCall,
} = {}) {
  return {
    async generateJSON(options) {
      onCall?.(options);
      let data = options.system.includes("HERMES_SECTION_AUDIT")
        ? audit(options.input)
        : comparison(options.input);
      data = options.schema.parse(data);
      options.validate?.(data);
      return { data, provider: "test", model: "test-model" };
    },
  };
}
