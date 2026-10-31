import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  ArrowRight,
  Sparkles,
  Zap,
  Layers,
  Orbit,
  Library,
  FileText,
  SlidersHorizontal,
  Check,
} from "lucide-react";
import { api } from "../api";
import {
  PageHeading,
  Loading,
  ErrorNotice,
  AgentCards,
  SectionTitle,
} from "../components/UI";
import MastersLanding from "../components/MastersLanding";
import SessionList from "../components/SessionList";
const modes = [
  {
    id: "quick",
    name: "Quick",
    icon: Zap,
    description: "A focused overview",
    time: "1 research round",
  },
  {
    id: "standard",
    name: "Standard",
    icon: Layers,
    description: "A balanced deep dive",
    time: "Up to 3 rounds",
  },
  {
    id: "deep",
    name: "Deep",
    icon: Orbit,
    description: "A thorough investigation",
    time: "Advanced web search",
  },
];
export default function Dashboard({ health, workspace = false }) {
  const [topic, setTopic] = useState("");
  const [mode, setMode] = useState("standard");
  const [rounds, setRounds] = useState(3);
  const [requirePlanApproval, setRequirePlanApproval] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sessions, setSessions] = useState([]);
  const [stats, setStats] = useState({
    sessions: null,
    reports: null,
    sources: null,
  });
  const [loaded, setLoaded] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    if (health?.database === "connected")
      Promise.all([api("/sessions"), api("/sessions/stats")])
        .then(([s, t]) => {
          setSessions(s.sessions);
          setStats(t);
        })
        .catch((e) => setError(e.message))
        .finally(() => setLoaded(true));
    else if (health) setLoaded(true);
  }, [health]);
  useEffect(() => {
    const key = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        document.getElementById("topic")?.focus();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  async function start(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { session } = await api("/sessions", {
        method: "POST",
        body: JSON.stringify({
          topic,
          mode,
          requirePlanApproval,
          maxRounds: mode === "quick" ? 1 : rounds,
        }),
      });
      navigate(`/research/${session._id}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {!workspace && <MastersLanding />}
      <div className="masters-desk" id="research-desk">
        {workspace && (
          <div className="workspace-intro">
            <div className="workspace-signal">
              <span /> INTELLIGENCE, ORCHESTRATED
            </div>
            <div className="orbital-system" aria-hidden="true">
              <span />
              <span />
              <span />
              <Orbit size={46} strokeWidth={1} />
              <i className="orbit-point one" />
              <i className="orbit-point two" />
              <i className="orbit-point three" />
            </div>
            <span className="workspace-coordinate">APOLLO / RESEARCH OS</span>
          </div>
        )}
        {!workspace && (
          <div className="masters-chapter">
            <span>01 / THE RESEARCH DESK</span>
            <span>A QUESTION IS A BEGINNING.</span>
          </div>
        )}
        <PageHeading
          eyebrow={
            workspace
              ? "YOUR NEXT DISCOVERY STARTS HERE"
              : "YOUR INTELLIGENCE WORKSPACE"
          }
          title={
            workspace ? (
              <>
                Think deeper.
                <br />
                <span className="accent-serif">See further.</span>
              </>
            ) : (
              <>
                Big questions.
                <br />
                Deeper <span className="accent-serif">understanding.</span>
              </>
            )
          }
          description="Turn a spark of curiosity into evidence-backed intelligence."
          action={
            <div className="heading-tag">
              <span /> POWERED BY THREE AI AGENTS
            </div>
          }
        />
        {workspace && (
          <div className="workspace-quicklinks">
            <Link to="/history">
              <Orbit size={15} /> Research history <ArrowUpRight size={14} />
            </Link>
            <Link to="/sources">
              <Library size={15} /> Source library <ArrowUpRight size={14} />
            </Link>
            <Link to="/reports">
              <FileText size={15} /> Reports <ArrowUpRight size={14} />
            </Link>
          </div>
        )}
        <section className="research-composer">
          <div className="composer-label">
            <span>
              <Sparkles size={17} /> What would you like to explore?
            </span>
            <span className="mono">01 / START A RESEARCH</span>
          </div>
          <form onSubmit={start}>
            <label className="sr-only" htmlFor="topic">
              Research topic
            </label>
            <textarea
              id="topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Ask an ambitious question…"
              minLength={8}
              maxLength={500}
              required
              rows={2}
            />
            <div className="input-bottom">
              <span>Go broad. Get specific. Follow your curiosity.</span>
              <span>{topic.length} / 500</span>
            </div>
            <div className="composer-options">
              <div className="mode-selector" aria-label="Research mode">
                {modes.map((m) => (
                  <button
                    type="button"
                    title={m.description}
                    key={m.id}
                    onClick={() => {
                      setMode(m.id);
                      setRounds((current) =>
                        Math.min(
                          current,
                          m.id === "quick" ? 1 : m.id === "standard" ? 3 : 5,
                        ),
                      );
                    }}
                    className={mode === m.id ? "selected" : ""}
                    aria-pressed={mode === m.id}
                  >
                    <m.icon size={15} />
                    {m.name}
                    {mode === m.id && <span className="mode-dot" />}
                  </button>
                ))}
              </div>
              <label className="round-selector">
                <SlidersHorizontal size={14} />
                <span>Max rounds</span>
                <select
                  aria-label="Maximum research rounds"
                  value={mode === "quick" ? 1 : rounds}
                  disabled={mode === "quick"}
                  onChange={(e) => setRounds(Number(e.target.value))}
                >
                  {(mode === "quick"
                    ? [1]
                    : mode === "standard"
                      ? [1, 2, 3]
                      : [1, 2, 3, 4, 5]
                  ).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="button primary start-button"
                disabled={
                  busy ||
                  topic.trim().length < 8 ||
                  !health?.researchConfigured ||
                  health?.database !== "connected"
                }
              >
                {busy ? (
                  <span className="spin">
                    <Orbit size={17} />
                  </span>
                ) : (
                  <Sparkles size={16} />
                )}{" "}
                {busy ? "Starting…" : "Start research"}
                <ArrowUpRight size={17} />
              </button>
            </div>
            <label className="approval-option">
              <input
                type="checkbox"
                checked={requirePlanApproval}
                onChange={(e) => setRequirePlanApproval(e.target.checked)}
              />{" "}
              Review and approve the plan before web research
            </label>
            <ErrorNotice message={error} />
          </form>
        </section>
        <div className="composer-footnote">
          <span>
            <Check size={13} /> Evidence first. Sources always.
          </span>
          <span>
            {mode === "quick"
              ? "A focused overview with one research round."
              : mode === "deep"
                ? "Advanced search with iterative evidence review."
                : "A balanced exploration with iterative evidence review."}
          </span>
        </div>
        <section className="stats-grid" aria-label="Research statistics">
          {[
            {
              label: "Research sessions",
              value: stats.sessions,
              icon: Orbit,
              hint: "Questions explored",
            },
            {
              label: "Sources collected",
              value: stats.sources,
              icon: Library,
              hint: "Evidence discovered",
            },
            {
              label: "Reports generated",
              value: stats.reports,
              icon: FileText,
              hint: "Ideas brought together",
            },
          ].map((s) => (
            <div className="stat" key={s.label}>
              <div>
                <span>{s.label}</span>
                <s.icon size={17} />
              </div>
              <strong>
                {s.value == null ? "—" : s.value.toString().padStart(2, "0")}
              </strong>
              <p>{s.hint}</p>
            </div>
          ))}
        </section>
        <section className="recent-section">
          <SectionTitle
            title="Recent research"
            kicker="Your latest paths to understanding."
            action={
              <Link className="subtle-link" to="/history">
                View all research <ArrowRight size={15} />
              </Link>
            }
          />
          {!loaded ? (
            <Loading />
          ) : sessions.length ? (
            <SessionList sessions={sessions.slice(0, 4)} />
          ) : (
            <div className="recent-empty">
              <div className="empty-orbit">
                <Orbit size={27} strokeWidth={1} />
              </div>
              <div>
                <h3>
                  {health?.database === "connected"
                    ? "Your next discovery starts here"
                    : "Research history unavailable"}
                </h3>
                <p>
                  {health?.database === "connected"
                    ? "Start your first research. Your sessions will appear here."
                    : "History will appear when the database connection is restored."}
                </p>
              </div>
              <span className="empty-arrow">
                <ArrowUpRight size={20} />
              </span>
            </div>
          )}
        </section>
        <section className="meet-agents" id="apollo-method">
          <SectionTitle
            title="A small team. A bigger perspective."
            kicker="Three specialized agents, working together on every question."
            action={<span className="label-pill">THE APOLLO METHOD</span>}
          />
          <AgentCards />
        </section>
        {!workspace && (
          <div className="masters-colophon">
            <span>APOLLO — DEEP RESEARCH META-AGENT</span>
            <a href="#research-desk">RETURN TO THE DESK ↑</a>
          </div>
        )}
      </div>
    </>
  );
}
