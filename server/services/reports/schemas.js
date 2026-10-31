import { z } from "zod";
const id = z.string().min(1).max(120);
export const sectionWriterSchema = z.object({
  sectionId: id,
  claimIds: z.array(id).max(6),
  analyses: z
    .array(
      z.object({
        id,
        kind: z.enum(["analysis", "opportunity", "risk"]),
        text: z.string().trim().min(1).max(700),
        claimIds: z.array(id).min(1).max(5),
      }),
    )
    .max(3),
});
export const groundingSchema = z.object({
  assessments: z
    .array(
      z.object({
        analysisId: id,
        verdict: z.enum(["SUPPORTED_INFERENCE", "UNSUPPORTED"]),
        reason: z.string().min(1).max(500),
        grounding: z
          .array(
            z.object({ evidenceId: id, quote: z.string().min(20).max(600) }),
          )
          .max(6),
      }),
    )
    .max(3),
});
export const assemblySchema = z.object({
  executiveSummary: z.array(id).max(4),
  keyFindings: z.array(id).max(6),
  opportunities: z.array(id).max(4),
  risks: z.array(id).max(4),
  conclusion: z.array(id).max(3),
});
