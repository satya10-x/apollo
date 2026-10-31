import { useState } from "react";
import { api } from "../api";
import { formatDate } from "../utils";
export default function SourceEvidence({ source }) {
  const [open, setOpen] = useState(false),
    [items, setItems] = useState([]),
    [cursor, setCursor] = useState(null),
    [loaded, setLoaded] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  async function load(after) {
    setLoading(true);
    setError("");
    try {
      const data = await api(
        `/sessions/${source.session}/evidence?sourceId=${source._id}&limit=5${after ? `&after=${after}` : ""}`,
      );
      setItems((current) =>
        after ? [...current, ...data.evidence] : data.evidence,
      );
      setCursor(data.nextCursor);
      setLoaded(true);
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }
  function toggle() {
    setOpen((current) => !current);
    if (!open && !loaded) void load();
  }
  return (
    <div className="source-evidence">
      <button className="subtle-button" onClick={toggle} aria-expanded={open}>
        {open ? "Hide" : "Inspect"} supporting passages
      </button>
      {open && (
        <div>
          {loading && (
            <p className="small-muted" role="status">
              Loading retrieved evidence…
            </p>
          )}
          {error && (
            <p className="small-muted" role="alert">
              {error}{" "}
              <button className="subtle-button" onClick={() => load()}>
                Retry
              </button>
            </p>
          )}
          {!items.length && loaded && (
            <p className="small-muted">
              No separate evidence records. Older sessions may contain source
              excerpts only.
            </p>
          )}
          {items.map((item) => (
            <blockquote className="evidence-passage" key={item._id}>
              <p>{item.passage}</p>
              <footer>
                Retrieved excerpt · {formatDate(item.retrievedAt)}
                <br />
                {item.provenance?.[0]?.contentKind?.replaceAll("_", " ")} ·{" "}
                {item.provenance?.[0]?.provider}
                <br />
                {item.questions?.[0]}
              </footer>
            </blockquote>
          ))}
          {cursor && !loading && (
            <button className="subtle-button" onClick={() => load(cursor)}>
              Load more passages
            </button>
          )}
        </div>
      )}
    </div>
  );
}
