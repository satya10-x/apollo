# Athena retrieval and evidence

Athena is Apollo's section-task retrieval service. It has no standalone demo route. Both initial section queries and Hermes follow-ups use this production path:

```text
Apollo dispatches a dependency-ready task with a source allowance
  → Athena checks session query memory
  → runs uncached queries in bounded parallel batches
  → Tavily Search → optional Exa fallback
  → optional arXiv supplement for academic evidence requirements
  → normalizes and assesses returned source text
  → merges duplicate sources while retaining retrieval provenance
  → selects verbatim supporting spans
  → persists source metadata and separate Evidence records
  → synthesizes structured claims citing source IDs AND evidence IDs
  → Apollo passes findings and retrieved evidence to Hermes
```

## Real retrieval contracts

Tavily is primary. The adapter uses the [Tavily Search API](https://docs.tavily.com/documentation/api-reference/endpoint/search), requests page text with `include_raw_content: "text"`, explicitly disables `include_answer`, and requests publication dates. If page text is missing, a returned search excerpt can be used and is labelled `search_excerpt`, with lower completeness in the heuristic assessment.

When `EXA_API_KEY` is configured and `EXA_FALLBACK_ENABLED` is true, failed or empty primary searches can fall back to the [Exa Search API](https://exa.ai/docs/reference/search). Exa requests page text with a character limit. Its generated summary and answer fields are never accepted as evidence. Only allowlisted retrieval text fields and valid original HTTP(S) URLs can enter the evidence path. Credentials are read from the root `.env` and sent only in server-side provider headers.

For task evidence requirements mentioning academic papers, peer review, preprints or scientific studies, Athena can add an [arXiv API](https://info.arxiv.org/help/api/user-manual.html) query. The public Atom feed supplies the original paper URL, author abstract and publication date. Abstracts are labelled `abstract`; being on arXiv does not establish peer review. arXiv calls are serialized across sessions within the process and start at least three seconds apart. This is not a substitute for a shared rate limiter across multiple server instances.

Queries pass through the same Apollo request/cost/deadline controls. Every dispatched retry, fallback and arXiv call counts as a search request. arXiv has a zero configured API price; Tavily/Exa use configured price estimates. An explicit cost cap requires `EXA_USD_PER_REQUEST` when Exa fallback is enabled with a key. This value should include the relevant search and content-extraction charges. No provider prices are guessed.

## Configuration

| Variable                  | Default | Purpose                                                                 |
| ------------------------- | ------- | ----------------------------------------------------------------------- |
| TAVILY_API_KEY            | empty   | Primary search key; enabled Exa can handle missing Tavily configuration |
| EXA_API_KEY               | empty   | Optional fallback key                                                   |
| EXA_FALLBACK_ENABLED      | true    | Use Exa when its key is configured                                      |
| EXA_USD_PER_REQUEST       | unknown | Conservative request/content price for cost budgeting                   |
| ATHENA_SEARCH_CONCURRENCY | 2       | Concurrent queries per task, capped at 4                                |
| ATHENA_MAX_RETRIES        | 1       | Extra attempts per provider, bounded to 0–2                             |
| ATHENA_SEARCH_TIMEOUT_MS  | 30000   | Individual request timeout, also bounded by Apollo's remaining time     |
| ATHENA_ARXIV_ENABLED      | true    | Add academic API queries where appropriate                              |
| ATHENA_ARXIV_INTERVAL_MS  | 3000    | Minimum arXiv start interval; cannot be configured below 3000           |

## Source metadata

Every new source has a MongoDB `_id` and matching `sourceId`, original URL, canonical URL/aliases, title, domain, category, publication date when provided, retrieval dates, associated sections, assessments and retrieval provenance. Links always retain a URL actually returned by an external API; canonical URLs are identity keys, not invented source links.

Supported categories are Academic research, Government, Industry report, Company, News, Technical documentation, Statistical dataset and Web. Classification uses adapter metadata and transparent domain/path/title rules. It is heuristic, not independently established publisher identity. Unrecognized sources remain Web.

New retrieval does not store page text in source metadata. The legacy `Source.content` field remains readable for old sessions only. Duplicate detection stores hashes and bounded hashed shingle signatures rather than raw page bodies in source metadata.

## Heuristic quality assessment

An assessment combines domain/category credibility signals, inferred primary-versus-secondary role, provider ranking plus query-term overlap, publication age when known, and retrieved-text completeness. Missing/future publication dates produce unknown freshness rather than an invented date. The assessment includes dimension scores, reasons, evaluation date, query, method version, and this visible qualification:

> Heuristic assessment, not verified authority, factual accuracy or peer-review status.

The source explorer exposes these reasons. Government domains, academic repositories or company pages are not treated as proof that every claim is reliable. Company sources are primary only for their own claims; an academic source may be an unreviewed preprint. The completeness score distinguishes page text, abstracts and search excerpts and does not certify complete page coverage.

## Duplicate handling

URL identity removes fragments and known tracking parameters, normalizes host/parameter order and retains meaningful query parameters. Exact normalized text matches can merge the same article at different URLs. Conservative near-duplicate matching requires substantial hashed-shingle overlap and compatible titles. Similarity matches remain labelled heuristics; deduplication is not perfect.

A merged record retains original URLs, provider/query/request identifiers, retrieval times, publication metadata, document hashes, section associations, per-retrieval assessments, and duplicate-match methods/similarity. Evidence keeps its own original URL and retrieval provenance, even when its supporting source record has merged with another article copy.

## Evidence boundary

`Evidence` is separate from `Source`. Each evidence item has a MongoDB `_id` and matching `evidenceId`, supporting `source` ID, exact `passage`, question(s), section/task associations, retrieval date and provenance. Its origin is constrained to `external_api`.

Athena splits the retained provider text into bounded spans and ranks them by question overlap and numeric content. Before persistence, it verifies that every selected passage equals the exact substring at its recorded offsets. This selection is deterministic; no language model writes evidence passages. Provenance includes provider, query, original URL, content kind, document hash and offsets. Hashes/offsets describe the retained text window, not an archived full page. Provider text is capped at 24,000 characters per result and selected passages at 1,400 characters each.

These are useful candidate factual passages, not independently verified facts. The synthesis context is capped at 24 passages, prioritizes the current task, and bounds prerequisite summaries. The full evidence remains available in MongoDB.

Athena's subsequent LLM-generated summaries and claims are stored only in session `findings`. Every generated claim must reference existing, assigned evidence IDs and their matching source IDs; mismatched or invented references are rejected. Hermes receives source-number mappings and retrieved passages separately from generated findings.

## Memory and failures

Session `researchMemory.queries` records normalized query and retrieval kind, status, attempts, task/section associations and accepted source IDs. `investigatedQuestions` records the task question and collected source/evidence IDs. An identical normalized query is not dispatched again during the session; cached records gain new section/question associations without inventing a new retrieval date. Queries that were planned but never dispatched can be scheduled later. Failed queries remain visible and are not silently retried in later rounds; Hermes can propose a more specific or different query.

Transient HTTP failures/timeouts have bounded retries; non-transient errors can proceed directly to configured fallback. Empty results remain empty. Partial query failure preserves successful evidence and produces retrieval warnings for Hermes. A task without usable evidence is skipped explicitly. Search limits can end collection with already collected evidence; cancellation, total deadline and token/cost stops remain controlled by Apollo. No generated result, URL or fallback placeholder is substituted for unavailable research.

## API and workspace

- `GET /api/sessions/:id/sources` returns metadata, assessments and provenance without page bodies or internal fingerprints.
- `GET /api/sessions/:id/evidence?sourceId=<id>&limit=20&after=<cursor>` returns supporting passages. `sourceId` and `after` are optional ObjectIds; `limit` is 1–100. `nextCursor` is null at the end.
- `GET /api/sessions/:id` and SSE updates include memory, task evidence IDs and provider usage counts.

The existing source explorer can expand quality-assessment reasons and load supporting passages with pagination. No additional demo or disconnected research screen is added.

## Verification

`npm test` uses deterministic API response fixtures to test the actual adapters, retrieval service, orchestrator and persistence contracts. Fixtures are never seeded into the application.

Optional live checks incur small provider usage charges:

```sh
npm run verify:athena
npm run verify:athena:store
```

The first makes at most one request to each configured Tavily/Exa provider and public arXiv, checks excerpt spans, and pings MongoDB without writes. The second performs a genuine Tavily retrieval through Athena and the production MongoDB repository in a uniquely named disposable database, verifies separate source/evidence persistence and query reuse across sections, then removes only that database. It never writes test records to your application's database. Its MongoDB credential needs permission to create and drop that isolated database.
