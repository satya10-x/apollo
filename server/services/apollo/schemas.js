import { z } from "zod";
const text = z.string().trim().min(1).max(2000);
const id = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/);
export const priorities = ["high", "medium", "low"];
export const blueprintSchema = z
  .object({
    objective: text,
    scope: text,
    domain: text,
    complexity: z.enum(["focused", "moderate", "complex"]),
    dimensions: z.array(text).min(1).max(12),
    informationNeeds: z.array(text).min(1).max(16),
    sections: z
      .array(
        z.object({
          id,
          title: z.string().trim().min(1).max(200),
          priority: z.enum(priorities),
          dependsOn: z.array(id).max(7),
          subQuestions: z
            .array(
              z.object({
                id,
                question: text,
                queries: z
                  .array(z.string().trim().min(1).max(500))
                  .min(1)
                  .max(3),
                expectedEvidence: z.array(text).min(1).max(5),
              }),
            )
            .min(1)
            .max(3),
        }),
      )
      .min(4)
      .max(8),
  })
  .superRefine((plan, ctx) => {
    const ids = new Set(plan.sections.map((s) => s.id));
    const questionIds = plan.sections.flatMap((s) =>
      s.subQuestions.map((q) => q.id),
    );
    if (
      ids.size !== plan.sections.length ||
      new Set(questionIds).size !== questionIds.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Section and sub-question IDs must be unique.",
      });
    const titles = plan.sections.map((s) => s.title.toLowerCase());
    if (new Set(titles).size !== titles.length)
      ctx.addIssue({
        code: "custom",
        message: "Section titles must be unique.",
      });
    const visited = new Set(),
      visiting = new Set();
    function visit(section) {
      if (visiting.has(section.id)) return false;
      if (visited.has(section.id)) return true;
      visiting.add(section.id);
      for (const dependency of section.dependsOn) {
        const parent = plan.sections.find((s) => s.id === dependency);
        if (!parent || !visit(parent)) return false;
      }
      visiting.delete(section.id);
      visited.add(section.id);
      return true;
    }
    if (!plan.sections.every(visit))
      ctx.addIssue({
        code: "custom",
        message:
          "Dependencies must reference existing sections and form an acyclic graph.",
      });
  });
export const findingSchema = z.object({
  summary: text,
  claims: z
    .array(
      z.object({
        statement: text,
        sourceIds: z.array(z.string().min(1)).min(1).max(12),
        evidenceIds: z.array(z.string().min(1)).min(1).max(12),
      }),
    )
    .max(12),
  limitations: z.array(text).max(8),
});
// Historical review contract; active Hermes audit schemas live in services/hermes/schemas.js.
export const reviewSchema = z.object({
  coverage: z.number().min(0).max(100),
  readyForReport: z.boolean(),
  rationale: text,
  sections: z
    .array(
      z.object({
        sectionId: id,
        coverage: z.number().min(0).max(100),
        assessment: text,
      }),
    )
    .min(4)
    .max(8),
  gaps: z
    .array(
      z.object({
        sectionId: id,
        description: text,
        priority: z.enum(priorities),
        queries: z.array(z.string().trim().min(1).max(500)).min(1).max(3),
      }),
    )
    .max(16),
});
export const reportSchema = z.object({
  summary: z.string().trim().min(1).max(15000),
  sections: z
    .array(
      z.object({
        sectionId: id,
        title: z.string().min(1).max(200),
        body: z.string().min(1).max(20000),
      }),
    )
    .min(4)
    .max(8),
  limitations: z.array(text).max(24),
});
export function validateSectionReferences(output, plan) {
  const ids = new Set(plan.sections.map((s) => s.id));
  if (
    output.sections.length !== ids.size ||
    new Set(output.sections.map((s) => s.sectionId)).size !== ids.size ||
    output.sections.some((s) => !ids.has(s.sectionId)) ||
    output.gaps?.some((g) => !ids.has(g.sectionId))
  )
    throw new Error(
      "Agent output must reference every planned section exactly once and no unknown sections.",
    );
  return output;
}
