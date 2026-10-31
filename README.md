# APOLLO — Deep Research Meta-Agent

A single-user research workspace built with MongoDB, Express, React, Node.js and Tailwind CSS. Apollo understands the topic and orchestrates section-wise research, Athena collects and analyzes web evidence, and Hermes reviews evidence and gaps. Apollo then runs independent section writers and assembles a cited report. No sample research or fabricated session data is seeded.

## Run locally

Requires Node.js 22+ and a reachable MongoDB instance.

```sh
npm install
cp .env.example .env
# Edit .env with your MongoDB URI and provider credentials.
npm run dev
```

Open http://127.0.0.1:5173. The API listens on http://127.0.0.1:4000. Without credentials or MongoDB, the interface remains available with empty states and actionable setup messages; starting research returns an explicit error. Use the loopback hostname shown here so it matches CLIENT_URL.

```sh
npm test
npm run build
npm start
```

After building, Express serves the React application and API together at http://127.0.0.1:4000. Set CLIENT_URL to that origin when running the production build. HOST defaults to loopback locally and `0.0.0.0` when `NODE_ENV=production`; an explicit HOST overrides this default outside Render. On Render (`RENDER=true`), HOST is always `0.0.0.0` so stale loopback settings cannot prevent port detection. This foundation has no authentication; add authentication, user ownership checks, rate limits and a durable worker before exposing it publicly.

## Vercel frontend + Render backend

1. Deploy the repository root as a Render Node web service: build `npm ci --include=dev`, start `npm start`, Node.js 22+. Set `HOST=0.0.0.0`, `NODE_ENV=production`, `CLIENT_URL=https://your-project.vercel.app` (origin only, no trailing slash), MongoDB URI and server-side provider credentials. Let Render supply `PORT`. Health check: `/api/health`.
2. Deploy Vercel with root `client`, build `npm run build`, output `dist`. Set `VITE_API_URL=https://your-backend.onrender.com` (without `/api`). Redeploy after changing this variable because Vite embeds it at build time.
3. Verify the backend health response shows `database: connected` and `researchConfigured: true`, then start research from the frontend. API requests, SSE and report downloads all use the configured backend origin. The client Vercel config handles direct visits to research/report routes.

Leave `VITE_API_URL` unset for local development or a combined Express deployment. For a local separate-origin client, copy `client/.env.example` to `client/.env.local`. Provider credentials belong only on Render, never in Vercel's `VITE_` variables. Use one persistent backend instance for the current in-memory research jobs and SSE streams.

## Environment

All configuration is read and validated in `server/config/env.js`. The root `.env` file is ignored by Git. Never create frontend `VITE_` variables for provider secrets.

| Variable       | Purpose                                                              |
| -------------- | -------------------------------------------------------------------- |
| MONGODB_URI    | MongoDB connection string; local or Atlas                            |
| GROQ_API_KEY   | Server-side Groq credential                                          |
| GROQ_MODEL     | JSON-output-compatible Groq model; default `llama-3.3-70b-versatile` |
| GEMINI_API_KEY | Optional Gemini fallback credential                                  |
| TAVILY_API_KEY | Server-side Tavily search credential                                 |
| EXA_API_KEY    | Optional Exa search fallback credential                              |
| PORT           | API / production web port; default 4000                              |
| CLIENT_URL     | Allowed browser origin; default http://127.0.0.1:5173                |

Groq is the primary LLM and Tavily supplies web evidence. Gemini fallback activates when its key is configured; set `GEMINI_FALLBACK_ENABLED=false` to disable it. Exa supplies optional search fallback when its key is configured. Provider requests send your topic and evidence excerpts to the active providers and may incur usage charges. API keys stay on the server.

Apollo generates validated research blueprints, dispatches dependency-aware Athena tasks, interprets section-wise Hermes feedback and schedules bounded follow-up rounds. Quick, Standard and Deep have distinct source, search, time, token and coverage policies. Sessions support cancellation, structured execution state and usage accounting. No sample research results are created.

See [Hermes evidence review, quality scoring and completion rules](docs/hermes-review.md) for question coverage, claim verification, contradictions and targeted follow-ups.

See [Athena retrieval, evidence and live verification](docs/athena-retrieval.md) for source-quality heuristics, query memory, external APIs and provenance.

See [Apollo engine architecture, limits, configuration and API examples](docs/apollo-engine.md) for the complete execution contract. Coverage and relevance remain agent/provider estimates; review original evidence before relying on conclusions.

## Structure

```text
client/src/
  App.jsx                 App shell and routing
  pages/                  Dashboard, history, collections, session workspace
  api.js                  Reusable API client
  components/             Shared UI, source cards, session list, report reader
  styles.css              Responsive design system + Tailwind
server/
  app.js                  Express app and static frontend serving
  index.js                Startup and graceful shutdown
  config/env.js           Central configuration validation
  controllers/sessions.js Request validation and request handlers
  routes/sessions.js      REST and SSE endpoints
  models/index.js         ResearchSession, Source, Evidence and Report schemas
  services/providers.js   Central Groq/Gemini provider and search service wiring
  services/research.js    Worker lifecycle and cancellation registry
  services/apollo/        Orchestrator, policies, schemas, budgets, persistence
  services/hermes/        Evidence audits, contradictions, quality and completion rules
  services/athena/        Real search, extraction, source assessment and memory
  services/agents/        Athena and Hermes pipeline adapters
  services/reports/       Scoped writers, assembler, citation mapping and exports
  services/events.js      Live session event channel
  services/evidence.js    Bounded excerpts and citation validation
  middleware/errors.js    Central errors and database readiness
  tests/api.test.js       API contract and validation tests
```

The UI provides an overview, session history, global source library, reports, and a dedicated session workspace with activity, coverage, gaps, sources and a report reader. Sources support filtering, external links, heuristic-quality explanations and separate supporting passages. Reports support inline citation navigation, source-to-claim supporting passages, Markdown download and server-generated PDF download.

## API

- `GET /api/health` — readiness flags, without secrets
- `GET /api/sessions` — latest 100 sessions
- `GET /api/sessions/stats` — database totals
- `POST /api/sessions` — `{ topic, mode, maxRounds, requirePlanApproval? }`
- `GET /api/sessions/:id` — session state, plan, events and gaps
- `POST /api/sessions/:id/cancel` — cancel queued/running execution
- `POST /api/sessions/:id/approve-plan` — release an optionally gated research plan
- `DELETE /api/sessions/:id` — delete a finished session and its sources, evidence and report
- `GET /api/sessions/:id/events` — SSE snapshot, updates and heartbeat
- `GET /api/sessions/:id/sources` — source metadata without excerpts
- `GET /api/sessions/:id/evidence` — paginated retrieved supporting passages
- `GET /api/sessions/:id/review` — latest evidence-level Hermes review and quality breakdown
- `GET /api/sessions/:id/report` — report or `null` until ready
- `GET /api/sessions/:id/report/export?format=markdown|pdf` — completed report attachment
- `POST /api/sessions/:id/report/regenerate` — `{ sectionId }`; rewrite from existing reviewed evidence and reassemble citations

## Reliability and future scaling

Sessions, sources, reports and activity are persisted in MongoDB. Source URLs are deduplicated within each session. Provider requests have timeouts; structured model responses are validated; report citations are checked against collected source IDs and exact evidence passages before publication. Source text is treated as untrusted input in prompts and rendered as plain text in React. These measures do not eliminate prompt injection or guarantee source quality.

Research runs inside the Node process and SSE uses a local event emitter. Execution has bounded rounds, search/source counts, an overall timeout, token accounting, optional configured cost caps and abortable cancellation. Atomic claims prevent duplicate workers for a session, and guarded completion prevents cancelled sessions from being revived. A restart marks interrupted sessions failed; it does not silently resume or invent progress. The local concurrent-session guard is not a distributed quota.

For multi-user deployment, add authentication and session ownership, durable job queues, shared cancellation and event delivery, atomic global quotas, pagination, retention controls and operational telemetry. Reports and the global library currently show the latest 100 sessions. Live database/provider verification requires credentials and a reachable MongoDB instance.

## Report generation

Reports start only after research has stopped and Hermes has issued a terminal review. Section writers receive only section-assigned evidence; the assembler selects validated content blocks rather than introducing new factual prose. Reports persist their reference snapshots and claim/evidence mappings in MongoDB. Missing information, conflicts and any extractive fallback are disclosed. See [the report engine documentation](docs/report-engine.md).

`npm run verify:report-exports` creates explicitly labelled synthetic export fixtures in `tmp/pdfs/` for layout checks. It does not call providers or write application records.
