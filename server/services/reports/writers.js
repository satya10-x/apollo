import { sectionWriterSchema, groundingSchema } from "./schemas.js";
import { writerInput } from "./context.js";
import { fingerprint } from "../hermes/context.js";
import { ExecutionStopped } from "../apollo/errors.js";
const normalized = (text) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
function citationsFor(claim, context) {
  return [...claim.support, ...claim.opposition].map((quote) => ({
    evidenceId: quote.evidenceId,
    sourceId: String(
      context.evidence.find((record) => String(record._id) === quote.evidenceId)
        .source,
    ),
    quote: quote.quote,
  }));
}
export function canonicalClaimBlock(claim, context) {
  const citations = citationsFor(claim, context);
  return {
    id: `block-${fingerprint([context.section.id, claim.claimId]).slice(0, 20)}`,
    sectionId: context.section.id,
    kind: claim.classification === "SUPPORTED" ? "fact" : "qualification",
    text: claim.statement,
    verification: claim.classification,
    qualification: claim.classification === "SUPPORTED" ? null : claim.reason,
    claimIds: [claim.claimId],
    sourceIds: [...new Set(citations.map((item) => item.sourceId))],
    evidenceIds: [...new Set(citations.map((item) => item.evidenceId))],
    citations,
  };
}
export function validateWriter(value, context) {
  const claims = new Map(context.claims.map((claim) => [claim.claimId, claim]));
  if (value.sectionId !== context.section.id)
    throw new Error("Section writer crossed its assigned research section.");
  if (
    new Set(value.claimIds).size !== value.claimIds.length ||
    value.claimIds.some((id) => !claims.has(id))
  )
    throw new Error("Writer used an unknown or out-of-section claim.");
  if (
    new Set(value.analyses.map((item) => item.id)).size !==
    value.analyses.length
  )
    throw new Error("Analysis IDs must be unique within a section.");
  for (const item of value.analyses) {
    if (/\[\d+\]|https?:\/\//i.test(item.text))
      throw new Error("Writers cannot invent citations or source links.");
    if (
      item.claimIds.some(
        (id) =>
          !claims.has(id) || claims.get(id).classification !== "SUPPORTED",
      )
    )
      throw new Error(
        "Analysis must derive only from supported claims assigned to this section.",
      );
  }
}
function validateGrounding(value, analyses, context) {
  if (
    value.assessments.length !== analyses.length ||
    new Set(value.assessments.map((item) => item.analysisId)).size !==
      analyses.length ||
    value.assessments.some(
      (item) => !analyses.some((a) => a.id === item.analysisId),
    )
  )
    throw new Error(
      "Every proposed analysis requires a separate grounding verdict.",
    );
  const evidence = new Map(
    context.evidence.map((item) => [String(item._id), item]),
  );
  for (const item of value.assessments) {
    const proposal = analyses.find((a) => a.id === item.analysisId);
    const premiseIds = new Set(
      context.claims
        .filter((claim) => proposal.claimIds.includes(claim.claimId))
        .flatMap((claim) => claim.support.map((quote) => quote.evidenceId)),
    );
    if (item.verdict === "SUPPORTED_INFERENCE" && !item.grounding.length)
      throw new Error("An inference requires actual grounding passages.");
    if (
      item.grounding.some(
        (quote) =>
          !premiseIds.has(quote.evidenceId) ||
          !evidence.get(quote.evidenceId)?.passage.includes(quote.quote),
      )
    )
      throw new Error(
        "Grounding quotes must be verbatim, section-assigned and linked to the inference premises.",
      );
  }
}
export async function writeSection({ context, state, providers, budget }) {
  budget.check();
  const calls = [],
    limitations = [...context.limitations];
  if (!context.claims.length)
    return {
      sectionId: context.section.id,
      title: context.section.title,
      blocks: [],
      unavailableQuestions: context.section.subQuestions.map((q) => ({
        questionId: q.id,
        question: q.question,
        reason:
          "No section-assigned claim with inspected, source-linked support is available.",
      })),
      limitations,
      mode: "no_verified_evidence",
      calls,
    };
  const maxFacts = state.mode === "quick" ? 3 : state.mode === "deep" ? 6 : 4;
  let selected,
    mode = "independent_writer";
  try {
    const result = await providers.generateJSON({
      system:
        "APOLLO_SECTION_WRITER. Write ONLY the assigned section using the supplied evidence and Hermes verification. Select claim IDs to cover the section sub-questions. Fact text will be rendered verbatim by the backend from those reviewed claims; do not rewrite facts or introduce new ones. Keep the section concise and non-repetitive. You may propose at most two short analyses/opportunities/risks anchored to SUPPORTED claim IDs. These must be explicitly interpretive, not additional factual assertions from model memory. Do not invent sources, URLs, citations, evidence or missing information. Preserve uncertainty and disagreements. Never use evidence from another section.",
      input: writerInput(context),
      schema: sectionWriterSchema,
      outputTokens: 1200,
      budget,
      validate: (value) => validateWriter(value, context),
    });
    selected = result.data;
    calls.push({
      provider: result.provider,
      model: result.model,
      operation: "section_writer",
      sectionId: context.section.id,
    });
  } catch (error) {
    if (error instanceof ExecutionStopped) throw error;
    mode = "extractive_fallback";
    limitations.push(
      "The section writer was unavailable or invalid. Only exact Hermes-reviewed claims are included.",
    );
    selected = {
      sectionId: context.section.id,
      claimIds: context.claims.slice(0, maxFacts).map((c) => c.claimId),
      analyses: [],
    };
  }
  let claimIds = selected.claimIds.slice(0, maxFacts);
  // A model cannot suppress every available fact while offering only speculative prose.
  if (!claimIds.length)
    claimIds = context.claims.slice(0, maxFacts).map((c) => c.claimId);
  const chosen = claimIds.map((id) =>
      context.claims.find((c) => c.claimId === id),
    ),
    seen = new Set();
  const blocks = chosen
    .map((claim) => canonicalClaimBlock(claim, context))
    .filter((block) => {
      const key = normalized(block.text);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const proposals = selected.analyses.slice(0, 2);
  if (proposals.length) {
    try {
      const result = await providers.generateJSON({
        system:
          "APOLLO_SECTION_GROUNDING. Critically inspect each proposed analysis against the actual assigned passages and its reviewed premises. Return SUPPORTED_INFERENCE only for a reasonable, clearly qualified interpretation that introduces no additional factual assertion, number, causal certainty or source from model memory. Otherwise return UNSUPPORTED. Quote exact substantive substrings as grounding and use only evidence IDs belonging to the proposal’s premises. Every analysis requires a verdict.",
        input: {
          analyses: proposals,
          premises: context.claims.filter((c) =>
            proposals.some((p) => p.claimIds.includes(c.claimId)),
          ),
          evidence: context.evidence.map((e) => ({
            evidenceId: String(e._id),
            passage: e.passage,
          })),
        },
        schema: groundingSchema,
        outputTokens: 1000,
        budget,
        validate: (value) => validateGrounding(value, proposals, context),
      });
      calls.push({
        provider: result.provider,
        model: result.model,
        operation: "section_grounding",
        sectionId: context.section.id,
      });
      for (const assessment of result.data.assessments) {
        const proposal = proposals.find((p) => p.id === assessment.analysisId);
        if (assessment.verdict !== "SUPPORTED_INFERENCE") {
          limitations.push(
            "A proposed interpretation was omitted because its evidence support was not established.",
          );
          continue;
        }
        const citations = assessment.grounding.map((q) => ({
          ...q,
          sourceId: String(
            context.evidence.find((e) => String(e._id) === q.evidenceId).source,
          ),
        }));
        if (seen.has(normalized(proposal.text))) continue;
        seen.add(normalized(proposal.text));
        blocks.push({
          id: `block-${fingerprint([context.section.id, proposal.id, proposal.text]).slice(0, 20)}`,
          sectionId: context.section.id,
          kind: proposal.kind,
          text: proposal.text,
          verification: "SUPPORTED_INFERENCE",
          claimIds: proposal.claimIds,
          sourceIds: [...new Set(citations.map((c) => c.sourceId))],
          evidenceIds: [...new Set(citations.map((c) => c.evidenceId))],
          citations,
          groundingReason: assessment.reason,
        });
      }
    } catch (error) {
      if (error instanceof ExecutionStopped) throw error;
      limitations.push(
        "Proposed interpretations were omitted because grounding verification could not finish.",
      );
    }
  }
  return {
    sectionId: context.section.id,
    title: context.section.title,
    blocks,
    unavailableQuestions: (context.hermes?.questions || [])
      .filter((q) => q.status !== "ANSWERED")
      .map((q) => ({
        questionId: q.questionId,
        question: q.question,
        reason: q.reason,
      })),
    limitations: [...new Set(limitations)],
    mode,
    calls,
  };
}
