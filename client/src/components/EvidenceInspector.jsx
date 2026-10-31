import { useState } from "react";
import { Search, ShieldCheck } from "lucide-react";
import { EmptyState } from "./UI";
import SourceEvidence from "./SourceEvidence";
const label = (value) =>
  String(value || "UNREVIEWED")
    .replaceAll("_", " ")
    .toLowerCase();
export default function EvidenceInspector({
  review,
  sources,
  blueprint,
  terminal,
}) {
  const [selected, setSelected] = useState(null),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState("all");
  const claims = review?.claimReviews || [];
  const filtered = claims.filter(
    (claim) =>
      claim.statement.toLowerCase().includes(query.toLowerCase()) &&
      (status === "all" || claim.classification === status),
  );
  const claim =
    filtered.find((item) => item.claimId === selected) || filtered[0];
  if (!claims.length)
    return (
      <EmptyState
        icon={ShieldCheck}
        title={
          terminal
            ? "No claim-level review available"
            : "Evidence review pending"
        }
        description="Claim-level support and disagreements appear after Hermes inspects the retrieved passages."
      />
    );
  const passages = (items, opposition = false) => (
    <div className={opposition ? "opposing-evidence" : "supporting-evidence"}>
      <h3>{opposition ? "Contradictory evidence" : "Supporting evidence"}</h3>
      {!items?.length && (
        <p className="small-muted">
          {opposition
            ? "No contradictory passage recorded for this claim."
            : "No supporting passage recorded. This claim must not be treated as verified."}
        </p>
      )}
      {(items || []).map((quote, index) => {
        const source = sources.find(
          (item) => String(item._id) === String(quote.sourceId),
        );
        return (
          <div
            className="inspector-passage"
            key={`${quote.evidenceId}-${index}`}
          >
            <blockquote>{quote.quote}</blockquote>
            {source ? (
              <>
                <a
                  className="subtle-link"
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {source.title} ↗
                </a>
                <SourceEvidence source={source} />
              </>
            ) : (
              <p className="small-muted">
                Source metadata unavailable · {quote.sourceId}
              </p>
            )}
            <p className="evidence-id">Evidence {quote.evidenceId}</p>
          </div>
        );
      })}
    </div>
  );
  return (
    <section className="panel evidence-inspector">
      <div className="section-title">
        <h2>Evidence inspector</h2>
        <span className="label-pill">{claims.length} CLAIMS</span>
      </div>
      <div className="collection-toolbar">
        <label className="search-input">
          <Search size={16} />
          <input
            aria-label="Search claims"
            placeholder="Find a claim…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="Verification status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {[
            "all",
            "SUPPORTED",
            "PARTIALLY_SUPPORTED",
            "CONFLICTING",
            "UNSUPPORTED",
          ].map((value) => (
            <option value={value} key={value}>
              {value === "all" ? "All verification statuses" : label(value)}
            </option>
          ))}
        </select>
      </div>
      {!claim ? (
        <p className="muted">No claims match these filters.</p>
      ) : (
        <div className="inspector-grid">
          <nav aria-label="Research claims" className="claim-list">
            {filtered.map((item) => (
              <button
                key={item.claimId}
                className={claim.claimId === item.claimId ? "selected" : ""}
                onClick={() => setSelected(item.claimId)}
              >
                <span
                  className={`claim-status status-${item.classification?.toLowerCase()}`}
                >
                  {label(item.classification)}
                </span>
                <span>{item.statement}</span>
              </button>
            ))}
          </nav>
          <article className="claim-detail">
            <span className="eyebrow">
              {blueprint?.sections.find(
                (section) => section.id === claim.sectionId,
              )?.title || "REVIEWED CLAIM"}
            </span>
            <h3>{claim.statement}</h3>
            <span
              className={`badge ${claim.classification === "SUPPORTED" ? "completed" : "unavailable"}`}
            >
              {label(claim.classification)}
            </span>
            <p className="small-muted">{claim.reason}</p>
            {passages(claim.support)}
            {passages(claim.opposition, true)}
            <p className="small-muted">
              Verification is Hermes’s evidence-linked assessment, not
              independent factual certification.
            </p>
          </article>
        </div>
      )}
    </section>
  );
}
