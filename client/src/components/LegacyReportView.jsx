import { BookOpen, Download, ExternalLink } from "lucide-react";
import ReportActions from "./ReportActions";
import { EmptyState } from "./UI";
import { formatDate as date } from "../utils";
function CitedText({ text, sources }) {
  return (
    <>
      {String(text || "")
        .split(/(\[\d+\])/g)
        .map((part, i) => {
          const match = part.match(/^\[(\d+)\]$/);
          if (!match) return part;
          const index = Number(match[1]) - 1;
          return sources[index] ? (
            <a
              className="citation"
              key={i}
              href={`#reference-${index + 1}`}
              title={sources[index].title}
            >
              {part}
            </a>
          ) : (
            part
          );
        })}
    </>
  );
}
export default function ReportView({ report, session, sources }) {
  if (!report)
    return (
      <EmptyState
        icon={BookOpen}
        title={
          ["failed", "cancelled"].includes(session.status)
            ? "This research did not produce a report"
            : "Your report is taking shape"
        }
        description={
          ["failed", "cancelled"].includes(session.status)
            ? "Start a new research session to try again."
            : "Apollo will assemble the cited report after research and evidence review finish."
        }
      />
    );
  return (
    <div className="report-layout">
      <aside className="report-toc">
        <span className="eyebrow">IN THIS REPORT</span>
        <a href="#executive-summary">Executive summary</a>
        {report.sections.map((s, i) => (
          <a href={`#section-${i}`} key={i}>
            {s.title}
          </a>
        ))}
        <a href="#limitations">Limitations</a>
        <a href="#references">References</a>
        <ReportActions sessionId={session._id} />
        <button className="subtle-button" onClick={() => window.print()}>
          Print / Save PDF <ExternalLink size={13} />
        </button>
      </aside>
      <article className="report-document">
        <span className="eyebrow">APOLLO RESEARCH REPORT</span>
        <h1>{session.topic}</h1>
        <p className="report-byline">
          {date(report.createdAt)} · {sources.length} sources · {session.mode}{" "}
          research
        </p>
        {report.reviewSnapshot && (
          <div className="report-review-status">
            <strong>
              Research review:{" "}
              {report.reviewSnapshot.decision
                .replaceAll("_", " ")
                .toLowerCase()}
            </strong>
            <p>
              Quality indicator:{" "}
              {report.reviewSnapshot.quality?.score ?? "unavailable"}/100. See
              the research workspace for its breakdown.
            </p>
            {report.reviewSnapshot.decision !== "COMPLETE" && (
              <p>
                Research limits were reached with unresolved evidence gaps. Read
                the limitations before relying on the findings.
              </p>
            )}
          </div>
        )}
        <section id="executive-summary">
          <h2>Executive summary</h2>
          <p>
            <CitedText text={report.summary} sources={sources} />
          </p>
        </section>
        {report.sections.map((s, i) => (
          <section key={i} id={`section-${i}`}>
            <h2>{s.title}</h2>
            <p>
              <CitedText text={s.body} sources={sources} />
            </p>
          </section>
        ))}
        <section id="limitations">
          <h2>Limitations</h2>
          <ul>
            {report.limitations.map((l, i) => (
              <li key={i}>
                <CitedText text={l} sources={sources} />
              </li>
            ))}
          </ul>
        </section>
        <section id="references">
          <h2>References</h2>
          <ol className="references">
            {sources.map((s, i) => (
              <li key={s._id} id={`reference-${i + 1}`}>
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.title}
                  <ExternalLink size={12} />
                </a>
                <span>{s.domain}</span>
              </li>
            ))}
          </ol>
        </section>
      </article>
    </div>
  );
}
