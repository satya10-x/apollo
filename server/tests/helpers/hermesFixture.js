import { createHash } from "node:crypto";
import { resolveLimits } from "../../services/apollo/policies.js";
export function hermesFixture() {
  const now = new Date("2026-10-31T00:00:00Z");
  const blueprint = {
    objective: "Assess agricultural crop monitoring evidence",
    scope: "Current Indian agricultural research",
    domain: "Agriculture",
    complexity: "moderate",
    dimensions: ["Coverage", "Adoption"],
    informationNeeds: ["Official sources"],
    sections: Array.from({ length: 4 }, (_, i) => ({
      id: `s${i}`,
      title: `Section ${i}`,
      priority: "high",
      dependsOn: [],
      subQuestions: [
        {
          id: `q${i}`,
          question: `What evidence answers question ${i}?`,
          queries: [`original query ${i}`],
          expectedEvidence: ["Official statistics"],
        },
      ],
    })),
  };
  const sources = Array.from({ length: 8 }, (_, i) => ({
    _id: `source${i}`,
    session: "session",
    domain: `department${i % 2}.gov.in`,
    url: `https://department${i % 2}.gov.in/report${i}`,
    title: `Official source ${i}`,
    category: "Government",
    publishedAt: new Date("2026-07-01"),
    sectionIds: [`s${Math.floor(i / 2)}`],
    assessment: {
      score: 80,
      dimensions: { primarySource: { classification: "likely_primary" } },
    },
  }));
  const evidence = sources.map((source, i) => {
    const passage = `Official evidence ${i}: the crop monitoring programme covered ${10 + i} districts in the 2026 reporting period.`;
    return {
      _id: `e${i}`,
      session: "session",
      source: source._id,
      passage,
      passageHash: createHash("sha256").update(passage).digest("hex"),
      origin: "external_api",
      sectionIds: source.sectionIds,
      taskIds: [`task${Math.floor(i / 2)}`],
    };
  });
  const findings = blueprint.sections.map((section, i) => ({
    taskId: `task${i}`,
    sectionId: section.id,
    summary: "This is an AI summary, not evidence.",
    claims: [
      {
        statement: `The programme covered ${10 + i * 2} districts.`,
        sourceIds: [`source${i * 2}`],
        evidenceIds: [`e${i * 2}`],
      },
    ],
    limitations: [],
  }));
  const state = {
    _id: "session",
    mode: "standard",
    topic: "Crop monitoring in India",
    blueprint,
    findings,
    tasks: blueprint.sections.map((section, i) => ({
      id: `task${i}`,
      sectionId: section.id,
      status: "completed",
      queries: [`original query ${i}`],
      sourceIds: [`source${i * 2}`, `source${i * 2 + 1}`],
    })),
    reviews: [],
    round: 1,
    sourceIds: sources.map((s) => s._id),
    limits: resolveLimits("standard", 3),
    usage: { searchRequests: 4 },
  };
  return { state, sources, evidence, now, budget: { check() {} } };
}
