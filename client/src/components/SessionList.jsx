import { Link } from "react-router-dom";
import { Orbit, ChevronRight, Trash2 } from "lucide-react";
import { Badge } from "./UI";
import { formatDate as date } from "../utils";
export default function SessionList({ sessions, onDelete }) {
  return (
    <div className="session-list">
      {sessions.map((s) => (
        <div className="session-list-item" key={s._id}>
          <Link className="session-row" to={`/research/${s._id}`}>
            <span className="session-icon">
              <Orbit size={19} />
            </span>
            <div className="session-title">
              <strong>{s.topic}</strong>
              <span>
                {s.mode} research <span>·</span> {date(s.createdAt)}
              </span>
            </div>
            <Badge status={s.status} />
            <ChevronRight size={17} />
          </Link>
          {onDelete &&
            ["completed", "failed", "cancelled"].includes(s.status) && (
              <button
                className="session-delete"
                title="Delete research session"
                aria-label={`Delete ${s.topic}`}
                onClick={() => onDelete(s)}
              >
                <Trash2 size={16} />
              </button>
            )}
        </div>
      ))}
    </div>
  );
}
