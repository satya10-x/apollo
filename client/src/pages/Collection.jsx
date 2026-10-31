import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Search,
  FileText,
  Library,
  BookOpen,
  ArrowRight,
  ArrowUpRight,
} from "lucide-react";
import { api } from "../api";
import {
  PageHeading,
  Loading,
  ErrorNotice,
  EmptyState,
} from "../components/UI";
import SourceCards from "../components/SourceCards";
export default function CollectionPage({ type }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const isSources = type === "sources";
  useEffect(() => {
    setLoading(true);
    setError("");
    setItems([]);
    api("/sessions")
      .then(async (d) => {
        const eligible = isSources
          ? d.sessions
          : d.sessions.filter((s) => s.status === "completed");
        const results = await Promise.all(
          eligible.map(async (s) => {
            const data = await api(
              `/sessions/${s._id}/${isSources ? "sources" : "report"}`,
            );
            return isSources
              ? data.sources.map((source) => ({ ...source, topic: s.topic }))
              : data.report
                ? [{ ...data.report, topic: s.topic }]
                : [];
          }),
        );
        setItems(results.flat());
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [type]);
  const filtered = items.filter((i) =>
    (i.title || i.topic).toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <PageHeading
        eyebrow="YOUR KNOWLEDGE, CONNECTED"
        title={isSources ? "Source library" : "Research reports"}
        description={
          isSources
            ? "The evidence behind every insight, all in one place."
            : "Thoughtful answers to your most ambitious questions."
        }
      />
      <div className="collection-toolbar">
        <label className="search-input">
          <Search size={17} />
          <input
            aria-label="Search collection"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${type}…`}
          />
        </label>
        <span className="muted">
          {filtered.length} {type}
        </span>
      </div>
      <ErrorNotice message={error} />
      {loading ? (
        <Loading />
      ) : filtered.length ? (
        isSources ? (
          <SourceCards sources={filtered} />
        ) : (
          <div className="report-grid">
            {filtered.map((r) => (
              <Link
                key={r._id}
                className="report-card"
                to={`/research/${r.session}/report`}
              >
                <FileText size={25} />
                <span className="eyebrow">RESEARCH REPORT</span>
                <h3>{r.topic}</h3>
                <p>{r.summary.slice(0, 170)}…</p>
                <span>
                  Read report <ArrowUpRight size={15} />
                </span>
              </Link>
            ))}
          </div>
        )
      ) : (
        <EmptyState
          icon={isSources ? Library : BookOpen}
          title={
            isSources ? "Evidence belongs here" : "Clarity is on the horizon"
          }
          description={
            isSources
              ? "Sources collected during your research will appear here."
              : "Completed research reports will appear here, ready to read and export."
          }
          action={
            <Link to="/" className="button secondary">
              Start exploring <ArrowRight size={15} />
            </Link>
          }
        />
      )}
    </>
  );
}
