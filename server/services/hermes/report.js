export function reportReviewContext(review) {
  if (!review?.claimReviews)
    return {
      decision: "INCOMPLETE_LIMIT_REACHED",
      limitations: ["No evidence-level review is available."],
      supportedClaims: [],
    };
  return {
    decision: review.decision,
    rationale: review.rationale,
    quality: review.quality,
    sourceReviews: review.sourceReviews,
    sections: review.sections.map((s) => ({
      sectionId: s.sectionId,
      questions: s.questions,
      missingInformation: s.missingInformation,
      sourceCoverage: s.sourceCoverage,
    })),
    supportedClaims: review.claimReviews.filter(
      (c) => c.classification === "SUPPORTED" && c.reviewStatus === "reviewed",
    ),
    qualifiedClaims: review.claimReviews.filter((c) =>
      ["PARTIALLY_SUPPORTED", "CONFLICTING"].includes(c.classification),
    ),
    excludedClaims: review.claimReviews
      .filter((c) => c.classification === "UNSUPPORTED")
      .map((c) => ({ statement: c.statement, reason: c.reason })),
    contradictions: review.contradictions,
    limitations: review.limitations,
  };
}
export function reviewDisclosures(review, sources) {
  if (!review?.decision)
    return ["No evidence-level research review is available."];
  const citation = (sourceId) => {
    const index = sources.findIndex(
      (source) => String(source._id) === sourceId,
    );
    return index >= 0 ? `[${index + 1}]` : "[source unavailable]";
  };
  return [
    ...(review.decision === "COMPLETE"
      ? []
      : [`Research review: ${review.decision}. ${review.rationale}`]),
    ...(review.limitations || []),
    ...(review.contradictions || []).map(
      (conflict) =>
        `Cross-source conflict (${conflict.classification.toLowerCase()}): “${conflict.left.claim}” ${citation(conflict.left.sourceId)} versus “${conflict.right.claim}” ${citation(conflict.right.sourceId)}. Publication dates: ${conflict.left.publishedAt ? new Date(conflict.left.publishedAt).toISOString().slice(0, 10) : "unknown"} / ${conflict.right.publishedAt ? new Date(conflict.right.publishedAt).toISOString().slice(0, 10) : "unknown"}. ${conflict.explanation} Geography: ${conflict.geographicalDifferences} Methodology: ${conflict.methodologicalDifferences}`,
    ),
  ];
}
