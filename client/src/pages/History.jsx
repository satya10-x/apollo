import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, History, ArrowRight } from "lucide-react";
import { api } from "../api";
import {
  PageHeading,
  Loading,
  ErrorNotice,
  EmptyState,
} from "../components/UI";
import SessionList from "../components/SessionList";
export default function HistoryPage() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [deleting, setDeleting] = useState(null),
    [busy, setBusy] = useState(false);
  async function remove() {
    setBusy(true);
    setError("");
    try {
      await api(`/sessions/${deleting._id}`, { method: "DELETE" });
      setSessions((current) =>
        current.filter((item) => item._id !== deleting._id),
      );
      setDeleting(null);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    api("/sessions")
      .then((d) => setSessions(d.sessions))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  const filtered = sessions.filter(
    (s) =>
      s.topic.toLowerCase().includes(query.toLowerCase()) &&
      (filter === "all" || s.status === filter),
  );
  return (
    <>
      <PageHeading
        eyebrow="YOUR RESEARCH ARCHIVE"
        title="Research history"
        description="Every question is a new starting point."
        action={
          <Link to="/workspace" className="button primary">
            <Plus size={16} /> New research
          </Link>
        }
      />
      <div className="collection-toolbar">
        <label className="search-input">
          <Search size={17} />
          <input
            aria-label="Search research history"
            placeholder="Search your research…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="Filter by status"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          {["all", "completed", "running", "failed", "cancelled"].map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "All statuses" : s}
            </option>
          ))}
        </select>
      </div>
      <ErrorNotice message={error} />
      {deleting && (
        <section
          className="panel delete-confirmation"
          role="alertdialog"
          aria-labelledby="delete-title"
        >
          <div>
            <h2 id="delete-title">Delete this research?</h2>
            <p>{deleting.topic}</p>
            <p className="small-muted">
              This permanently removes the session, sources, evidence and
              report.
            </p>
          </div>
          <div className="session-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setDeleting(null)}
            >
              Keep session
            </button>
            <button className="button danger" disabled={busy} onClick={remove}>
              {busy ? "Deleting…" : "Delete research"}
            </button>
          </div>
        </section>
      )}
      {loading ? (
        <Loading />
      ) : filtered.length ? (
        <SessionList sessions={filtered} onDelete={setDeleting} />
      ) : (
        <EmptyState
          icon={History}
          title={
            query || filter !== "all"
              ? "No matching sessions"
              : "A fresh perspective awaits"
          }
          description={
            query || filter !== "all"
              ? "Try a different search or status."
              : "Your research sessions will be saved here as you explore."
          }
          action={
            <Link className="button secondary" to="/workspace">
              Start a research <ArrowRight size={15} />
            </Link>
          }
        />
      )}
    </>
  );
}
