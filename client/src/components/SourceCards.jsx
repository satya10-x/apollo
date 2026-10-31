import SourceClaims from "./SourceClaims";
import SourceEvidence from "./SourceEvidence";
import { useState } from "react";
import {
  Search,
  Library,
  Globe,
  ArrowUpRight,
  ExternalLink,
} from "lucide-react";
import { EmptyState } from "./UI";
import { formatDate as date } from "../utils";
export default function SourceCards({ sources, report, terminal }) {
  const [query, setQuery] = useState("");
  const [section, setSection] = useState("all"),
    [category, setCategory] = useState("all");
  const sectionNames = (source) =>
    source.sections?.length
      ? source.sections
      : [source.section || "Unassigned"];
  const sections = [...new Set(sources.flatMap(sectionNames))].sort();
  const categories = [
    ...new Set(sources.map((source) => source.category).filter(Boolean)),
  ].sort();
  const filtered = sources.filter(
    (s) =>
      (section === "all" || sectionNames(s).includes(section)) &&
      (category === "all" || s.category === category) &&
      `${s.title} ${s.domain} ${s.category} ${(s.sections || []).join(" ")} ${s.section}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  if (!sources.length)
    return (
      <EmptyState
        icon={Library}
        title={
          terminal ? "No sources collected" : "Waiting for the first source"
        }
        description={
          terminal
            ? "No usable sources were retrieved in this session. Review the activity log for the stopping reason."
            : "Source metadata will appear as Athena gathers evidence."
        }
      />
    );
  return (
    <>
      <label className="search-input source-search">
        <Search size={16} />
        <input
          aria-label="Filter sources"
          placeholder="Filter by title, domain or section…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div className="source-filters">
        <select
          aria-label="Filter sources by research section"
          value={section}
          onChange={(e) => setSection(e.target.value)}
        >
          <option value="all">All research sections</option>
          {sections.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter sources by type"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="all">All source types</option>
          {categories.map((name) => (
            <option value={name} key={name}>
              {name}
            </option>
          ))}
        </select>
        <span className="small-muted">
          {filtered.length} / {sources.length} sources
        </span>
      </div>
      <div className="source-grid">
        {filtered.map((s, i) => (
          <article className="source-card" key={s._id}>
            <div className="source-card-top">
              <span>
                <Globe size={14} />
                {s.domain}
              </span>
              <span className="source-category">{s.category}</span>
            </div>
            <h3>
              <a href={s.url} target="_blank" rel="noopener noreferrer">
                {s.title}
                <ArrowUpRight size={16} />
              </a>
            </h3>
            <div className="source-details">
              <span>
                {s.publishedAt
                  ? date(s.publishedAt)
                  : "Publication date unavailable"}
              </span>
              <span className="relevance">
                {Math.round((s.relevance || 0) * 100)}% relevance
              </span>
            </div>
            {s.assessment && (
              <details className="source-assessment">
                <summary>Heuristic quality: {s.assessment.score}/100</summary>
                <p>{s.assessment.disclaimer}</p>
                {Object.entries(s.assessment.dimensions || {}).map(
                  ([name, dimension]) => (
                    <p key={name}>
                      <strong>
                        {name.replace(/([A-Z])/g, " $1")}:{" "}
                        {dimension.score === null
                          ? "unknown"
                          : `${Math.round(dimension.score * 100)}/100`}
                      </strong>
                      <br />
                      {dimension.reason}
                    </p>
                  ),
                )}
              </details>
            )}
            {s.retrievedAt && (
              <p className="small-muted">
                Retrieved {date(s.retrievedAt)} · {s.provenance?.length || 1}{" "}
                retrieval record(s)
              </p>
            )}
            <div className="source-section">
              <span>RESEARCH SECTION</span>
              {s.sections?.length
                ? s.sections.join(" · ")
                : s.section || "Unassigned"}
            </div>
            <SourceEvidence source={s} />
            <SourceClaims source={s} report={report} />
            <a
              className="subtle-link"
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              View original source <ExternalLink size={13} />
            </a>
          </article>
        ))}
      </div>
      {!filtered.length && (
        <EmptyState
          icon={Search}
          title="No matching sources"
          description="Try another title or domain."
        />
      )}
    </>
  );
}
