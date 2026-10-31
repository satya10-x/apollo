# Two-stage report engine

Apollo owns the entire execution lifecycle. Report generation does not start until the research loop records `researchFinishedAt` and a stopping reason, all research tasks have settled, and Hermes returns `COMPLETE` or `INCOMPLETE_LIMIT_REACHED`. Cancellation, timeouts and token/cost limits continue to apply during writing and assembly. A limit reached during generation prevents publication of a partial report.

## Independent section writers

`server/services/reports/context.js` constructs the corpus from actual session Evidence records and Hermes evidence-level review. A claim must match the reviewed claim catalog, section, exact statement and supporting passages. Irrelevant or potentially unreliable sources are excluded. Each writer receives only its own section, sub-questions, eligible claims, source metadata, passages and local review findings.

Writers select reviewed claim IDs. The backend renders the exact reviewed factual statement, avoiding new factual prose from model memory. Partial support and conflict remain labelled. Optional analysis, opportunity and risk statements require supported premises and a separate structured grounding review against exact passages. Rejected interpretation is omitted and disclosed. Semantic support is a model judgment, not independent factual certification.

A provider failure or invalid output falls back to bounded, exact reviewed claims, with a visible limitation. Cancellation and execution-limit errors never trigger this fallback. Missing evidence produces an explicit unavailable-information state.

## Assembly and publication

The assembler receives validated section blocks and returns block IDs for the executive summary, key findings, opportunities, risks and conclusion. It cannot write additional factual claims or invent citations. Objective and scope come from the original blueprint. The backend preserves Hermes contradictions, both supporting sides, publication dates, contextual differences and unresolved status.

The report contains title, executive summary, objective and scope, key findings, detailed sections, contradictions and limitations, opportunities and risks, conclusion and references. Shared presentation functions feed both export formats. Existing reports retain their legacy reader and export compatibility.

## Citation traceability

Citation numbering is source-based and assigned by first appearance. Before publication the backend validates that every substantive block has actual source/evidence mappings and that every cited quotation occurs in the stored passage. Source URLs must be valid public HTTP(S) source URLs accepted by the existing URL validator.

MongoDB Report records save `formatVersion: 2`, immutable references, section blocks, `sourceMappings`, generation metadata and a review snapshot. Mappings include block text hashes, claim IDs, evidence IDs, exact quotations and document occurrences. References retain original source URLs and reverse links to block and claim IDs. Repeated appearances of a block share a citation identity. Exporting a v2 report uses the saved reference snapshot rather than mutable source records.

The reader links inline numbers to references and exposes the saved supporting passages. Legacy reports disclose that evidence-level mappings are unavailable; no mappings are fabricated.

## Exports and verification

`GET /api/sessions/:id/report/export?format=markdown|pdf` requires a completed session. Markdown includes numbered citations and original links. PDFKit produces A4 PDFs with embedded Noto fonts, running headers, pagination, internal citation destinations and external source links. Bundled fonts cover Latin and Devanagari text; additional scripts may require extra fonts. Font licenses live in `server/assets/fonts/OFL.txt`.

`npm test` covers section isolation, invented citations, altered reviewed statements, evidence grounding, contradictions, terminal-state guards, stopping limits, immutable exports and legacy handling. `npm run verify:report-exports` generates test-only export fixtures without database writes or external API calls. Render its PDF with `pdftoppm` for visual QA. The fixtures are not research results.
