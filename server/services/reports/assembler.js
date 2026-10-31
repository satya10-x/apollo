import { assemblySchema } from "./schemas.js";
import { fingerprint } from "../hermes/context.js";
import { ExecutionStopped } from "../apollo/errors.js";
const key = (text) => text.toLowerCase().replace(/\s+/g, " ").trim();
const unique = (blocks) => [
  ...new Map(blocks.map((block) => [key(block.text), block])).values(),
];
function defaults(drafts) {
  const facts = unique(
    drafts.flatMap((d) => d.blocks).filter((b) => b.kind === "fact"),
  );
  const selected = [];
  for (const draft of drafts) {
    const fact = facts.find((b) => b.sectionId === draft.sectionId);
    if (fact) selected.push(fact.id);
  }
  const analyses = drafts
    .flatMap((d) => d.blocks)
    .filter((b) => ["analysis", "opportunity", "risk"].includes(b.kind));
  return {
    executiveSummary: selected.slice(0, 4),
    keyFindings: facts.slice(0, 6).map((b) => b.id),
    opportunities: analyses
      .filter((b) => b.kind === "opportunity")
      .slice(0, 4)
      .map((b) => b.id),
    risks: analyses
      .filter((b) => b.kind === "risk")
      .slice(0, 4)
      .map((b) => b.id),
    conclusion: analyses
      .filter((b) => b.kind === "analysis")
      .slice(0, 2)
      .map((b) => b.id)
      .concat(selected.slice(0, 1)),
  };
}
export function validateAssembly(value, blocks) {
  const allowed = new Map(blocks.map((b) => [b.id, b]));
  for (const [part, ids] of Object.entries(value)) {
    if (new Set(ids).size !== ids.length || ids.some((id) => !allowed.has(id)))
      throw new Error(
        "The assembler can select only existing validated report blocks.",
      );
    const required =
      part === "opportunities"
        ? "opportunity"
        : part === "risks"
          ? "risk"
          : ["executiveSummary", "keyFindings"].includes(part)
            ? "fact"
            : null;
    if (required && ids.some((id) => allowed.get(id).kind !== required))
      throw new Error(
        "Assembler attempted to present interpretation or uncertainty as an established fact.",
      );
  }
}
export function contradictionBlocks(review, corpus) {
  return (review.contradictions || []).flatMap((conflict) => {
    const sides = [conflict.left, conflict.right];
    if (
      sides.some(
        (side) =>
          !corpus.evidenceMap.has(side.evidenceId) ||
          String(corpus.evidenceMap.get(side.evidenceId).source) !==
            side.sourceId ||
          !corpus.evidenceMap.get(side.evidenceId).passage.includes(side.quote),
      )
    )
      throw new Error(
        "A reviewed contradiction lost its source or supporting evidence; report publication is unsafe.",
      );
    const dates = sides
      .map((side) => corpus.sourceMap.get(side.sourceId)?.publishedAt)
      .map((date) =>
        date ? new Date(date).toISOString().slice(0, 10) : "unknown",
      );
    return [
      {
        id: `block-${fingerprint(conflict.id).slice(0, 20)}`,
        sectionId: null,
        kind: "contradiction",
        verification: conflict.classification,
        text: `${conflict.left.claim} / ${conflict.right.claim}. ${conflict.explanation} Publication dates: ${dates.join(" / ")}. Geography: ${conflict.geographicalDifferences} Methodology: ${conflict.methodologicalDifferences} ${conflict.resolved ? "The difference is contextual; both findings are retained." : "The disagreement remains unresolved."}`,
        claimIds: [],
        sourceIds: [...new Set(sides.map((side) => side.sourceId))],
        evidenceIds: sides.map((side) => side.evidenceId),
        citations: sides.map((side) => ({
          sourceId: side.sourceId,
          evidenceId: side.evidenceId,
          quote: side.quote,
        })),
        conflictId: conflict.id,
        sides: sides.map((side) => ({
          ...side,
          publishedAt: corpus.sourceMap.get(side.sourceId)?.publishedAt || null,
        })),
      },
    ];
  });
}
export async function assembleReport({
  state,
  drafts,
  corpus,
  providers,
  budget,
}) {
  budget.check();
  const calls = [],
    blocks = drafts.flatMap((d) => d.blocks),
    byId = new Map(blocks.map((b) => [b.id, b]));
  let plan = defaults(drafts),
    mode = "assembler";
  if (blocks.some((b) => b.kind === "fact"))
    try {
      const result = await providers.generateJSON({
        system:
          "APOLLO_REPORT_ASSEMBLER. Assemble a concise professional consulting report by selecting supplied validated block IDs only. You cannot write new factual prose, alter claims, introduce source IDs, references or model-memory facts. Executive summary and key findings must select fact blocks only. Opportunity/risk blocks must have the matching kind. Use conclusion for grounded analysis and central findings. Prefer meaningful coverage across sections, avoid unnecessary repetition, and preserve the canonical wording/terminology. Missing material and known contradictions are appended by the backend; never hide them.",
        input: {
          topic: state.topic,
          objective: state.blueprint.objective,
          scope: state.blueprint.scope,
          sections: drafts.map((d) => ({
            sectionId: d.sectionId,
            title: d.title,
            blocks: d.blocks.map(({ id, kind, text, verification }) => ({
              id,
              kind,
              text,
              verification,
            })),
            unavailableQuestions: d.unavailableQuestions,
          })),
          reviewDecision: corpus.review.decision,
        },
        schema: assemblySchema,
        outputTokens: 1200,
        budget,
        validate: (value) => validateAssembly(value, blocks),
      });
      plan = result.data;
      calls.push({
        provider: result.provider,
        model: result.model,
        operation: "report_assembler",
      });
    } catch (error) {
      if (error instanceof ExecutionStopped) throw error;
      mode = "deterministic_assembly";
    }
  const fallback = defaults(drafts);
  if (!plan.executiveSummary.length)
    plan.executiveSummary = fallback.executiveSummary;
  if (!plan.keyFindings.length) plan.keyFindings = fallback.keyFindings;
  if (!plan.conclusion.length) plan.conclusion = fallback.conclusion;
  const select = (ids) => unique(ids.map((id) => byId.get(id)));
  const sections = drafts.map((draft) => ({
    sectionId: draft.sectionId,
    title: draft.title,
    blocks: unique(draft.blocks),
    unavailableQuestions: draft.unavailableQuestions,
    limitations: draft.limitations,
    writerMode: draft.mode,
  }));
  const limitations = [
    ...new Set([
      ...(corpus.review.limitations || []),
      ...(state.gapDetails || []).map((gap) => gap.reason).filter(Boolean),
      ...drafts.flatMap((d) => d.limitations),
      `Research review: ${corpus.review.decision}. ${corpus.review.rationale}`,
      `Evidence collection stopped: ${state.stopReason.replaceAll("_", " ")}.`,
      ...(mode === "deterministic_assembly"
        ? [
            "The assembler was unavailable; validated content was assembled deterministically.",
          ]
        : []),
    ]),
  ];
  return {
    data: {
      formatVersion: 2,
      title: state.topic.trim(),
      objective: state.blueprint.objective,
      scope: state.blueprint.scope,
      executiveSummary: select(plan.executiveSummary),
      keyFindings: select(plan.keyFindings),
      sections,
      contradictions: contradictionBlocks(corpus.review, corpus),
      opportunities: select(plan.opportunities),
      risks: select(plan.risks),
      conclusion: select(plan.conclusion),
      limitations,
      researchFinishedAt: state.researchFinishedAt,
      reviewSnapshot: {
        decision: corpus.review.decision,
        quality: corpus.review.quality,
        inspection: corpus.review.inspection,
        contradictions: corpus.review.contradictions,
      },
      generation: {
        sectionWriters: drafts.map(({ sectionId, mode, blocks }) => ({
          sectionId,
          mode,
          blockCount: blocks.length,
        })),
        assemblerMode: mode,
        assemblyPlan: plan,
      },
    },
    calls,
  };
}
