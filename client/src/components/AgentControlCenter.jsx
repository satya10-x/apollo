import { agentDefinitions } from "./UI";
const stageLabels = {
  queued: "Queued",
  planning: "Planning research",
  awaiting_approval: "Awaiting plan approval",
  searching: "Collecting sources",
  synthesizing: "Extracting findings",
  reviewing: "Reviewing evidence",
  writing_sections: "Writing research sections",
  assembling_report: "Assembling cited report",
  completed: "Report ready",
  failed: "Research stopped",
  cancelled: "Research cancelled",
};
export const stageLabel = (stage) =>
  stageLabels[stage] || stage?.replaceAll("_", " ");
export default function AgentControlCenter({ session, sources }) {
  const terminal = ["completed", "failed", "cancelled"].includes(
    session.status,
  );
  const events = session.events || [];
  const currentAgent =
    terminal || session.stage === "awaiting_approval"
      ? null
      : session.stage === "reviewing"
        ? "Hermes"
        : ["searching", "synthesizing"].includes(session.stage)
          ? "Athena"
          : "Apollo";
  const sections = session.blueprint?.sections || [];
  const tasks = session.tasks || [];
  const completedSections = sections.filter((section) => {
    const related = tasks.filter((task) => task.sectionId === section.id);
    return (
      related.length && related.every((task) => task.status === "completed")
    );
  }).length;
  const queries = session.researchMemory?.queries || [];
  const pendingQueries = queries.filter((query) =>
    ["pending", "running"].includes(query.status),
  ).length;
  return (
    <section className="control-center" aria-label="Live agent control center">
      <div className="control-heading">
        <div>
          <span className="eyebrow">AGENT CONTROL CENTER</span>
          <h2>{stageLabel(session.stage)}</h2>
        </div>
        <span className="label-pill">
          Round {session.round || 0} / {session.maxRounds}
        </span>
      </div>
      <div className="control-agents">
        {agentDefinitions.map((agent) => {
          const last = events.findLast((event) => event.agent === agent.name);
          const active = currentAgent === agent.name;
          return (
            <article
              className={`control-agent ${active ? "is-active" : ""}`}
              key={agent.name}
            >
              <div className="control-agent-heading">
                <span className={`agent-icon ${agent.color}`}>
                  <agent.icon size={18} />
                </span>
                <strong>{agent.name}</strong>
                <span className="agent-state">
                  {active ? "Working" : last ? "Last activity" : "Waiting"}
                </span>
              </div>
              <p>{last?.message || "No activity yet."}</p>
              {last && (
                <time dateTime={last.at}>
                  {new Date(last.at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </time>
              )}
            </article>
          );
        })}
      </div>
      <div className="control-metrics">
        {[
          ["Sections researched", `${completedSections} / ${sections.length}`],
          ["Pending searches", pendingQueries],
          ["Sources collected", sources.length],
          ["Open knowledge gaps", session.gaps?.length || 0],
        ].map(([label, value]) => (
          <div key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <p className="small-muted">
        {terminal
          ? `Execution ${session.status}.`
          : "Activity comes from the running research pipeline."}{" "}
        Sections count only when all assigned tasks completed successfully.
      </p>
    </section>
  );
}
