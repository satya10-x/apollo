# Hermes evidence-quality review

Hermes is invoked by the real Apollo orchestration engine after Athena’s task collection and synthesis. It reads the session’s persisted Source and Evidence records again before each review. No separate agent demo or independent research loop is created.

## Review flow

1. Build a corpus from actual external Evidence records and the original research blueprint. Check source links, session identity, origin, passage length and SHA-256 passage hashes. Missing or edited records cannot establish support.
2. Assign stable IDs to Athena’s extracted claims. Invalid or missing source/evidence citations are classified unsupported before model review.
3. Audit every section’s questions, valid claims, sources and passages in bounded batches. Each batch contains at most 12 claims and 24 passages, with full retained passages up to 1,600 characters. Claim references stay together; additional coverage batches inspect remaining section evidence.
4. Validate every model response. All supplied questions, claims and sources must be reviewed exactly once. Answered questions require actual evidence IDs. Claim support and opposition must quote exact, substantive substrings from supplied passages. Unknown IDs, invented quotes, opposing evidence labelled fully supported, and invalid source references reject that audit.
5. Run a cross-section comparison using an actual representative passage from every evidence-backed source. It receives no generated research summaries as evidence. Quotes are validated against the precise text supplied to that comparison.
6. Aggregate coverage, source concerns, contradictions, missing dimensions, specific follow-ups and the quality breakdown in backend code.
7. Produce `NEEDS_MORE_RESEARCH`, `COMPLETE`, or `INCOMPLETE_LIMIT_REACHED` using application rules. Apollo schedules tasks or directs qualified reporting; the model cannot grant itself another round.

Section audits are cached by fingerprints of their blueprint, actual passages, source metadata and claims. Unchanged sections can reuse their audits in later rounds. Changes to evidence, claims or source metadata invalidate the relevant cache. Only the latest review retains raw audit-cache payloads; older rounds retain their verdicts, metrics and disclosures without duplicating that cache. The cache does not replace missing records or turn unreviewed material into support.

## Coverage and claims

Every blueprint section returns:

- Each sub-question’s `ANSWERED`, `PARTIALLY_ANSWERED` or `UNANSWERED` status, supporting evidence IDs and a concise reason.
- Answered and partially answered question IDs, missing information and derived coverage.
- Actual source IDs, collected and inspected source counts, usable source count, distinct domains and likely primary-source coverage.
- Explicit missing inspected official-source and primary-source indicators. Collected-but-unreviewed records remain visible without counting as verified coverage.
- Evidence-quality counts for supported, partial, conflicting, unsupported and unreviewed claims.
- Research completeness and whether the question is time-sensitive.

Coverage is calculated as `(answered + 0.5 × partially answered) / planned questions × 100`. The model does not return the numeric coverage score.

Claims are classified `SUPPORTED`, `PARTIALLY_SUPPORTED`, `CONFLICTING` or `UNSUPPORTED`, with quoted support/opposition, source and evidence IDs, and reasons. A separate `reviewStatus` distinguishes reviewed unsupported claims from invalid citations and claims that could not be inspected. Lack of inspection does not mean the statement was proven false; it means support has not been established.

These are evidence-linked model judgments, not independent factual certification. Verbatim quotes make the judgment reviewable; quote matching alone does not prove entailment or source reliability.

## Contradictions

Every contradiction preserves both claims, exact supporting quotes, evidence IDs and source IDs. Original source titles, URLs and publication dates are joined by backend code from the stored records; the model does not supply publication dates. Unknown dates stay unknown.

The review explains geographical, methodological and temporal differences and classifies the conflict:

- `GENUINE`: competing claims remain in conflict.
- `CONTEXTUAL`: the difference is explained by scope, geography, time or method; both sides remain visible.
- `UNRESOLVED`: the available evidence does not establish whether the conflict is substantive or contextual.

Genuine and unresolved conflicts require targeted follow-up queries and prevent `COMPLETE`. A conflicting claim always creates a visible contradiction record even if the model omitted a duplicate entry. The report receives both sides, and the backend appends conflict disclosures with both source citations and dates, so reporting cannot silently discard a known conflict.

The global comparison uses one actual 600-character representative passage per source, supplemented by full passage comparisons in section audits. It is **not exhaustive pairwise fact checking**. Its scope and completion status are visible in `inspection`. “No conflicts identified” does not mean that no conflicts exist.

## Source review and gaps

Hermes flags irrelevant, outdated, weakly supported, repetitive and potentially unreliable sources. Source assessments remain heuristic. Duplicate-copy provenance is counted once and labelled repetitive, rather than treated as independent corroboration.

Publication dates absent or in the future cannot establish freshness. For time-sensitive research, evidence over three years old triggers current-corroboration requests. Historical questions can use historically appropriate evidence; age alone is not a universal reliability judgment. The three-year rule is an explicit review heuristic, not a domain-specific standard.

Backend gap detection supplements model feedback for unanswered questions, weak domain diversity, missing primary or explicitly requested official sources, time-sensitive missing/old dates, unsupported claims, missing dimensions and unresolved contradictions. An academic primary source does not silently satisfy a blueprint requirement for official government evidence.

Each follow-up request contains `sectionId`, optional original `questionId`, `missingQuestion`, `query`, `expectedEvidence`, `reason`, priority and gap kind. Apollo passes these fields to actual Athena tasks and deduplicates queries against prior tasks. Requests beyond the round’s dispatch limit remain visible as gaps rather than being silently treated as completed.

## Transparent quality score

`quality.components` exposes each score, weight, numerator/denominator, explanation and measurement status:

| Component                | Weight | Calculation                                                                                        |
| ------------------------ | ------ | -------------------------------------------------------------------------------------------------- |
| Section coverage         | 30%    | Answered = 1; partially answered = 0.5; missing/unreviewed = 0                                     |
| Evidence support         | 30%    | Supported claim = 1; partial = 0.5; conflicting, unsupported or unreviewed = 0                     |
| Source quality           | 20%    | Stored heuristic source quality adjusted for review flags; missing assessments contribute zero     |
| Source freshness         | 10%    | Current dated sources among sources used in time-sensitive sections; unknown dates contribute zero |
| Contradiction resolution | 10%    | Contextualized conflicts among identified conflicts; unresolved conflicts contribute zero          |

Source quality penalties are explicit: irrelevant sources contribute zero; potentially unreliable sources retain 40% of the stored heuristic score; weakly supported sources retain 60%. Other sources retain the stored heuristic score. This is an indicator, not verified authority.

Freshness is not applicable only when no reviewed question needs current information. A not-applicable component is excluded and remaining weights are normalized. Unknown **applicable** components contribute zero; they are not silently dropped. If comparison completed and no conflicts were identified, contradiction resolution receives 100 with an explicit absence-not-proven explanation; if comparison was incomplete or fewer than two usable sources exist, that component is unknown and contributes zero.

Overall: `sum(component score × weight) / sum(applicable weights)`. Raw counts, explanations, inspection completeness and qualifications are displayed alongside the number in the workspace.

## Completion and controlled execution

`COMPLETE` requires completed inspection, reviewed supported claims, section coverage at the mode target, minimum usable source coverage and domain diversity, required primary/official evidence, no unresolved contradictions, no high-priority gaps and no critical source-quality concerns. This means sufficient evidence under the configured policy, not guaranteed truth.

If deficiencies remain and rounds, searches or source capacity are exhausted, the outcome is `INCOMPLETE_LIMIT_REACHED`. Exhausted novel queries, token/cost limits or deadlines can also make the review incomplete. A fully adequate final-round review can be `COMPLETE`; merely reaching a round cap never manufactures completeness.

An Athena synthesis/provider failure preserves its retrieved records and marks the task skipped; Hermes can still inspect the actual passages, with missing verified findings recorded as a gap.

Audit/provider failure or a budget stop leaves claims and passages explicitly unreviewed. No evidence means zero coverage and explicit gaps; AI summaries are not a substitute. Cancellation still propagates immediately. Apollo’s bounded loop and provider retries remain authoritative.

A qualified report may be generated from available evidence after research limits, with the incomplete decision, remaining gaps and conflict disclosures. If no valid evidence exists, Apollo persists the review and fails report generation explicitly. If a token/deadline stop also prevents writing, the partial review remains visible in the failed session.

## API and interface

- `GET /api/sessions/:id/review` returns the latest persisted review, or `null` before review/for older sessions.
- Session detail and SSE continue to carry review history and execution decisions.
- The workspace shows the quality calculation, question coverage, evidence/claim inspection counts, claim verdicts, source concerns, contradiction quotes and dated source links, and follow-up requests.
- Reports retain a `reviewSnapshot` with the decision, quality breakdown, inspection information and contradictions. Incomplete status is visible in the reader and limitations.

No existing session data is reseeded or rewritten. Older title-only plans and reviews remain readable.

## Verification

`npm test` covers real review/validation/scoring code using deterministic provider fixtures, including missing and corrupted evidence, fabricated quotes, invalid references, partial/unsupported claims, contextual/genuine conflicts, missing dimensions, source concerns, budget limits, cache invalidation and application stopping behavior. Fixtures are not loaded into the application.

`npm run verify:hermes` is an opt-in, API-consuming check of the real Apollo→Athena→Hermes pipeline in a uniquely named temporary MongoDB database. It uses one bounded Quick session with at most one source and two searches to verify explicit incomplete-evidence handling, checks persisted evidence-level review and quality fields, and removes only its temporary database. It does not add sessions or reports to application history. Live provider availability and model response validity may stop an upstream stage before Hermes; the script reports that stop rather than substituting fake evidence.

### Provider rejection recovery

Model throttling is separate from research coverage. The provider service honors
`Retry-After` (seconds or HTTP date), or exhausted-resource reset durations, and
shares known cooldowns across requests in the same server process. It tries a
configured alternative before waiting, retries each throttled provider at most
once per operation, and never waits past the execution deadline. Cancellation
interrupts the wait. This is process-local coordination, not a distributed quota
manager. Rejected inference requests release their token reservations.

Hermes splits an oversized section audit into smaller batches when possible,
keeping each claim attached to all its cited passages and validating every child
response normally. An indivisible oversized claim still fails explicitly.
Provider diagnostics persist safe application-authored reason codes, HTTP status
and retry times; provider response bodies and credentials are not stored.
If no claims can be verified because the provider failed, report generation
surfaces that failure instead of replacing it with a generic evidence/round-limit
message. Partial reviewed findings retain the existing publication checks.
Already-failed sessions retain their saved evidence and status; these changes
apply on a new research run after deploying the backend.

### Execution time reserves and provider outages

The execution deadline is still a hard limit. Gathering stops at 60% of the
allocated time, Hermes model calls stop at 85%, and optional report model calls
stop at 90%. All phases share token/search accounting and cancellation. The
remaining time is reserved for assembling validated blocks and persistence;
phases cannot extend the configured deadline. A time-limited review retains
finished audits and discloses uninspected evidence. Report writers can use exact
reviewed claims and deterministic assembly when their model-call window expires.
This never turns unreviewed evidence into a verified claim.

After the provider service exhausts recovery for a rate limit or unavailable
provider, Athena stops further tasks and Hermes stops further audit batches.
These failures do not schedule follow-up searches: collecting more sources does
not restore model availability. Non-systemic invalid output retains the existing
per-task/per-batch failure behavior. If Groq rejects an oversized request while
Gemini is throttled, the size error is retained alongside both provider statuses,
so Athena/Hermes can shrink the request instead of hiding it behind the last
fallback error. Athena retries progressively smaller evidence sets with normal
citation validation; an indivisible request fails explicitly.

An exhausted provider quota still requires available provider capacity. Local
regression tests use simulated model responses and elapsed time, not live keys.
