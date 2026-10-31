import { hash } from "./sources.js";
// Select verbatim spans from the retrieved API text, never model-generated prose.
export function extractPassages(
  source,
  question,
  { maxItems = 4, maxLength = 1400 } = {},
) {
  const text = source.content || "",
    wanted = new Set(question.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []);
  const spans = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + maxLength);
    if (end < text.length) {
      const boundary = text.lastIndexOf(" ", end);
      if (boundary > start + maxLength / 2) end = boundary;
    }
    const passage = text.slice(start, end);
    if (passage.trim().length >= 30) {
      const lower = passage.toLowerCase();
      const matches = [...wanted].filter((word) => lower.includes(word)).length;
      spans.push({
        passage,
        startOffset: start,
        endOffset: end,
        rank: matches + (/\d/.test(passage) ? 0.5 : 0),
      });
    }
    start = end;
    if (text[start] === " ") start++;
  }
  return spans
    .sort((a, b) => b.rank - a.rank || a.startOffset - b.startOffset)
    .slice(0, maxItems)
    .map(({ rank, ...span }) => ({
      ...span,
      passageHash: hash(span.passage),
      documentHash: source.documentHash,
      originalUrl: source.provenance.originalUrl,
      provider: source.provider,
      contentKind: source.contentKind,
      retrievedAt: source.retrievedAt,
      query: source.provenance.query,
      question,
      selectionMethod: "verbatim_query_overlap",
      origin: "external_api",
    }));
}
