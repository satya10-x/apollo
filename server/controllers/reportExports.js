import { z } from "zod";
import { ResearchSession, Source, Report } from "../models/index.js";
import { AppError } from "../middleware/errors.js";
import { legacyReferences } from "../services/reports/document.js";
import { exportMarkdown } from "../services/reports/markdown.js";
import { exportPDF } from "../services/reports/pdf.js";
export async function exportReport(req, res) {
  const { format } = z
    .object({ format: z.enum(["markdown", "pdf"]) })
    .parse(req.query);
  const session = await ResearchSession.findById(req.params.id).select(
    "status topic",
  );
  if (!session) throw new AppError("Research session not found.", 404);
  if (session.status !== "completed")
    throw new AppError(
      "The report is not available until research and report generation finish.",
      409,
    );
  const stored = await Report.findOne({ session: req.params.id }).lean();
  if (!stored) throw new AppError("Report not found.", 404);
  if (stored.formatVersion !== 2) {
    const sources = await Source.find({ session: req.params.id })
      .sort({ createdAt: 1, _id: 1 })
      .lean();
    stored.references = legacyReferences(sources);
  }
  const result =
    format === "pdf"
      ? await exportPDF(stored, session.topic)
      : exportMarkdown(stored, session.topic);
  res.set({
    "Content-Type":
      format === "pdf" ? "application/pdf" : "text/markdown; charset=utf-8",
    "Content-Disposition": `attachment; filename="apollo-report-${req.params.id}.${format === "pdf" ? "pdf" : "md"}"`,
    "Cache-Control": "private, no-store",
  });
  res.send(result);
}
