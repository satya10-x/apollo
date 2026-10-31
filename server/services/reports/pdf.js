import PDFDocument from "pdfkit";
import { fileURLToPath } from "node:url";
import { documentParts } from "./document.js";
const fonts = fileURLToPath(new URL("../../assets/fonts/", import.meta.url));
const colors = {
  ink: "#18222e",
  muted: "#637080",
  accent: "#356347",
  rule: "#d8e0dc",
  blue: "#225b85",
};
export function exportPDF(report, topic) {
  return new Promise((resolve, reject) => {
    const document = documentParts(report, topic);
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 76, bottom: 64, left: 58, right: 58 },
      bufferPages: true,
      info: {
        Title: document.title,
        Author: "Apollo - Deep Research Meta-Agent",
        Subject: "Evidence-backed research report",
        Creator: "Apollo report engine",
      },
    });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    try {
      doc.registerFont("Body", `${fonts}NotoSans-Regular.ttf`);
      doc.registerFont("Heading", `${fonts}NotoSans-Bold.ttf`);
      doc.registerFont("Devanagari", `${fonts}NotoSansDevanagari-Regular.ttf`);
      const frame = () => {
        const { x, y } = doc;
        doc.save();
        doc
          .font("Heading")
          .fontSize(8)
          .fillColor(colors.accent)
          .text("APOLLO / RESEARCH INTELLIGENCE", 58, 32, { lineBreak: false });
        doc
          .moveTo(58, 52)
          .lineTo(doc.page.width - 58, 52)
          .lineWidth(0.7)
          .strokeColor(colors.rule)
          .stroke();
        doc.restore();
        doc.x = x;
        doc.y = y;
      };

      const width = doc.page.width - 116;
      function writeText(text, options = {}) {
        const parts = String(text || "")
          .split(/([\u0900-\u097F]+)/g)
          .filter(Boolean);
        parts.forEach((part, index) => {
          doc
            .font(
              /[\u0900-\u097F]/.test(part)
                ? "Devanagari"
                : options.bold
                  ? "Heading"
                  : "Body",
            )
            .text(part, {
              width,
              lineGap: 3,
              ...options,
              continued: index < parts.length - 1 || Boolean(options.continued),
            });
        });
      }
      function ensureSpace(height = 70) {
        if (doc.y + height > doc.page.height - doc.page.margins.bottom)
          doc.addPage();
      }
      function paragraph(block) {
        ensureSpace(44);
        doc.font("Body").fontSize(10).fillColor(colors.ink);
        if (
          [
            "analysis",
            "opportunity",
            "risk",
            "qualification",
            "unavailable",
          ].includes(block.kind)
        ) {
          doc
            .font("Heading")
            .fontSize(8)
            .fillColor(colors.muted)
            .text(block.kind.toUpperCase());
          doc.moveDown(0.3);
          doc.font("Body").fontSize(10).fillColor(colors.ink);
        }
        const numbers = block.citationNumbers || [];
        if (block.kind === "legacy") {
          const parts = String(block.text || "")
            .split(/(\[\d+\])/g)
            .filter(Boolean);
          parts.forEach((part, index) => {
            const number = Number(part.match(/^\[(\d+)\]$/)?.[1]);
            const linked = document.references.some(
              (ref) => ref.number === number,
            );
            doc.fillColor(linked ? colors.blue : colors.ink);
            writeText(part, {
              continued: index < parts.length - 1,
              ...(linked ? { goTo: `reference-${number}` } : {}),
            });
          });
        } else {
          writeText(block.text, { continued: numbers.length > 0 });
          numbers.forEach((number, index) => {
            doc
              .font("Body")
              .fillColor(colors.blue)
              .text(` [${number}]`, {
                width,
                goTo: `reference-${number}`,
                continued: index < numbers.length - 1,
                lineGap: 3,
              });
          });
        }
        doc.fillColor(colors.ink).moveDown(0.7);
        if (block.qualification) {
          doc.fontSize(9).fillColor(colors.muted);
          writeText(block.qualification);
          doc.moveDown(0.7);
        }
      }
      doc.font("Heading").fontSize(27).fillColor(colors.ink);
      writeText(document.title, { bold: true });
      doc.moveDown(0.7);
      doc.font("Body").fontSize(9).fillColor(colors.muted);
      writeText(
        `Prepared by Apollo${report.createdAt ? ` | ${new Date(report.createdAt).toISOString().slice(0, 10)}` : ""} | ${document.references.length} sources`,
      );
      doc.moveDown(0.8);
      if (report.reviewSnapshot) {
        doc.fontSize(9).fillColor(colors.accent);
        writeText(
          `REVIEW: ${report.reviewSnapshot.decision.replaceAll("_", " ")}`,
        );
        doc.moveDown(0.8);
      }
      for (const part of document.parts) {
        ensureSpace(part.groupOnly ? 135 : 90);
        doc.addNamedDestination(part.id, "XYZ", null, doc.y, null);
        doc
          .font("Heading")
          .fontSize(part.level === 3 ? 12 : 15)
          .fillColor(colors.ink);
        writeText(part.title, { bold: true });
        doc.moveDown(0.6);
        for (const block of part.blocks) paragraph(block);
        doc.moveDown(0.6);
      }
      ensureSpace(100);
      doc.addNamedDestination("references", "XYZ", null, doc.y, null);
      doc.font("Heading").fontSize(16).fillColor(colors.ink).text("References");
      doc.moveDown(0.7);
      for (const ref of document.references) {
        ensureSpace(95);
        const url = new URL(ref.url);
        if (
          !["http:", "https:"].includes(url.protocol) ||
          url.username ||
          url.password
        )
          throw new Error("Invalid source URL in PDF export.");
        doc.addNamedDestination(
          `reference-${ref.number}`,
          "XYZ",
          null,
          doc.y,
          null,
        );
        doc.font("Heading").fontSize(10).fillColor(colors.ink);
        writeText(`[${ref.number}] ${ref.title}`, { bold: true });
        doc.moveDown(0.2);
        doc.font("Body").fontSize(8).fillColor(colors.muted);
        writeText(
          `${ref.domain} | ${ref.publishedAt ? new Date(ref.publishedAt).toISOString().slice(0, 10) : "Publication date unavailable"}`,
        );
        doc.moveDown(0.2);
        doc.fillColor(colors.blue);
        writeText(url.href, { link: url.href });
        doc.moveDown(1);
      }
      if (!document.references.length)
        paragraph({
          kind: "unavailable",
          text: "No source references are available.",
        });
      const range = doc.bufferedPageRange();
      for (
        let index = range.start;
        index < range.start + range.count;
        index++
      ) {
        doc.switchToPage(index);
        frame();
        const previousBottom = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        doc
          .font("Body")
          .fontSize(8)
          .fillColor(colors.muted)
          .text(`${index + 1} / ${range.count}`, 58, doc.page.height - 39, {
            width,
            align: "right",
            lineBreak: false,
          });
        doc.page.margins.bottom = previousBottom;
      }
      doc.end();
    } catch (error) {
      doc.destroy();
      reject(error);
    }
  });
}
