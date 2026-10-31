import { reportCorpus, sectionContext } from "./context.js";
import { writeSection } from "./writers.js";
import { assembleReport } from "./assembler.js";
import { materializeCitations } from "./citations.js";
import { AppError } from "../../middleware/errors.js";

// Reuse the same writers, evidence validation, assembler and citation engine.
// No retrieval or finding generation is permitted in a report revision.
export async function regenerateSection({
  state,
  stored,
  sectionId,
  sources,
  evidence,
  providers,
  budget,
}) {
  if (
    state.status !== "completed" ||
    stored.formatVersion !== 2 ||
    !state.researchFinishedAt
  )
    throw new AppError(
      "Only completed evidence-linked reports support section regeneration.",
      409,
    );
  const section = state.blueprint?.sections.find(
    (item) => item.id === sectionId,
  );
  if (!section) throw new AppError("Research section not found.", 404);
  const corpus = reportCorpus(state, sources, evidence);
  const context = sectionContext(state, section, corpus);
  if (!context.claims.length)
    throw new AppError(
      "No verified evidence is available for this section. Start new research to collect more evidence.",
      409,
    );
  const draft = await writeSection({ context, state, providers, budget });
  // An unsuccessful requested revision should leave the published report intact.
  if (draft.mode === "extractive_fallback")
    throw new AppError(
      "The section writer is unavailable. Your existing report has been preserved.",
      503,
    );
  const drafts = stored.sections.map((item) =>
    item.sectionId === sectionId
      ? draft
      : {
          sectionId: item.sectionId,
          title: item.title,
          blocks: item.blocks,
          unavailableQuestions: item.unavailableQuestions || [],
          limitations: item.limitations || [],
          mode: item.writerMode,
        },
  );
  const result = await assembleReport({
    state,
    drafts,
    corpus,
    providers,
    budget,
  });
  const report = materializeCitations(result.data, sources, corpus.evidence);
  report.generation.revisions = [
    ...(stored.generation?.revisions || []),
    {
      sectionId,
      at: new Date(),
      usage: { ...state.usage },
      calls: [...draft.calls, ...result.calls],
    },
  ];
  budget.check();
  return report;
}
