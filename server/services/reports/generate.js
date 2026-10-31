import { ExecutionStopped } from "../apollo/errors.js";
import { reportCorpus, sectionContext } from "./context.js";
import { writeSection } from "./writers.js";
import { assembleReport } from "./assembler.js";
import { materializeCitations } from "./citations.js";
export async function generateReport({
  state,
  sources,
  evidence,
  providers,
  budget,
  onProgress = async () => {},
}) {
  if (
    !state.researchFinishedAt ||
    !state.stopReason ||
    state.tasks.some((task) => ["pending", "running"].includes(task.status))
  )
    throw new Error(
      "Report generation is forbidden before the research loop has finished.",
    );
  if (
    !["COMPLETE", "INCOMPLETE_LIMIT_REACHED"].includes(
      state.reviews.at(-1)?.decision,
    )
  )
    throw new Error(
      "Apollo must finish the research decision before starting section writers.",
    );
  budget.check();
  const corpus = reportCorpus(state, sources, evidence),
    drafts = [],
    calls = [];
  for (const section of state.blueprint.sections) {
    await onProgress({
      stage: "writing_sections",
      sectionId: section.id,
      status: "writing",
      completedSections: drafts.length,
      totalSections: state.blueprint.sections.length,
    });
    const draft = await writeSection({
      context: sectionContext(state, section, corpus),
      state,
      providers,
      budget,
    });
    drafts.push(draft);
    calls.push(...draft.calls);
    budget.check();
    await onProgress({
      stage: "writing_sections",
      sectionId: section.id,
      status: "written",
      completedSections: drafts.length,
      totalSections: state.blueprint.sections.length,
    });
  }
  if (
    !drafts.some((draft) =>
      draft.blocks.some((block) =>
        ["fact", "qualification"].includes(block.kind),
      ),
    )
  )
    throw new ExecutionStopped(
      "no_verified_evidence",
      "Evidence review did not establish any publishable claims. Sources and activity are saved. Check provider availability or retry with greater execution limits.",
    );
  await onProgress({
    stage: "assembling_report",
    status: "assembling",
    completedSections: drafts.length,
    totalSections: drafts.length,
  });
  const assembled = await assembleReport({
    state,
    drafts,
    corpus,
    providers,
    budget,
  });
  calls.push(...assembled.calls);
  const report = materializeCitations(assembled.data, sources, corpus.evidence);
  budget.check();
  await onProgress({
    stage: "assembling_report",
    status: "validated",
    completedSections: drafts.length,
    totalSections: drafts.length,
  });
  return {
    data: report,
    provider: calls.at(-1)?.provider || "backend",
    model: calls.at(-1)?.model || "extractive-report",
    calls,
  };
}
