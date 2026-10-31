import { formatDate } from "../utils";
const label = (text) => String(text).replaceAll("_", " ").toLowerCase();
export default function HermesReview({ review, terminal }) {
  if (!review?.quality)
    return (
      <section className="panel">
        <h2 className="execution-title">Hermes evidence review</h2>
        <p className="muted">
          {terminal
            ? "This session ended before an evidence review was completed. Collected sources and activity remain available."
            : "Question coverage, claim verification and quality metrics appear after evidence is reviewed."}
        </p>
      </section>
    );
  return (
    <section className="panel hermes-review">
      <div className="section-title">
        <h2>Hermes evidence review</h2>
        <span
          className={`badge ${review.decision === "COMPLETE" ? "completed" : "unavailable"}`}
        >
          {label(review.decision)}
        </span>
      </div>
      <div className="review-score">
        <strong>
          {review.quality.score}
          <span> / 100</span>
        </strong>
        <p>{review.rationale}</p>
      </div>
      <p className="small-muted">{review.quality.disclaimer}</p>
      <details className="review-detail">
        <summary>Quality score breakdown</summary>
        {Object.entries(review.quality.components).map(([key, item]) => (
          <div className="review-metric" key={key}>
            <div>
              <strong>{key.replace(/([A-Z])/g, " $1")}</strong>
              <span>
                {item.score === null ? "N/A" : `${item.score}/100`} · weight{" "}
                {Math.round(item.weight * 100)}%
              </span>
            </div>
            <p>{item.explanation}</p>
            <span className="small-muted">
              Measured: {item.measured} / {item.total} · {label(item.status)}
            </span>
          </div>
        ))}
        <p className="small-muted">{review.quality.formula}</p>
      </details>
      <div className="review-audit-summary">
        {review.inspection.inspectedEvidenceRecords} /{" "}
        {review.inspection.evidenceRecords} evidence records inspected ·{" "}
        {review.inspection.reviewedClaims} / {review.inspection.claimCount}{" "}
        claims reviewed
      </div>
      {!review.inspection.complete && (
        <p className="review-warning">
          Inspection is incomplete. Missing or unreviewed evidence does not
          count as support.
        </p>
      )}
      <details className="review-detail">
        <summary>Question and source coverage</summary>
        {review.sections.map((section) => (
          <div className="review-section" key={section.sectionId}>
            <strong>
              {section.title} · {section.coverage}%
            </strong>
            <p className="small-muted">{section.assessment}</p>
            {section.questions.map((question) => (
              <div className="review-question" key={question.questionId}>
                <span className="label-pill">{label(question.status)}</span>
                <p>{question.question}</p>
                <span className="small-muted">{question.reason}</span>
              </div>
            ))}
          </div>
        ))}
      </details>
      <details className="review-detail">
        <summary>Claim verification ({review.claimReviews.length})</summary>
        {review.claimReviews.map((claim) => (
          <div className="review-claim" key={claim.claimId}>
            <span
              className={`badge ${claim.classification === "SUPPORTED" ? "completed" : "unavailable"}`}
            >
              {label(claim.classification)}
            </span>
            <p>{claim.statement}</p>
            <p className="small-muted">{claim.reason}</p>
            {[...claim.support, ...claim.opposition].map((quote, i) => (
              <blockquote key={i}>
                {quote.quote}
                <span className="small-muted">Evidence {quote.evidenceId}</span>
              </blockquote>
            ))}
          </div>
        ))}
      </details>
      <details
        className="review-detail"
        open={review.contradictions.some((c) => !c.resolved)}
      >
        <summary>Contradictions ({review.contradictions.length})</summary>
        {!review.contradictions.length && (
          <p className="small-muted">
            No conflicts identified in the inspected set.{" "}
            {review.inspection.comparisonNotes}
          </p>
        )}
        {review.contradictions.map((conflict) => (
          <div className="review-conflict" key={conflict.id}>
            <span className="label-pill">{label(conflict.classification)}</span>
            {[conflict.left, conflict.right].map((side, i) => (
              <div key={i}>
                <strong>{side.claim}</strong>
                <blockquote>{side.quote}</blockquote>
                <a
                  className="subtle-link"
                  href={side.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {side.sourceTitle} ·{" "}
                  {side.publishedAt
                    ? formatDate(side.publishedAt)
                    : "Date unknown"}
                </a>
              </div>
            ))}
            <p>{conflict.explanation}</p>
            <p className="small-muted">
              Geography: {conflict.geographicalDifferences}
              <br />
              Methodology: {conflict.methodologicalDifferences}
              <br />
              Dates: {conflict.temporalDifferences}
            </p>
          </div>
        ))}
      </details>
      <details className="review-detail">
        <summary>Source quality concerns</summary>
        {review.sourceReviews
          .filter(
            (source) =>
              source.flags.length ||
              source.freshness === "UNKNOWN" ||
              source.reviewStatus !== "reviewed",
          )
          .map((source) => (
            <div className="review-section" key={source.sourceId}>
              <a
                href={source.url}
                className="subtle-link"
                target="_blank"
                rel="noopener noreferrer"
              >
                {source.title}
              </a>
              <p className="small-muted">
                {source.flags.map(label).join(" · ") ||
                  "No flagged content issue"}{" "}
                · freshness {label(source.freshness)}
              </p>
              {source.reasons.map((reason, i) => (
                <p className="small-muted" key={i}>
                  {reason}
                </p>
              ))}
            </div>
          ))}
      </details>
      <details className="review-detail">
        <summary>
          Targeted follow-up requests ({review.followUpRequests.length})
        </summary>
        {review.followUpRequests.map((item, i) => (
          <div className="review-section" key={i}>
            <strong>{item.missingQuestion}</strong>
            <p className="small-muted">
              Section:{" "}
              {
                review.sections.find(
                  (section) => section.sectionId === item.sectionId,
                )?.title
              }
            </p>
            <p>{item.query}</p>
            <p className="small-muted">
              Expected evidence: {item.expectedEvidence.join(", ")}
              <br />
              Reason: {item.reason}
            </p>
          </div>
        ))}
      </details>
      <p className="small-muted">{review.inspection.comparisonScope}</p>
    </section>
  );
}
