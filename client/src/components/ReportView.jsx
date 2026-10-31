import { useState } from "react";
import { api } from "../api";
import { Link } from "react-router-dom";
import { ExternalLink, ArrowUpRight } from "lucide-react";
import LegacyReportView from "./LegacyReportView";
import ReportActions from "./ReportActions";
import { formatDate } from "../utils";
const kindLabel = {
  analysis: "Analysis",
  opportunity: "Opportunity",
  risk: "Risk",
  qualification: "Qualified finding",
  contradiction: "Source disagreement",
  unavailable: "Information unavailable",
};
function Block({ block, references, region }) {
  return (
    <div
      className={`report-block report-block-${block.kind}`}
      id={`${region}-${block.id}`}
    >
      {kindLabel[block.kind] && (
        <span className="report-block-kind">{kindLabel[block.kind]}</span>
      )}
      <p>
        {block.text}
        {(block.citationNumbers || []).map((number) => (
          <a
            key={number}
            className="citation"
            href={`#reference-${number}`}
            title={references.find((ref) => ref.number === number)?.title}
            aria-label={`Source ${number}: ${references.find((ref) => ref.number === number)?.title}`}
          >
            [{number}]
          </a>
        ))}
      </p>
      {block.qualification && (
        <p className="block-qualification">{block.qualification}</p>
      )}
    </div>
  );
}
function Empty({ children }) {
  return <p className="report-unavailable">{children}</p>;
}
export default function ReportView({
  report,
  session,
  sources,
  onReportUpdate,
}) {
  const [regenerating, setRegenerating] = useState(null),
    [revisionError, setRevisionError] = useState("");
  async function regenerate(sectionId) {
    setRegenerating(sectionId);
    setRevisionError("");
    try {
      const data = await api(`/sessions/${session._id}/report/regenerate`, {
        method: "POST",
        timeoutMs: 110000,
        body: JSON.stringify({ sectionId }),
      });
      onReportUpdate?.(data.report);
    } catch (error) {
      setRevisionError(error.message);
    } finally {
      setRegenerating(null);
    }
  }
  if (!report || report.formatVersion !== 2)
    return (
      <LegacyReportView report={report} session={session} sources={sources} />
    );
  const refs = report.references || [],
    parts = [
      ...report.executiveSummary,
      ...report.keyFindings,
      ...report.sections.flatMap((s) => s.blocks),
      ...report.contradictions,
      ...report.opportunities,
      ...report.risks,
      ...report.conclusion,
    ],
    blocks = new Map(parts.map((block) => [block.id, block]));
  const render = (items, region) =>
    items.map((block) => (
      <Block key={block.id} block={block} references={refs} region={region} />
    ));
  return (
    <div className="report-layout report-layout-v2">
      {revisionError && (
        <div className="error-notice report-revision-error" role="alert">
          {revisionError}
        </div>
      )}
      <aside className="report-toc">
        <span className="eyebrow">REPORT CONTENTS</span>
        <a href="#executive-summary">01 Executive summary</a>
        <a href="#objective-scope">02 Objective & scope</a>
        <a href="#key-findings">03 Key findings</a>
        <a href="#detailed-sections">04 Detailed research</a>
        {report.sections.map((section) => (
          <a
            className="toc-section"
            href={`#section-${section.sectionId}`}
            key={section.sectionId}
          >
            {section.title}
          </a>
        ))}
        <a href="#contradictions-limitations">05 Evidence limitations</a>
        <a href="#opportunities-risks">06 Opportunities & risks</a>
        <a href="#conclusion">07 Conclusion</a>
        <a href="#references">08 References</a>
        <ReportActions sessionId={session._id} />
      </aside>
      <article className="report-document consulting-report">
        <div className="report-cover">
          <span className="eyebrow">APOLLO / RESEARCH INTELLIGENCE</span>
          <h1>{report.title}</h1>
          <p className="report-byline">
            {formatDate(report.createdAt)} <span>·</span> {session.mode}{" "}
            research <span>·</span> {refs.length} cited sources
          </p>
          <div
            className={`review-outcome ${report.reviewSnapshot?.decision === "COMPLETE" ? "review-complete" : ""}`}
          >
            <strong>
              {report.reviewSnapshot?.decision === "COMPLETE"
                ? "Research requirements met"
                : "Research completed with evidence limitations"}
            </strong>
            <p>
              {report.reviewSnapshot?.decision
                ?.replaceAll("_", " ")
                .toLowerCase()}
              .{" "}
              <Link to={`/research/${session._id}`}>
                Inspect the evidence review <ArrowUpRight size={12} />
              </Link>
            </p>
          </div>
        </div>
        <section id="executive-summary" className="executive-panel">
          <span className="report-section-number">01 / OVERVIEW</span>
          <h2>Executive Summary</h2>
          {report.executiveSummary.length ? (
            render(report.executiveSummary, "summary")
          ) : (
            <Empty>
              No verified findings were available for an executive summary.
            </Empty>
          )}
        </section>
        <section id="objective-scope">
          <span className="report-section-number">02 / RESEARCH MANDATE</span>
          <h2>Research Objective and Scope</h2>
          <p>{report.objective}</p>
          <p className="scope-text">{report.scope}</p>
        </section>
        <section id="key-findings">
          <span className="report-section-number">03 / FINDINGS</span>
          <h2>Key Findings</h2>
          {report.keyFindings.length ? (
            render(report.keyFindings, "findings")
          ) : (
            <Empty>
              No findings met the report’s verification requirements.
            </Empty>
          )}
        </section>
        <section id="detailed-sections">
          <span className="report-section-number">04 / DETAILED RESEARCH</span>
          <h2>Detailed Research Sections</h2>
          {report.sections.map((section, index) => (
            <section
              className="detailed-report-section"
              id={`section-${section.sectionId}`}
              key={section.sectionId}
            >
              <div className="detail-heading">
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{section.title}</h3>
                {onReportUpdate && (
                  <button
                    className="subtle-button regenerate-section"
                    disabled={!!regenerating || !section.blocks?.length}
                    onClick={() => regenerate(section.sectionId)}
                    title="Rewrite using existing verified evidence, then update the summary and citations. No new searches."
                  >
                    {regenerating === section.sectionId
                      ? "Regenerating & assembling…"
                      : "Regenerate section"}
                  </button>
                )}
              </div>
              {render(section.blocks, section.sectionId)}
              {section.unavailableQuestions.map((question) => (
                <div className="report-question-gap" key={question.questionId}>
                  <strong>{question.question}</strong>
                  <p>{question.reason}</p>
                </div>
              ))}
              {!section.blocks.length &&
                !section.unavailableQuestions.length && (
                  <Empty>
                    No verified evidence was available for this section.
                  </Empty>
                )}
            </section>
          ))}
        </section>
        <section id="contradictions-limitations">
          <span className="report-section-number">
            05 / EVIDENCE QUALIFICATIONS
          </span>
          <h2>Contradictions and Evidence Limitations</h2>
          {report.contradictions.length ? (
            render(report.contradictions, "conflicts")
          ) : (
            <p className="report-unavailable">
              No contradictions were established in the reviewed comparison set.
              This does not prove their absence.
            </p>
          )}
          <ul className="report-limitations">
            {report.limitations.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </section>
        <section id="opportunities-risks">
          <span className="report-section-number">06 / IMPLICATIONS</span>
          <h2>Future Opportunities and Risks</h2>
          {report.opportunities.length || report.risks.length ? (
            <>
              {render(report.opportunities, "opportunities")}
              {render(report.risks, "risks")}
            </>
          ) : (
            <Empty>
              No additional opportunity or risk assessment met the grounding
              requirements.
            </Empty>
          )}
        </section>
        <section id="conclusion">
          <span className="report-section-number">07 / CONCLUSION</span>
          <h2>Conclusion</h2>
          {report.conclusion.length ? (
            render(report.conclusion, "conclusion")
          ) : (
            <Empty>
              The available verified evidence does not support a substantive
              conclusion. Remaining questions are disclosed above.
            </Empty>
          )}
        </section>
        <section id="references">
          <span className="report-section-number">08 / REFERENCES</span>
          <h2>References</h2>
          <p className="reference-intro">
            Citations link to the original sources. Expand a reference to
            inspect the passages supporting the report.
          </p>
          {refs.map((ref) => (
            <div
              className="report-reference"
              key={ref.number}
              id={`reference-${ref.number}`}
              tabIndex={-1}
            >
              <span className="reference-number">[{ref.number}]</span>
              <div>
                <a
                  className="reference-title"
                  href={ref.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {ref.title}
                  <ExternalLink size={13} />
                </a>
                <p>
                  {ref.domain} ·{" "}
                  {ref.publishedAt
                    ? formatDate(ref.publishedAt)
                    : "Publication date unavailable"}
                </p>
                <a
                  className="original-url"
                  href={ref.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {ref.url}
                </a>
                <details className="reference-trace">
                  <summary>Supporting claims & passages</summary>
                  {(report.sourceMappings || [])
                    .filter((mapping) =>
                      mapping.sourceIds.includes(ref.sourceId),
                    )
                    .map((mapping) => (
                      <div key={mapping.blockId}>
                        <strong>
                          {kindLabel[mapping.kind] || "Reviewed fact"}
                        </strong>
                        <p>{blocks.get(mapping.blockId)?.text}</p>
                        {mapping.citations
                          .filter((c) => c.sourceId === ref.sourceId)
                          .map((citation, i) => (
                            <blockquote key={i}>{citation.quote}</blockquote>
                          ))}
                      </div>
                    ))}
                </details>
              </div>
            </div>
          ))}
          {!refs.length && <Empty>No source references are available.</Empty>}
        </section>
      </article>
    </div>
  );
}
