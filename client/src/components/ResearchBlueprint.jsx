export default function ResearchBlueprint({ session }) {
  const plan = session.blueprint;
  if (!plan)
    return session.plan?.length ? (
      <ol className="research-plan">
        {session.plan.map((title, index) => (
          <li key={index}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            {title}
          </li>
        ))}
      </ol>
    ) : (
      <p className="muted">
        Apollo is identifying the objective, scope and research dimensions.
      </p>
    );
  return (
    <div className="research-blueprint">
      <span className="label-pill">
        {plan.domain} · {plan.complexity}
      </span>
      <h3>{plan.objective}</h3>
      <p className="muted">{plan.scope}</p>
      <details className="blueprint-needs">
        <summary>Research dimensions & information needs</summary>
        <p className="small-muted">{plan.dimensions.join(" · ")}</p>
        <ul>
          {plan.informationNeeds.map((need, index) => (
            <li key={index}>{need}</li>
          ))}
        </ul>
      </details>
      {plan.sections.map((section, index) => (
        <details className="blueprint-section" key={section.id}>
          <summary>
            <span className="mono">{String(index + 1).padStart(2, "0")}</span>
            <strong>{section.title}</strong>
            <span className="label-pill">{section.priority}</span>
          </summary>
          {section.dependsOn.length > 0 && (
            <p className="small-muted">
              Depends on:{" "}
              {section.dependsOn
                .map(
                  (id) =>
                    plan.sections.find((item) => item.id === id)?.title || id,
                )
                .join(", ")}
            </p>
          )}
          <ol>
            {section.subQuestions.map((question) => (
              <li key={question.id}>
                <strong>{question.question}</strong>
                <p className="small-muted">
                  Evidence: {question.expectedEvidence.join(", ")}
                </p>
                <ul className="query-list">
                  {question.queries.map((query, i) => (
                    <li key={i}>{query}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </details>
      ))}
    </div>
  );
}
export function ExecutionState({ session }) {
  if (!session.limits) return null;
  const tasks = session.tasks || [],
    usage = session.usage || {},
    limits = session.limits;
  const completed = tasks.filter((task) => task.status === "completed").length;
  const pending = tasks.filter((task) =>
    ["running", "pending"].includes(task.status),
  ).length;
  const decisions = (session.decisions || [])
    .filter((decision) => decision.action !== "model_result")
    .slice(-5)
    .reverse();
  return (
    <>
      <section className="panel">
        <h2 className="execution-title">Execution controls</h2>
        <div className="execution-meter">
          <span>Tasks complete / pending</span>
          <strong>
            {completed} / {pending}
          </strong>
        </div>
        <div className="execution-meter">
          <span>Search requests</span>
          <strong>
            {usage.searchRequests || 0} / {limits.maxSearchRequests}
          </strong>
        </div>
        <div className="execution-meter">
          <span>Tokens charged</span>
          <strong>
            {(usage.tokensCharged || 0).toLocaleString()} /{" "}
            {limits.maxTokens.toLocaleString()}
          </strong>
        </div>
        <div className="execution-meter">
          <span>Execution timeout</span>
          <strong>{Math.round(limits.timeoutMs / 1000)}s</strong>
        </div>
        <div className="execution-meter">
          <span>Configured cost estimate</span>
          <strong>
            ${(usage.estimatedCostUsd || 0).toFixed(4)}
            {limits.maxCostUsd !== undefined ? ` / $${limits.maxCostUsd}` : ""}
          </strong>
        </div>
        <p className="small-muted">
          {usage.unpricedRequests
            ? "Some requests are unpriced; cost is a partial estimate."
            : "Costs use configured provider rates."}{" "}
          {usage.estimatedTokens
            ? "Token totals include conservative reservations for unreported usage."
            : ""}
        </p>
        {session.stopReason && (
          <p className="execution-stop">
            Stop reason: {session.stopReason.replaceAll("_", " ")}
          </p>
        )}
        <details className="task-details">
          <summary>Task queue ({tasks.length})</summary>
          {tasks.map((task) => (
            <div className="task-item" key={task.id}>
              <strong>{task.question}</strong>
              <span>
                {task.status} · round {task.round}
                {task.reason ? ` · ${task.reason.replaceAll("_", " ")}` : ""}
              </span>
            </div>
          ))}
        </details>
      </section>
      {session.reportProgress && (
        <section className="panel">
          <h2 className="execution-title">Report generation</h2>
          <p className="small-muted">
            {session.reportProgress.stage === "writing_sections"
              ? "Independent section writers"
              : "Report assembler"}{" "}
            · {session.reportProgress.status}
          </p>
          <div className="execution-meter">
            <span>Sections drafted</span>
            <strong>
              {session.reportProgress.completedSections} /{" "}
              {session.reportProgress.totalSections}
            </strong>
          </div>
        </section>
      )}
      {decisions.length > 0 && (
        <section className="panel">
          <h2 className="execution-title">Apollo decisions</h2>
          {decisions.map((decision, index) => (
            <div className="decision-item" key={index}>
              <strong>
                {decision.action.replaceAll("_", " ")} · round {decision.round}
              </strong>
              <p>{decision.reason.replaceAll("_", " ")}</p>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
