// One presentation contract drives both file exports. Historical reports remain readable.
export function documentParts(report, topic = "Research report") {
  if (report.formatVersion !== 2)
    return {
      title: report.title || topic,
      references: report.references || [],
      parts: [
        {
          id: "executive-summary",
          title: "Executive Summary",
          blocks: [{ kind: "legacy", text: report.summary || "" }],
        },
        {
          id: "detailed-sections",
          title: "Detailed Research Sections",
          blocks: [],
          groupOnly: true,
        },
        ...report.sections.map((section, i) => ({
          id: `section-${i}`,
          title: section.title,
          blocks: [{ kind: "legacy", text: section.body }],
        })),
        {
          id: "limitations",
          title: "Evidence Limitations",
          blocks: [
            ...(report.limitations || []).map((text) => ({
              kind: "metadata",
              text,
            })),
            {
              kind: "metadata",
              text: "Legacy report: original claim/evidence mappings are unavailable.",
            },
          ],
        },
      ],
    };
  const empty = (text) => ({ kind: "unavailable", text });
  const content = (items, message) => (items.length ? items : [empty(message)]);
  return {
    title: report.title,
    references: report.references,
    parts: [
      {
        id: "executive-summary",
        title: "Executive Summary",
        blocks: content(
          report.executiveSummary,
          "No verified findings were available for an executive summary.",
        ),
      },
      {
        id: "objective-scope",
        title: "Research Objective and Scope",
        blocks: [
          { kind: "metadata", text: report.objective },
          { kind: "metadata", text: report.scope },
        ],
      },
      {
        id: "key-findings",
        title: "Key Findings",
        blocks: content(
          report.keyFindings,
          "No findings met the report’s verification requirements.",
        ),
      },
      {
        id: "detailed-sections",
        title: "Detailed Research Sections",
        blocks: [],
        groupOnly: true,
      },
      ...report.sections.map((section, i) => ({
        id: `section-${section.sectionId}`,
        title: section.title,
        group: "Detailed Research Sections",
        level: 3,
        blocks: [
          ...section.blocks,
          ...section.unavailableQuestions.map((q) =>
            empty(`Unavailable answer: ${q.question} ${q.reason}`),
          ),
        ],
        sectionIndex: i,
      })),
      {
        id: "contradictions-limitations",
        title: "Contradictions and Evidence Limitations",
        blocks: [
          ...report.contradictions,
          ...report.limitations.map((text) => ({ kind: "metadata", text })),
        ],
      },
      {
        id: "opportunities-risks",
        title: "Future Opportunities and Risks",
        blocks: content(
          [...report.opportunities, ...report.risks],
          "No additional opportunity or risk assessment met the grounding requirements.",
        ),
      },
      {
        id: "conclusion",
        title: "Conclusion",
        blocks: content(
          report.conclusion,
          "The available verified evidence does not support a substantive conclusion. Remaining questions are disclosed above.",
        ),
      },
    ],
  };
}
export function legacyReferences(sources) {
  return sources.map((s, index) => ({
    number: index + 1,
    sourceId: String(s._id),
    title: s.title,
    url: s.url,
    domain: s.domain,
    publishedAt: s.publishedAt || null,
  }));
}
