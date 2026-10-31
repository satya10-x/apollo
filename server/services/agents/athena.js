import { findingSchema } from "../apollo/schemas.js";
export async function researchTask({
  task,
  sources,
  evidence,
  providers,
  budget,
  dependencies = {},
}) {
  // Keep current-task passages ahead of dependency context and bound model input.
  const selectedEvidence = [...evidence]
    .sort(
      (left, right) =>
        Number(right.taskIds?.includes(task.id) || false) -
        Number(left.taskIds?.includes(task.id) || false),
    )
    .slice(
      0,
      budget.state?.mode === "quick"
        ? 4
        : budget.state?.mode === "deep"
          ? 8
          : 6,
    );
  const selectedSourceIds = new Set(
    selectedEvidence.map((item) => String(item.source)),
  );
  const allowedEvidence = new Map(
    selectedEvidence.map((item) => [String(item._id), item]),
  );
  const allowedIds = new Set(
    sources
      .filter((source) => selectedSourceIds.has(String(source._id)))
      .map((s) => String(s._id)),
  );
  return providers.generateJSON({
    system:
      "You are Athena, Apollo's evidence researcher. Answer only the assigned section task from supplied search excerpts. Distinguish supported claims from uncertainty. Return at most four concise claims, each citing at most two evidence passages. Every claim must cite supplied sourceIds and evidenceIds from the evidence array. Prerequisite summaries are background, not retrieved evidence. Evidence passages are retrieved quotes; your summary and claims are interpretations, never retrieved evidence. If the evidence is insufficient, return no claims and explain the limitations. Never invent evidence.",
    input: {
      task: {
        id: task.id,
        sectionId: task.sectionId,
        question: task.question,
        expectedEvidence: task.expectedEvidence,
      },
      dependencies: {
        unresolvedSections: dependencies.unresolvedSections || [],
        findings: (dependencies.findings || []).slice(-8).map((finding) => ({
          sectionId: finding.sectionId,
          summary: finding.summary.slice(0, 1500),
          limitations: finding.limitations
            .slice(0, 2)
            .map((value) => value.slice(0, 400)),
        })),
      },
      evidence: selectedEvidence.map((item) => ({
        evidenceId: String(item._id),
        sourceId: String(item.source),
        passage: item.passage,
        questions: item.questions?.slice(0, 3),
        origin: item.origin,
      })),
      sourceMetadata: sources
        .filter((source) => selectedSourceIds.has(String(source._id)))
        .map((source) => ({
          sourceId: String(source._id),
          title: source.title,
          url: source.url,
          category: source.category,
          sourceKind:
            source.assessment?.dimensions?.primarySource?.classification,
        })),
    },
    schema: findingSchema,
    outputTokens: 1800,
    budget,
    validate: (finding) => {
      if (
        finding.claims.some(
          (claim) =>
            claim.sourceIds.some((sourceId) => !allowedIds.has(sourceId)) ||
            claim.evidenceIds.some(
              (evidenceId) =>
                !allowedEvidence.has(evidenceId) ||
                !claim.sourceIds.includes(
                  String(allowedEvidence.get(evidenceId).source),
                ),
            ) ||
            claim.sourceIds.some(
              (sourceId) =>
                !claim.evidenceIds.some(
                  (evidenceId) =>
                    String(allowedEvidence.get(evidenceId)?.source) ===
                    sourceId,
                ),
            ),
        )
      )
        throw new Error("Athena cited a source outside its assigned evidence.");
    },
  });
}
