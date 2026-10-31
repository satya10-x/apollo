import { useEffect, useState, useCallback, useRef } from "react";
import { Link, NavLink, useParams, useLocation } from "react-router-dom";
import {
  ArrowRight,
  Clock,
  Layers,
  Globe,
  Radio,
  Check,
  Activity,
  Search,
} from "lucide-react";
import { api, apiUrl } from "../api";
import {
  PageHeading,
  Loading,
  ErrorNotice,
  Badge,
  SectionTitle,
  agentDefinitions,
} from "../components/UI";
import ResearchBlueprint, {
  ExecutionState,
} from "../components/ResearchBlueprint";
import HermesReview from "../components/HermesReview";
import SourceCards from "../components/SourceCards";
import AgentControlCenter, {
  stageLabel,
} from "../components/AgentControlCenter";
import EvidenceInspector from "../components/EvidenceInspector";
import ReportView from "../components/ReportView";
import { formatDate as date } from "../utils";
export default function ResearchWorkspace() {
  const { id } = useParams();
  const [session, setSession] = useState(null);
  const [sources, setSources] = useState([]);
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [relatedError, setRelatedError] = useState("");
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [live, setLive] = useState(false);
  const [retry, setRetry] = useState(0);
  const [approving, setApproving] = useState(false);
  const currentId = useRef(id);
  currentId.current = id;
  const location = useLocation();
  const tab = location.pathname.endsWith("/sources")
    ? "sources"
    : location.pathname.endsWith("/report")
      ? "report"
      : location.pathname.endsWith("/evidence")
        ? "evidence"
        : "activity";
  const loadRelated = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([
        api(`/sessions/${id}/sources`),
        api(`/sessions/${id}/report`),
      ]);
      if (currentId.current !== id) return;
      setRelatedError("");
      setSources(s.sources);
      setReport(r.report);
    } catch (error) {
      if (currentId.current === id) setRelatedError(error.message);
    }
  }, [id]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setRelatedError("");
    setSession(null);
    setSources([]);
    setReport(null);
    api(`/sessions/${id}`)
      .then((d) => {
        if (active) {
          setSession(d.session);
          loadRelated();
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, retry, loadRelated]);
  const terminal =
    session && ["completed", "failed", "cancelled"].includes(session.status);
  useEffect(() => {
    if (!session || terminal) return;
    let refreshTimer;
    const stream = new EventSource(apiUrl(`/sessions/${id}/events`));
    stream.onopen = () => setLive(true);
    stream.onmessage = (e) => {
      try {
        const updated = JSON.parse(e.data);
        if (currentId.current !== id) return;
        setSession(updated);
        // Coalesce bursty agent checkpoints into one source/report refresh.
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(loadRelated, 250);
      } catch {
        setError("An activity update could not be read.");
      }
    };
    stream.onerror = () => setLive(false);
    return () => {
      clearTimeout(refreshTimer);
      stream.close();
      setLive(false);
    };
  }, [id, Boolean(session), terminal, loadRelated]);
  useEffect(() => {
    if (terminal) void loadRelated();
  }, [terminal, loadRelated]);
  // EventSource retries itself. A bounded poll recovers state if the proxy drops SSE.
  useEffect(() => {
    if (!session || terminal) return;
    const timer = setInterval(
      async () => {
        try {
          const data = await api(`/sessions/${id}`);
          if (currentId.current === id) {
            setSession(data.session);
            void loadRelated();
          }
        } catch {
          /* Keep the last persisted snapshot; SSE and this poll retry. */
        }
      },
      live ? 20000 : 5000,
    );
    return () => clearInterval(timer);
  }, [id, Boolean(session), terminal, live, loadRelated]);
  async function approve() {
    setApproving(true);
    setError("");
    try {
      const data = await api(`/sessions/${id}/approve-plan`, {
        method: "POST",
      });
      setSession(data.session);
    } catch (error) {
      setError(error.message);
    } finally {
      setApproving(false);
    }
  }
  async function cancel() {
    setCancelling(true);
    setError("");
    try {
      const data = await api(`/sessions/${id}/cancel`, { method: "POST" });
      setSession(data.session);
      loadRelated();
    } catch (error) {
      setError(error.message);
    } finally {
      setCancelling(false);
    }
  }
  if (loading) return <Loading />;
  if (!session)
    return (
      <>
        <ErrorNotice message={error} />
        <button
          className="button secondary"
          onClick={() => setRetry((x) => x + 1)}
        >
          Retry connection
        </button>
      </>
    );
  return (
    <>
      <Link to="/history" className="back-link">
        <ArrowRight size={14} /> All research
      </Link>
      <PageHeading
        eyebrow={`${session.mode.toUpperCase()} RESEARCH`}
        title={session.topic}
        action={
          <div className="session-actions">
            <Badge status={session.status} />
            {!terminal && (
              <button
                className="button secondary"
                disabled={cancelling}
                onClick={cancel}
              >
                {cancelling ? "Cancelling…" : "Cancel research"}
              </button>
            )}
          </div>
        }
      />
      <div className="workspace-meta">
        <span>
          <Clock size={14} />
          {date(session.createdAt)}
        </span>
        <span>
          <Layers size={14} />
          Round {session.round} of{" "}
          {session.mode === "quick" ? 1 : session.maxRounds}
        </span>
        <span>
          <Globe size={14} />
          {sources.length} sources
        </span>
        <span className={live ? "live-text" : ""}>
          <Radio size={14} />
          {terminal ? "Session ended" : live ? "Live updates" : "Reconnecting…"}
        </span>
      </div>
      <ErrorNotice message={error || relatedError || session.error} />
      <div className="workspace-tabs">
        <NavLink to={`/research/${id}`} end>
          Research workspace
        </NavLink>
        <NavLink to={`/research/${id}/sources`}>
          Sources <span>{sources.length}</span>
        </NavLink>
        <NavLink to={`/research/${id}/evidence`}>Evidence inspector</NavLink>
        <NavLink to={`/research/${id}/report`}>
          Report {report && <Check size={14} />}
        </NavLink>
      </div>
      {tab === "activity" && (
        <AgentControlCenter session={session} sources={sources} />
      )}
      {session.stage === "awaiting_approval" && !terminal && (
        <section className="panel approval-panel">
          <div>
            <span className="eyebrow">YOUR REVIEW</span>
            <h2>Approve the research blueprint</h2>
            <p className="small-muted">
              Review the plan below before Athena starts. The execution timeout
              continues while waiting.
            </p>
          </div>
          <button
            className="button primary"
            disabled={approving || !!session.planApprovedAt}
            onClick={approve}
          >
            {session.planApprovedAt
              ? "Approved · continuing…"
              : approving
                ? "Approving…"
                : "Approve & start research"}
          </button>
        </section>
      )}
      {tab === "sources" ? (
        <>
          <SectionTitle
            title="Collected evidence"
            kicker="Original sources, collected directly from web search."
          />
          <SourceCards sources={sources} report={report} terminal={terminal} />
        </>
      ) : tab === "evidence" ? (
        <EvidenceInspector
          review={session.reviews?.at(-1)}
          sources={sources}
          blueprint={session.blueprint}
          terminal={terminal}
        />
      ) : tab === "report" ? (
        <ReportView
          report={report}
          session={session}
          sources={sources}
          onReportUpdate={(updated) => {
            setReport(updated);
            api(`/sessions/${id}`)
              .then((data) => {
                if (currentId.current === id) setSession(data.session);
              })
              .catch((error) => setError(error.message));
          }}
        />
      ) : (
        <div className="workspace-grid">
          <div>
            <section className="panel">
              <SectionTitle
                title="Research plan"
                action={<span className="label-pill">APOLLO</span>}
              />
              <ResearchBlueprint session={session} />
            </section>
            <HermesReview
              review={session.reviews?.at(-1)}
              terminal={terminal}
            />
            <section className="panel">
              <SectionTitle
                title="Agent activity"
                action={<Activity size={17} />}
              />
              {session.events.length ? (
                <div className="timeline">
                  {[...session.events].reverse().map((e, i) => (
                    <div className="timeline-item" key={`${e.at}-${i}`}>
                      <span
                        className={`timeline-dot ${e.agent.toLowerCase()}`}
                      />
                      <div>
                        <div>
                          <strong>{e.agent}</strong>
                          <time>
                            {new Date(e.at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </time>
                        </div>
                        <p>{e.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">Waiting for the first agent update.</p>
              )}
            </section>
          </div>
          <aside className="workspace-aside">
            <ExecutionState session={session} />
            <section className="panel">
              <SectionTitle title="Research progress" />
              <span className="eyebrow">CURRENT STAGE</span>
              <h3 className="stage-title">{stageLabel(session.stage)}</h3>
              <div className="coverage-heading">
                <span>Evidence coverage</span>
                <strong>{session.coverage}%</strong>
              </div>
              <div className="progress-track">
                <div style={{ width: `${session.coverage}%` }} />
              </div>
              <p className="small-muted">
                Derived from answered and partially answered blueprint
                questions. Support judgments are evidence-linked model
                assessments.
              </p>
            </section>
            <section className="panel">
              <SectionTitle
                title="Knowledge gaps"
                action={<Search size={16} />}
              />
              {session.gaps.length ? (
                <ul className="gap-list">
                  {session.gaps.map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
              ) : (
                <p className="muted">
                  {terminal
                    ? "No additional gaps recorded. See the review and execution status for evidence limitations."
                    : "Gaps will appear as Hermes reviews the evidence."}
                </p>
              )}
            </section>
            <section className="panel">
              <SectionTitle title="Your research team" />
              {agentDefinitions.map((a) => (
                <div className="team-row" key={a.name}>
                  <span className={`agent-icon ${a.color}`}>
                    <a.icon size={16} />
                  </span>
                  <div>
                    <strong>{a.name}</strong>
                    <span>{a.label}</span>
                  </div>
                </div>
              ))}
            </section>
          </aside>
        </div>
      )}
    </>
  );
}
