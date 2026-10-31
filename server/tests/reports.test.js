import test from "node:test";
import assert from "node:assert/strict";
import { generateReport } from "../services/reports/generate.js";
import { reportCorpus, sectionContext } from "../services/reports/context.js";
import { validateWriter } from "../services/reports/writers.js";
import { validateAssembly } from "../services/reports/assembler.js";
import { materializeCitations } from "../services/reports/citations.js";
import { exportMarkdown } from "../services/reports/markdown.js";
import { exportPDF } from "../services/reports/pdf.js";
import { reportFixture } from "./helpers/reportFixture.js";
import {
  reportProvider,
  writerResponse,
  assemblerResponse,
} from "./helpers/reportProvider.js";
import { ExecutionStopped } from "../services/apollo/errors.js";
const build = async (f, options = {}) =>
  generateReport({ ...f, providers: reportProvider(options) });
test("two-stage writing runs only after research and preserves section scope and reviewed factual wording", async () => {
  const f = await reportFixture(),
    calls = [],
    progress = [];
  const { data } = await generateReport({
    ...f,
    providers: reportProvider({ onCall: (o) => calls.push(o) }),
    onProgress: async (p) => progress.push(p),
  });
  assert.equal(data.formatVersion, 2);
  assert.equal(data.sections.length, 4);
  assert.equal(
    calls.filter((o) => o.system.startsWith("APOLLO_SECTION_WRITER")).length,
    4,
  );
  assert.ok(calls.at(-1).system.startsWith("APOLLO_REPORT_ASSEMBLER"));
  for (const call of calls.filter((o) =>
    o.system.startsWith("APOLLO_SECTION_WRITER"),
  )) {
    assert.ok(
      call.input.evidence.every((item) =>
        f.evidence
          .find((e) => e._id === item.evidenceId)
          .sectionIds.includes(call.input.section.id),
      ),
    );
    assert.ok(
      call.input.verifiedClaims.every((c) =>
        f.state.reviews[0].claimReviews.some(
          (review) =>
            review.claimId === c.claimId &&
            review.sectionId === call.input.section.id,
        ),
      ),
    );
  }
  const factTexts = new Set(
    f.state.reviews[0].claimReviews.map((c) => c.statement),
  );
  assert.ok(
    data.sections
      .flatMap((s) => s.blocks)
      .filter((b) => b.kind === "fact")
      .every((b) => factTexts.has(b.text)),
  );
  assert.equal(progress.at(-1).status, "validated");
  assert.equal(data.generation.sectionWriters.length, 4);
});
test("writers are forbidden before loop completion, while tasks are pending, or while Hermes requests more research", async () => {
  for (const variant of ["unfinished", "pending", "review"]) {
    const f = await reportFixture();
    if (variant === "unfinished") delete f.state.researchFinishedAt;
    if (variant === "pending") f.state.tasks[0].status = "pending";
    if (variant === "review")
      f.state.reviews[0].decision = "NEEDS_MORE_RESEARCH";
    let calls = 0;
    await assert.rejects(build(f, { onCall: () => calls++ }), /before|finish/);
    assert.equal(calls, 0);
  }
});
test("out-of-section IDs, invented links and unverified analysis premises are rejected", async () => {
  const f = await reportFixture(),
    context = sectionContext(
      f.state,
      f.state.blueprint.sections[0],
      reportCorpus(f.state, f.sources, f.evidence),
    );
  assert.throws(
    () =>
      validateWriter(
        {
          sectionId: "s0",
          claimIds: [f.state.reviews[0].claimReviews[1].claimId],
          analyses: [],
        },
        context,
      ),
    /out-of-section/,
  );
  assert.throws(
    () =>
      validateWriter(
        {
          sectionId: "s0",
          claimIds: [],
          analyses: [
            {
              id: "a",
              kind: "analysis",
              text: "See https://invented.example",
              claimIds: [context.claims[0].claimId],
            },
          ],
        },
        context,
      ),
    /invent/,
  );
  assert.throws(
    () =>
      validateWriter({ sectionId: "s1", claimIds: [], analyses: [] }, context),
    /assigned/,
  );
});
test("invalid writer output falls back to exact reviewed claims without publishing invented prose", async () => {
  const f = await reportFixture();
  const { data } = await build(f, {
    writer: (input) => ({
      ...writerResponse(input),
      claimIds: ["invented"],
      body: "Unsupported new global assertion",
    }),
  });
  assert.ok(
    data.generation.sectionWriters.every(
      (s) => s.mode === "extractive_fallback",
    ),
  );
  assert.ok(!JSON.stringify(data).includes("Unsupported new global assertion"));
  assert.ok(data.sections.every((s) => s.blocks.length));
});
test("sections without eligible verification disclose unavailable information and do not call a writer", async () => {
  const f = await reportFixture();
  f.state.reviews[0].claimReviews = f.state.reviews[0].claimReviews.filter(
    (c) => c.sectionId !== "s1",
  );
  const calls = [];
  const { data } = await build(f, { onCall: (o) => calls.push(o) });
  const section = data.sections.find((s) => s.sectionId === "s1");
  assert.equal(section.blocks.length, 0);
  assert.ok(section.unavailableQuestions.length);
  assert.ok(!calls.some((c) => c.input.section?.id === "s1"));
});
test("cross-section evidence links and tampered reviewed statements cannot become report facts", async () => {
  const f = await reportFixture();
  f.evidence[0].sectionIds = ["s2"];
  f.evidence[0].taskIds = ["task2"];
  f.state.reviews[0].claimReviews[1].statement = "A new invented claim";
  const { data } = await build(f);
  assert.equal(data.sections[0].blocks.length, 0);
  assert.equal(data.sections[1].blocks.length, 0);
  assert.ok(!JSON.stringify(data).includes("A new invented claim"));
});
test("analysis is published only after grounded inference validation with exact supporting passages", async () => {
  const f = await reportFixture();
  const { data } = await build(f, {
    writer: (input) => ({
      ...writerResponse(input),
      analyses: [
        {
          id: "a1",
          kind: "opportunity",
          text: "The reported programme could warrant further scoped evaluation.",
          claimIds: [input.verifiedClaims[0].claimId],
        },
      ],
    }),
    grounding: (input) => ({
      assessments: input.analyses.map((a) => ({
        analysisId: a.id,
        verdict: "SUPPORTED_INFERENCE",
        reason: "Qualified inference from the reviewed premise.",
        grounding: [
          {
            evidenceId: input.evidence[0].evidenceId,
            quote: input.evidence[0].passage.slice(0, 80),
          },
        ],
      })),
    }),
    assembler: (input) => ({
      ...assemblerResponse(input),
      opportunities: input.sections
        .flatMap((s) => s.blocks)
        .filter((b) => b.kind === "opportunity")
        .slice(0, 2)
        .map((b) => b.id),
    }),
  });
  assert.ok(data.opportunities.length > 0);
  assert.ok(
    data.opportunities.every(
      (b) =>
        b.verification === "SUPPORTED_INFERENCE" && b.citationNumbers.length,
    ),
  );
});
test("unsupported or fabricated-quote analysis is omitted rather than treated as a factual finding", async () => {
  for (const invalid of [false, true]) {
    const f = await reportFixture();
    const { data } = await build(f, {
      writer: (input) => ({
        ...writerResponse(input),
        analyses: [
          {
            id: "a1",
            kind: "risk",
            text: "A proposed unsupported interpretation.",
            claimIds: [input.verifiedClaims[0].claimId],
          },
        ],
      }),
      grounding: (input) => ({
        assessments: [
          {
            analysisId: "a1",
            verdict: invalid ? "SUPPORTED_INFERENCE" : "UNSUPPORTED",
            reason: "No adequate support.",
            grounding: invalid
              ? [
                  {
                    evidenceId: input.evidence[0].evidenceId,
                    quote: "This fabricated supporting passage does not exist.",
                  },
                ]
              : [],
          },
        ],
      }),
    });
    assert.ok(
      data.sections.every((s) => s.blocks.every((b) => b.kind !== "risk")),
    );
    assert.ok(data.limitations.some((l) => l.includes("omitted")));
  }
});
test("assembler cannot introduce unknown blocks or relabel analysis as established facts", () => {
  assert.throws(
    () =>
      validateAssembly(
        {
          executiveSummary: ["unknown"],
          keyFindings: [],
          opportunities: [],
          risks: [],
          conclusion: [],
        },
        [],
      ),
    /existing/,
  );
  assert.throws(
    () =>
      validateAssembly(
        {
          executiveSummary: ["a"],
          keyFindings: [],
          opportunities: [],
          risks: [],
          conclusion: [],
        },
        [{ id: "a", kind: "analysis" }],
      ),
    /established fact/,
  );
});
test("citation numbering is stable, source-based, bidirectional and backed by original evidence", async () => {
  const f = await reportFixture(),
    { data } = await build(f);
  assert.deepEqual(
    data.references.map((r) => r.number),
    [1, 2, 3, 4],
  );
  assert.equal(
    new Set(data.references.map((r) => r.sourceId)).size,
    data.references.length,
  );
  for (const mapping of data.sourceMappings) {
    assert.ok(mapping.claimIds.length);
    assert.ok(mapping.occurrences.length);
    for (const quote of mapping.citations) {
      assert.ok(
        f.evidence
          .find(
            (e) => e._id === quote.evidenceId && e.source === quote.sourceId,
          )
          .passage.includes(quote.quote),
      );
    }
    for (const id of mapping.sourceIds)
      assert.ok(
        data.references
          .find((ref) => ref.sourceId === id)
          .blockIds.includes(mapping.blockId),
      );
  }
  assert.ok(
    data.references.every((ref) =>
      f.sources.some(
        (source) => source._id === ref.sourceId && source.url === ref.url,
      ),
    ),
  );
});
test("known contradictions survive assembly with both evidence sides, dates and source references", async () => {
  const f = await reportFixture();
  f.state.reviews[0].contradictions = [
    {
      id: "conflict-test",
      classification: "UNRESOLVED",
      resolved: false,
      left: {
        claim: "One reporting scope",
        evidenceId: "e0",
        sourceId: "source0",
        quote: f.evidence[0].passage.slice(0, 80),
      },
      right: {
        claim: "Another reporting scope",
        evidenceId: "e1",
        sourceId: "source1",
        quote: f.evidence[1].passage.slice(0, 80),
      },
      explanation: "The reporting scopes require comparison.",
      geographicalDifferences: "Different districts.",
      methodologicalDifferences: "Methodology not stated.",
    },
  ];
  f.state.reviews[0].decision = "INCOMPLETE_LIMIT_REACHED";
  const { data } = await build(f);
  assert.equal(data.contradictions.length, 1);
  assert.equal(data.contradictions[0].sourceIds.length, 2);
  assert.equal(data.contradictions[0].citationNumbers.length, 2);
  assert.match(data.contradictions[0].text, /unresolved/);
  assert.match(data.contradictions[0].text, /2026-07-01/);
});
test("a missing contradiction passage blocks publication instead of hiding the disagreement", async () => {
  const f = await reportFixture();
  f.state.reviews[0].contradictions = [
    {
      id: "bad",
      left: { evidenceId: "missing", sourceId: "source0", quote: "missing" },
      right: {
        evidenceId: "e1",
        sourceId: "source1",
        quote: f.evidence[1].passage,
      },
    },
  ];
  await assert.rejects(build(f), /lost its source/);
});
test("source mappings reject invented, mismatched and ungrounded citations", async () => {
  const f = await reportFixture(),
    { data } = await build(f);
  const copy = structuredClone(data);
  copy.sections[0].blocks[0].citations[0].sourceId = "invented";
  assert.throws(
    () => materializeCitations(copy, f.sources, f.evidence),
    /mapping/,
  );
});
test("budget and cancellation stops propagate without publishing partial reports", async () => {
  for (const code of ["token_budget", "cancelled"]) {
    const f = await reportFixture();
    await assert.rejects(
      generateReport({
        ...f,
        providers: {
          generateJSON: async () => {
            throw new ExecutionStopped(code, "Stop");
          },
        },
      }),
      { code },
    );
  }
});
test("Markdown contains the complete consulting report structure and linked original references", async () => {
  const f = await reportFixture(),
    { data } = await build(f),
    md = exportMarkdown(data);
  for (const heading of [
    "Executive Summary",
    "Research Objective and Scope",
    "Key Findings",
    "Detailed Research Sections",
    "Contradictions and Evidence Limitations",
    "Future Opportunities and Risks",
    "Conclusion",
    "References",
  ])
    assert.ok(md.includes(heading));
  assert.ok(md.includes("(#reference-1)"));
  assert.ok(md.includes(data.references[0].url));
  assert.ok(md.includes('<a id="reference-1"></a>'));
});
test("PDF export is a real document with embedded fonts, internal citation destinations and external links", async () => {
  const f = await reportFixture(),
    { data } = await build(f),
    pdf = await exportPDF(data);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdf.length > 10000);
  assert.ok(pdf.includes(Buffer.from("/URI")));
  assert.ok(pdf.includes(Buffer.from("reference-1")));
  assert.ok(pdf.includes(Buffer.from("/FontFile2")));
});

test("reports with no verified section claims are never published as completed intelligence", async () => {
  const f = await reportFixture();
  f.state.reviews[0].claimReviews = [];
  await assert.rejects(build(f), { code: "no_verified_evidence" });
});

test("unverified claim text is not republished as a factual evidence limitation", async () => {
  const f = await reportFixture();
  f.state.gaps = [
    "An unsupported numeric assertion from an unreviewed finding.",
  ];
  f.state.gapDetails = [
    {
      description: f.state.gaps[0],
      reason: "Some extracted claims were not inspected and are excluded.",
    },
  ];
  const { data } = await build(f);
  assert.ok(!data.limitations.includes(f.state.gaps[0]));
  assert.ok(data.limitations.includes(f.state.gapDetails[0].reason));
});
