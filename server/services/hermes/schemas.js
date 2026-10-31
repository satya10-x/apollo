import { z } from "zod";
const text = z.string().trim().min(1).max(700);
const reference = z.string().min(1).max(100);
export const quoteSchema = z.object({
  evidenceId: reference,
  quote: z.string().min(20).max(600),
});
export const claimReviewSchema = z.object({
  claimId: reference,
  classification: z.enum([
    "SUPPORTED",
    "PARTIALLY_SUPPORTED",
    "CONFLICTING",
    "UNSUPPORTED",
  ]),
  support: z.array(quoteSchema).max(6),
  opposition: z.array(quoteSchema).max(6),
  reason: text,
});
export const contradictionSchema = z.object({
  left: z.object({
    claim: text,
    evidenceId: reference,
    quote: z.string().min(20).max(600),
  }),
  right: z.object({
    claim: text,
    evidenceId: reference,
    quote: z.string().min(20).max(600),
  }),
  classification: z.enum(["GENUINE", "CONTEXTUAL", "UNRESOLVED"]),
  explanation: text,
  geographicalDifferences: text,
  methodologicalDifferences: text,
  temporalDifferences: text,
  queries: z.array(z.string().min(1).max(500)).max(3),
});
export const followUpSchema = z.object({
  questionId: reference.nullable(),
  missingQuestion: text,
  query: z.string().min(1).max(500),
  expectedEvidence: z.array(text).min(1).max(5),
  reason: text,
  priority: z.enum(["high", "medium", "low"]),
});
export const sectionAuditSchema = z.object({
  questions: z
    .array(
      z.object({
        questionId: reference,
        status: z.enum(["ANSWERED", "PARTIALLY_ANSWERED", "UNANSWERED"]),
        evidenceIds: z.array(reference).max(12),
        reason: text,
      }),
    )
    .min(1)
    .max(3),
  claims: z.array(claimReviewSchema).max(12),
  sourceReviews: z
    .array(
      z.object({
        sourceId: reference,
        flags: z
          .array(
            z.enum([
              "IRRELEVANT",
              "OUTDATED",
              "WEAKLY_SUPPORTED",
              "REPETITIVE",
              "POTENTIALLY_UNRELIABLE",
            ]),
          )
          .max(5),
        freshness: z.enum([
          "CURRENT",
          "OUTDATED_FOR_QUESTION",
          "HISTORICALLY_APPROPRIATE",
          "UNKNOWN",
        ]),
        reason: text,
      }),
    )
    .max(24),
  contradictions: z.array(contradictionSchema).max(8),
  followUps: z.array(followUpSchema).max(6),
  timeSensitive: z.boolean(),
});
export const comparisonAuditSchema = z.object({
  contradictions: z.array(contradictionSchema).max(16),
  missingDimensions: z
    .array(
      z.object({
        sectionId: reference,
        dimension: text,
        reason: text,
        query: z.string().min(1).max(500),
        expectedEvidence: z.array(text).min(1).max(5),
      }),
    )
    .max(8),
  notes: text,
});
function exactIds(actual, expected, label) {
  if (
    actual.length !== expected.length ||
    new Set(actual).size !== expected.length ||
    actual.some((id) => !expected.includes(id))
  )
    throw new Error(`Hermes must review every supplied ${label} exactly once.`);
}
export function validateQuotes(quotes, evidenceMap) {
  for (const item of quotes) {
    const record = evidenceMap.get(item.evidenceId);
    if (!record || !record.passage.includes(item.quote))
      throw new Error(
        "Hermes cited a missing evidence record or a non-verbatim supporting quote.",
      );
  }
}
export function validateContradictions(contradictions, evidenceMap) {
  for (const item of contradictions) {
    validateQuotes([item.left, item.right], evidenceMap);
    if (
      String(evidenceMap.get(item.left.evidenceId).source) ===
      String(evidenceMap.get(item.right.evidenceId).source)
    )
      throw new Error(
        "A cross-source contradiction must cite two distinct source records.",
      );
    if (
      item.classification !== "CONTEXTUAL" &&
      item.left.quote.trim() === item.right.quote.trim()
    )
      throw new Error("Identical quotes do not establish opposing evidence.");
    if (item.classification !== "CONTEXTUAL" && !item.queries.length)
      throw new Error(
        "Unresolved contradictions require targeted follow-up queries.",
      );
  }
}
export function validateSectionAudit(
  value,
  { section, claims, evidence, sources },
) {
  const evidenceMap = new Map(evidence.map((item) => [String(item._id), item]));
  exactIds(
    value.questions.map((item) => item.questionId),
    section.subQuestions.map((item) => item.id),
    "question",
  );
  exactIds(
    value.claims.map((item) => item.claimId),
    claims.map((item) => item.claimId),
    "claim",
  );
  exactIds(
    value.sourceReviews.map((item) => item.sourceId),
    sources.map((item) => String(item._id)),
    "source",
  );
  for (const question of value.questions) {
    if (
      question.evidenceIds.some((id) => !evidenceMap.has(id)) ||
      (question.status !== "UNANSWERED" && !question.evidenceIds.length)
    )
      throw new Error(
        "Answered questions must reference actual supplied evidence.",
      );
  }
  for (const claim of value.claims) {
    validateQuotes([...claim.support, ...claim.opposition], evidenceMap);
    if (
      ["SUPPORTED", "PARTIALLY_SUPPORTED", "CONFLICTING"].includes(
        claim.classification,
      ) &&
      !claim.support.length
    )
      throw new Error(
        "Supported or conflicting claims require verbatim support.",
      );
    if (claim.classification === "UNSUPPORTED" && claim.support.length)
      throw new Error("Unsupported claims cannot carry positive support.");
    if (claim.classification !== "CONFLICTING" && claim.opposition.length)
      throw new Error(
        "Opposing evidence must not be silently classified as fully supported.",
      );
    if (
      claim.classification === "CONFLICTING" &&
      (!claim.opposition.length ||
        !claim.support.some((left) =>
          claim.opposition.some(
            (right) =>
              String(evidenceMap.get(left.evidenceId).source) !==
              String(evidenceMap.get(right.evidenceId).source),
          ),
        ))
    )
      throw new Error(
        "Conflicting claims require opposing evidence from different sources.",
      );
  }
  if (
    value.followUps.some(
      (item) =>
        item.questionId &&
        !section.subQuestions.some((q) => q.id === item.questionId),
    )
  )
    throw new Error("Follow-up references an unknown question.");
  validateContradictions(value.contradictions, evidenceMap);
}
