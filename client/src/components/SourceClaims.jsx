import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
export default function SourceClaims({ source, report }) {
  const [open, setOpen] = useState(false),
    [loaded, setLoaded] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function toggle() {
    setOpen(!open);
    if (open || report || loaded || busy) return;
    setBusy(true);
    setError("");
    try {
      const data = await api(`/sessions/${source.session}/report`);
      setLoaded(data.report || { formatVersion: 0 });
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  const doc = report || loaded;
  const blocks =
    doc?.formatVersion === 2
      ? [
          ...doc.executiveSummary,
          ...doc.keyFindings,
          ...doc.sections.flatMap((item) => item.blocks),
          ...doc.contradictions,
          ...doc.opportunities,
          ...doc.risks,
          ...doc.conclusion,
        ]
      : [];
  const uses = [
    ...new Map(
      blocks
        .filter((block) => block.sourceIds?.includes(String(source._id)))
        .map((block) => [block.id, block]),
    ).values(),
  ];
  return (
    <div className="source-evidence">
      <button className="subtle-button" aria-expanded={open} onClick={toggle}>
        {open ? "Hide" : "Show"} report claims
      </button>
      {open && (
        <div>
          {busy && (
            <p className="small-muted" role="status">
              Loading report mappings…
            </p>
          )}
          {error && (
            <p role="alert" className="small-muted">
              {error}
            </p>
          )}
          {!busy && !error && !uses.length && (
            <p className="small-muted">
              No published report claims mapped to this source.
            </p>
          )}
          {uses.map((block) => (
            <blockquote className="evidence-passage" key={block.id}>
              <p>{block.text}</p>
              <Link
                className="subtle-link"
                to={`/research/${source.session}/report#${block.sectionId ? `section-${block.sectionId}` : "references"}`}
              >
                Read in report ↗
              </Link>
            </blockquote>
          ))}
        </div>
      )}
    </div>
  );
}
