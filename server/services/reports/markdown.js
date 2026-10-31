import { documentParts } from "./document.js";
export const escapeMarkdown = (value) =>
  String(value || "").replace(/([\\`*_{}\[\]<>#|])/g, "\\$1");
const date = (value) =>
  value
    ? new Date(value).toISOString().slice(0, 10)
    : "Publication date unavailable";
export function exportMarkdown(report, topic) {
  const document = documentParts(report, topic),
    lines = [`# ${escapeMarkdown(document.title)}`, ""];
  if (report.reviewSnapshot) {
    lines.push(
      `Research review: **${escapeMarkdown(report.reviewSnapshot.decision.replaceAll("_", " "))}**`,
      "",
    );
  }
  for (const part of document.parts) {
    lines.push(
      `${part.level === 3 ? "###" : "##"} ${escapeMarkdown(part.title)}`,
      "",
    );
    for (const block of part.blocks) {
      const label = [
        "analysis",
        "opportunity",
        "risk",
        "qualification",
        "unavailable",
      ].includes(block.kind)
        ? `**${block.kind[0].toUpperCase() + block.kind.slice(1)}.** `
        : "";
      const citations = (block.citationNumbers || [])
        .map((number) => `[${number}](#reference-${number})`)
        .join(" ");
      const text =
        block.kind === "legacy"
          ? String(block.text)
              .split(/(\[\d+\])/g)
              .map((token) => {
                const match = token.match(/^\[(\d+)\]$/);
                return match &&
                  document.references.some(
                    (ref) => ref.number === Number(match[1]),
                  )
                  ? `[${match[1]}](#reference-${match[1]})`
                  : escapeMarkdown(token);
              })
              .join("")
          : escapeMarkdown(block.text);
      lines.push(`${label}${text}${citations ? ` ${citations}` : ""}`, "");
      if (block.qualification)
        lines.push(`> ${escapeMarkdown(block.qualification)}`, "");
    }
  }
  lines.push("## References", "");
  for (const ref of document.references) {
    const url = new URL(ref.url);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error("Invalid source URL in report export.");
    lines.push(
      `<a id="reference-${ref.number}"></a>`,
      `[${ref.number}] [${escapeMarkdown(ref.title)}](<${url.href}>)`,
      `${escapeMarkdown(ref.domain)} · ${date(ref.publishedAt)}`,
      "",
    );
  }
  if (!document.references.length)
    lines.push("No source references are available.", "");
  return lines.join("\n");
}
