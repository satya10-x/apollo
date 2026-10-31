// Keep every source's reference number stable while bounding the model context.
export function buildEvidence(sources, evidence = []) {
  const excerptLimit = Math.min(
    4000,
    Math.floor(70000 / Math.max(sources.length, 1)),
  );
  return sources.map((source, index) => ({
    number: index + 1,
    sourceId: source._id ? String(source._id) : undefined,
    sectionIds: source.sectionIds,
    sections: source.sections,
    title: source.title,
    url: source.url,
    section: source.section,
    assessment: source.assessment,
    excerpts: evidence
      .filter((item) => String(item.source) === String(source._id))
      .slice(0, 4)
      .map((item) => ({
        evidenceId: String(item._id),
        passage: item.passage.slice(0, Math.floor(excerptLimit / 4)),
        origin: item.origin,
      })),
    // Legacy sessions only: new retrieval writes passages exclusively to Evidence.
    content: evidence.length
      ? undefined
      : String(source.content || "").slice(0, excerptLimit),
  }));
}

export function validateCitations(report, sourceCount) {
  for (const text of [
    report.summary,
    ...report.sections.map((section) => section.body),
  ]) {
    const citations = [...text.matchAll(/\[(\d+)\]/g)];
    if (!citations.length)
      throw new Error(
        "The report omitted source citations. Start a new research session to retry.",
      );
    if (
      citations.some(
        (match) => Number(match[1]) < 1 || Number(match[1]) > sourceCount,
      )
    ) {
      throw new Error(
        "The report contained an invalid source citation. Start a new research session to retry.",
      );
    }
  }
}
