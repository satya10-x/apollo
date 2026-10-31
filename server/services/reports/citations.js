import { fingerprint } from "../hermes/context.js";
import { canonicalizeUrl } from "../athena/sources.js";
export function materializeCitations(report, sources, evidence) {
  const evidenceMap = new Map(
    evidence.map((record) => [String(record._id), record]),
  );
  const sourceMap = new Map(
    sources.map((source) => [String(source._id), source]),
  );
  const numbers = new Map(),
    mappings = new Map();
  const mapBlock = (block, location) => {
    if (!block.sourceIds?.length) {
      if (
        [
          "fact",
          "analysis",
          "opportunity",
          "risk",
          "qualification",
          "contradiction",
        ].includes(block.kind)
      )
        throw new Error(
          "A factual or interpretive report block has no source support.",
        );
      return { ...block, citationNumbers: [], renderedText: block.text };
    }
    for (const id of block.sourceIds) {
      const source = sourceMap.get(id);
      if (!source)
        throw new Error("Report references an invented or unavailable source.");
      canonicalizeUrl(source.url);
      if (!numbers.has(id)) numbers.set(id, numbers.size + 1);
    }
    if (
      !block.evidenceIds?.length ||
      !block.citations?.length ||
      block.citations.some(
        (c) =>
          !block.sourceIds.includes(c.sourceId) ||
          !block.evidenceIds.includes(c.evidenceId),
      )
    )
      throw new Error(
        "A report block has an incomplete source-to-evidence mapping.",
      );
    if (
      new Set(block.sourceIds).size !== block.sourceIds.length ||
      block.sourceIds.some(
        (id) => !block.citations.some((c) => c.sourceId === id),
      ) ||
      block.evidenceIds.some(
        (id) => !block.citations.some((c) => c.evidenceId === id),
      ) ||
      block.citations.some(
        (c) =>
          !evidenceMap.has(c.evidenceId) ||
          String(evidenceMap.get(c.evidenceId).source) !== c.sourceId ||
          !evidenceMap.get(c.evidenceId).passage.includes(c.quote),
      )
    )
      throw new Error(
        "Citation mappings must resolve to the actual supporting passage and source.",
      );
    const citationNumbers = block.sourceIds.map((id) => numbers.get(id));
    const renderedText = `${block.text} ${citationNumbers.map((number) => `[${number}]`).join(" ")}`;
    const existing = mappings.get(block.id);
    if (existing && existing.textHash !== fingerprint(block.text))
      throw new Error("A block ID cannot refer to different factual text.");
    const mapping = existing || {
      blockId: block.id,
      sectionId: block.sectionId || null,
      kind: block.kind,
      textHash: fingerprint(block.text),
      claimIds: block.claimIds || [],
      sourceIds: block.sourceIds,
      evidenceIds: block.evidenceIds,
      citationNumbers,
      citations: block.citations,
      occurrences: [],
    };
    mapping.occurrences.push(location);
    mappings.set(block.id, mapping);
    return { ...block, citationNumbers, renderedText };
  };
  const part = (name, items) =>
    items.map((block, index) => mapBlock(block, `${name}/${index}`));
  const executiveSummary = part("executiveSummary", report.executiveSummary),
    keyFindings = part("keyFindings", report.keyFindings);
  const sections = report.sections.map((section) => {
    const blocks = part(`sections/${section.sectionId}`, section.blocks);
    return {
      ...section,
      blocks,
      body: blocks.map((block) => block.renderedText).join("\n\n"),
    };
  });
  const contradictions = part("contradictions", report.contradictions),
    opportunities = part("opportunities", report.opportunities),
    risks = part("risks", report.risks),
    conclusion = part("conclusion", report.conclusion);
  const references = [...numbers].map(([sourceId, number]) => {
    const source = sourceMap.get(sourceId);
    return {
      number,
      sourceId,
      title: source.title,
      url: source.url,
      domain: source.domain,
      category: source.category,
      publishedAt: source.publishedAt || null,
      retrievedAt: source.retrievedAt || source.createdAt || null,
      originalUrls: source.originalUrls?.length
        ? source.originalUrls
        : [source.url],
      claimIds: [
        ...new Set(
          [...mappings.values()]
            .filter((m) => m.sourceIds.includes(sourceId))
            .flatMap((m) => m.claimIds),
        ),
      ],
      blockIds: [...mappings.values()]
        .filter((m) => m.sourceIds.includes(sourceId))
        .map((m) => m.blockId),
    };
  });
  return {
    ...report,
    executiveSummary,
    keyFindings,
    sections,
    contradictions,
    opportunities,
    risks,
    conclusion,
    references,
    sourceMappings: [...mappings.values()],
    summary:
      executiveSummary.map((b) => b.renderedText).join("\n\n") ||
      "No verified findings were available for an executive summary.",
  };
}
