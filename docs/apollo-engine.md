# Apollo orchestration engine

Apollo owns one integrated pipeline:

```text
POST /api/sessions
  → persist queued session + effective execution limits
  → atomically claim session
  → Apollo: understand topic and build validated research blueprint
  → Apollo: dispatch dependency-ready section tasks to Athena
      → Athena retrieval: Tavily, optional Exa/arXiv → deduplicated sources + separate evidence
      → Athena: validated, source-linked findings for the assigned task
  → Hermes: review findings and evidence, assess each section, identify gaps
  → Apollo: interpret feedback and enforce application stopping rules
      → schedule novel, prioritized follow-ups within remaining limits
      → repeat a bounded number of rounds
  → Hermes: write report when directed by Apollo
  → validate section coverage and citation references
  → persist report and atomically complete session
```

Athena and Hermes are services invoked by Apollo. They have no independent execution loops or agent demo endpoints. The UI uses the same session, source, report and SSE APIs as before. Old sessions with title-only plans remain readable.

## Blueprint

The validated JSON blueprint includes `objective`, `scope`, `domain`, `complexity`, `dimensions`, `informationNeeds`, and 4–8 `sections`. Each section has an ID, title, priority, `dependsOn` section IDs, and sub-questions. Every sub-question has a globally unique ID, question, search queries, and expected evidence types. IDs and titles must be unique; missing dependencies and dependency cycles are rejected. Apollo allocates available sources across remaining tasks and retains source capacity for follow-up rounds. Executed queries are recorded separately from the planned queries. It passes prerequisite findings and their evidence to dependent tasks, noting unresolved prerequisites. Apollo selects ready tasks in priority order, waiting for prerequisite sections to reach a terminal task state before dependent work. A prerequisite without evidence remains explicit in task state and the report limitations.

## Mode policies

These are ceilings; requested limits and server environment caps may lower them.

| Control                                                   | Quick     | Standard   | Deep       |
| --------------------------------------------------------- | --------- | ---------- | ---------- |
| Maximum rounds                                            | 1         | 3          | 5          |
| Execution timeout                                         | 5 minutes | 10 minutes | 20 minutes |
| Search requests                                           | 8         | 32         | 72         |
| Collected sources                                         | 16        | 60         | 120        |
| Results per search                                        | 2         | 4          | 6          |
| Sub-questions per section                                 | 1         | 2          | 3          |
| Queries per sub-question                                  | 1         | 2          | 3          |
| Token budget                                              | 80,000    | 250,000    | 600,000    |
| Maximum output tokens per LLM attempt                     | 3,500     | 5,000      | 7,000      |
| Target estimated coverage                                 | 70%       | 85%        | 92%        |
| Minimum source references per section for early readiness | 1         | 2          | 3          |
| Follow-up tasks per round                                 | 2         | 6          | 12         |
| Search depth                                              | Basic     | Basic      | Advanced   |

The minimum per-section evidence target is necessary for early readiness, not a claim that that number guarantees comprehensive research. Deep review additionally asks Hermes to examine methodology, contradictory evidence, recency, geographic/demographic applicability and missing quantitative evidence.

## State and persistence

A session contains:

- `_id` / `sessionId`, topic and mode.
- `blueprint` plus legacy `plan` title strings.
- `status`, `stage`, `round`, `startedAt`, `deadlineAt`, `finishedAt`.
- `tasks` with section, question, queries, expected evidence, prerequisites, priority, round, source IDs and task status/reason.
- `completedTasks` and `pendingTasks` as task ID lists. Skipped and cancelled tasks remain in `tasks` with explicit reasons.
- `findings` containing Athena's summary, supported claims with source IDs, and limitations.
- `sourceIds`, `coverage`, string `gaps`, structured `gapDetails`, and section-wise `reviews`.
- `decisions`, including dispatch, provider/model used, review interpretation, stopping decisions and reasons.
- Effective `limits`, usage counters, `cancelRequested`, `stopReason`, and errors.

State transitions are written to MongoDB and published through the existing SSE stream. Source content stays in the backend. Duplicate URLs are merged per session, retaining their associated section IDs and titles. Findings reference source IDs; final report input maps those IDs to the numeric reference order returned by the sources API.

## Stopping and cancellation

Apollo checks cancellation and the deadline around provider operations and checkpoints. Abort signals reach active fetch requests. Search requests, source count, token reservations and configurable price-based cost estimates are capped in application code, independently of model output. Provider failures do not trigger unbounded retries: there is one primary attempt and at most one optional fallback attempt for each LLM operation.

Hermes cannot force another round or publish a report. Apollo permits early reporting only when all scheduled tasks completed, per-section evidence thresholds are met, every section and the overall review meet the mode's coverage target, Hermes recommends readiness, and no high-priority gaps remain. Otherwise Apollo schedules novel follow-ups. Round/search/source caps or exhausted novel queries stop evidence collection and allow a qualified report from existing evidence. No evidence, timeout, exhausted token/cost budget, invalid outputs or provider failures stop the session without publishing a completed report.

`POST /api/sessions/:id/cancel` atomically marks a queued/running session cancelled, publishes the state and aborts its active worker. Cancellation is idempotent for an already cancelled session; other terminal sessions return 409. Later checkpoints cannot revive a cancelled session. Final report publication checks active ownership, cancellation and the deadline in MongoDB; an uncommitted report is removed when that commit loses a cancellation/deadline race. Report APIs only expose a report for completed sessions.

Sessions are claimed atomically to prevent duplicate execution. Workers and abort controllers are process-local. Shutdown aborts workers and allows a bounded period to persist stop state. On startup, sessions left queued/running before that process started are marked failed. This is single-process execution, not a resumable distributed job queue; a durable queue and shared cancellation/event delivery are needed for multi-instance hosting.

## Provider configuration

Groq is the required primary provider. Add `GEMINI_API_KEY` to allow Gemini (disable it with `GEMINI_FALLBACK_ENABLED=false`) after a failed, malformed or schema-invalid primary response. `GEMINI_MODEL` defaults to `gemini-2.5-flash`; choose a currently available model for your account. All LLM calls pass through `server/services/providers.js`. Both providers return JSON; Zod schemas and semantic validators reject invalid plans, unknown section/source references, missing citations, and invalid citation indices before their results reach subsequent stages.

The adapters follow the official [Groq structured-output contract](https://console.groq.com/docs/structured-outputs) and [Gemini generateContent contract](https://ai.google.dev/api/generate-content). Both providers use JSON mode with the schema supplied in instructions and validated in the application. This avoids Gemini schema-complexity rejections for nested evidence audits. Credentials are server-side headers, never browser variables or response data.

## Budgets and accounting

Optional server caps are `APOLLO_MAX_ROUNDS`, `APOLLO_TIMEOUT_MS`, `APOLLO_MAX_SEARCH_REQUESTS`, `APOLLO_MAX_TOKENS` and `APOLLO_MAX_COST_USD`. See `.env.example`.

Before every LLM attempt, Apollo reserves UTF-8 input bytes plus message overhead and the maximum output allocation against the token budget. This is deliberately conservative in the absence of a provider tokenizer. When a provider reports usage, the reservation is replaced by its reported total. Missing usage and failed/aborted requests retain conservative reservations because their billable usage is unknown. Gemini's total reported usage includes non-visible token consumption when the provider reports it. All attempts, including fallback, count toward usage.

`usage` distinguishes `reportedTokens`, `estimatedTokens`, `tokensCharged`, prompt/completion tokens, LLM/search requests, unreported requests and unpriced requests. Cost uses configured, model-specific `GROQ_INPUT_USD_PER_MILLION`, `GROQ_OUTPUT_USD_PER_MILLION`, corresponding `GEMINI_*` rates, and `TAVILY_USD_PER_REQUEST`. Set a conservative Tavily rate appropriate to the selected search depth. Prices are not guessed or fetched automatically. An explicit cost cap is rejected unless every enabled provider has configured rates. Unknown prices are shown as partial estimates rather than as free usage. These estimates control dispatch and are not provider billing guarantees; keep prices current and use provider-side spending controls where needed.

## API example

```http
POST /api/sessions
Content-Type: application/json

{
  "topic": "Impact of AI on Indian agriculture",
  "mode": "deep",
  "maxRounds": 4,
  "limits": {
    "timeoutMs": 600000,
    "maxSearchRequests": 30,
    "maxSources": 60,
    "maxTokens": 200000
  }
}
```

`limits` is optional. Callers may lower ceilings but cannot raise the mode or server caps or override internal policy fields. Add `maxCostUsd` only after configuring all relevant rates. The returned session contains the effective limits. `GET /api/sessions/:id` and its SSE stream expose the persisted state, including live tasks, decisions and usage.

## Verification

`npm test` exercises the real orchestration implementation with injected, deterministic provider/repository test doubles: dependency dispatch, follow-up scheduling, deduplication of follow-up queries, premature readiness, mode policies, cancellation, deadlines and failure persistence. Provider tests exercise real adapter parsing, fallback bounds, token accounting and abort propagation using intercepted fetch responses. Repository tests verify atomic write filters and report cleanup on cancellation/deadline races. These are test fixtures only; none are imported into the application or seeded into MongoDB. A live MongoDB/provider run still requires real credentials and a reachable database.

Athena now owns task retrieval, normalized query memory, source assessment, cross-URL duplicate detection and separate passage persistence. See [Athena retrieval](athena-retrieval.md) for current search-provider configuration, additional cost-rate requirements and the evidence API.
