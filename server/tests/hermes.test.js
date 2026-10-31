import test from "node:test";
import assert from "node:assert/strict";
import { performReview } from "../services/hermes/review.js";
import { completionDecision } from "../services/hermes/quality.js";
import {
  reportReviewContext,
  reviewDisclosures,
} from "../services/hermes/report.js";
import {
  sectionAudit,
  comparisonAudit,
  hermesProvider,
} from "./helpers/hermesProvider.js";
import { hermesFixture } from "./helpers/hermesFixture.js";
import { ExecutionStopped } from "../services/apollo/errors.js";
const run = (fixture, options = {}) =>
  performReview({ ...fixture, providers: hermesProvider(options) });
function conflict(input, classification = "GENUINE") {
  const left = input.evidence[0],
    right = input.evidence[1];
  return {
    left: {
      claim: "The first report describes one scope.",
      evidenceId: left.evidenceId,
      quote: left.passage.slice(0, 100),
    },
    right: {
      claim: "The second report describes a different result.",
      evidenceId: right.evidenceId,
      quote: right.passage.slice(0, 100),
    },
    classification,
    explanation:
      "The figures differ; scope and methodology require comparison.",
    geographicalDifferences:
      "Different reported districts; national comparability is not established.",
    methodologicalDifferences: "Sampling methods are not stated.",
    temporalDifferences:
      "Use the stored publication dates; matched observation periods are unknown.",
    queries:
      classification === "CONTEXTUAL"
        ? []
        : ["crop monitoring district scope methodology original statistics"],
  };
}
test("Hermes inspects actual passages, calculates question coverage, and exposes a deterministic quality breakdown", async () => {
  const f = hermesFixture(),
    calls = [];
  const { data } = await run(f, { onCall: (options) => calls.push(options) });
  assert.equal(data.decision, "COMPLETE");
  assert.equal(data.coverage, 100);
  assert.equal(data.inspection.inspectedEvidenceRecords, 8);
  assert.equal(data.claimReviews.length, 4);
  assert.ok(calls.every((call) => call.input.evidence.length));
  assert.ok(
    calls.every((call) =>
      JSON.stringify(call.input).includes("Official evidence"),
    ),
  );
  assert.ok(
    calls.every(
      (call) => !JSON.stringify(call.input).includes("This is an AI summary"),
    ),
  );
  assert.equal(data.quality.components.sectionCoverage.score, 100);
  assert.equal(data.quality.components.evidenceSupport.score, 100);
  assert.equal(data.quality.components.sourceQuality.score, 80);
  assert.equal(data.quality.score, 96);
  assert.ok(
    data.sections.every(
      (s) =>
        s.answeredQuestions.length === 1 &&
        s.sourceCoverage.uniqueDomains === 2,
    ),
  );
  assert.ok(data.claimReviews.every((c) => c.support[0].quote));
});
test("summaries and source metadata alone cannot manufacture coverage or confidence", async () => {
  const f = hermesFixture();
  f.evidence = [];
  let calls = 0;
  const { data } = await run(f, { onCall: () => calls++ });
  assert.equal(calls, 0);
  assert.equal(data.coverage, 0);
  assert.equal(data.quality.score, 0);
  assert.equal(data.inspection.complete, false);
  assert.equal(data.decision, "NEEDS_MORE_RESEARCH");
  assert.ok(data.sections.every((s) => s.missingInformation.length === 1));
  assert.ok(data.claimReviews.every((c) => c.classification === "UNSUPPORTED"));
  assert.ok(
    data.limitations.includes(
      "No valid external evidence records are available.",
    ),
  );
});
test("missing evidence citations and corrupt passages are rejected before semantic verification", async () => {
  const f = hermesFixture();
  f.evidence[0].passage = "Edited text not matching its stored hash";
  const { data } = await run(f);
  assert.ok(data.inspection.invalidEvidenceIds.includes("e0"));
  assert.equal(data.claimReviews[0].classification, "UNSUPPORTED");
  assert.equal(data.claimReviews[0].reviewStatus, "invalid_citations");
  assert.notEqual(data.decision, "COMPLETE");
});
test("fabricated supporting quotes invalidate an audit rather than inflating support", async () => {
  const f = hermesFixture();
  const { data } = await run(f, {
    audit: (input) => {
      const audit = sectionAudit(input);
      audit.claims[0].support[0].quote =
        "A fabricated passage that does not appear in the evidence";
      return audit;
    },
  });
  assert.equal(data.inspection.complete, false);
  assert.ok(data.claimReviews.every((c) => c.reviewStatus === "not_reviewed"));
  assert.equal(data.quality.components.evidenceSupport.score, 0);
});
test("unsupported and partially supported claims remain explicit and trigger verification requests", async () => {
  const f = hermesFixture();
  const { data } = await run(f, {
    audit: (input) =>
      sectionAudit(input, {
        classification:
          input.section.id === "s0" ? "UNSUPPORTED" : "PARTIALLY_SUPPORTED",
      }),
  });
  assert.equal(data.claimReviews[0].classification, "UNSUPPORTED");
  assert.equal(data.claimReviews[1].classification, "PARTIALLY_SUPPORTED");
  assert.ok(data.followUpRequests.some((r) => r.kind === "claim_verification"));
  assert.equal(data.decision, "NEEDS_MORE_RESEARCH");
  assert.ok(reportReviewContext(data).excludedClaims.length === 1);
});
test("genuine contradictions preserve both quotes, source IDs, publication dates and follow-up requests", async () => {
  const f = hermesFixture();
  const { data } = await run(f, {
    comparison: (input) => ({
      ...comparisonAudit(),
      contradictions: [conflict(input)],
    }),
  });
  const item = data.contradictions[0];
  assert.equal(item.resolved, false);
  assert.equal(item.left.sourceId, "source0");
  assert.equal(item.right.sourceId, "source1");
  assert.equal(
    new Date(item.left.publishedAt).toISOString(),
    new Date(f.sources[0].publishedAt).toISOString(),
  );
  assert.ok(item.geographicalDifferences && item.methodologicalDifferences);
  assert.equal(data.decision, "NEEDS_MORE_RESEARCH");
  assert.equal(data.quality.components.contradictionResolution.score, 0);
  const request = data.followUpRequests.find((r) => r.kind === "contradiction");
  assert.ok(
    request.missingQuestion &&
      request.sectionId &&
      request.query &&
      request.reason &&
      request.expectedEvidence.length,
  );
  const disclosure = reviewDisclosures(data, f.sources).join(" ");
  assert.ok(
    disclosure.includes(item.left.claim) &&
      disclosure.includes(item.right.claim),
  );
  assert.match(disclosure, /\[1\].*\[2\]/);
});
test("contextual contradictions are explained and retained, not silently discarded", async () => {
  const f = hermesFixture();
  const { data } = await run(f, {
    comparison: (input) => ({
      ...comparisonAudit(),
      contradictions: [conflict(input, "CONTEXTUAL")],
    }),
  });
  assert.equal(data.contradictions.length, 1);
  assert.equal(data.contradictions[0].resolved, true);
  assert.equal(data.quality.components.contradictionResolution.score, 100);
  assert.ok(
    reviewDisclosures(data, f.sources).some((text) =>
      text.includes("contextual"),
    ),
  );
});
test("source diversity, official-source gaps, unknown dates, old sources and review flags are actionable", async () => {
  const f = hermesFixture();
  for (const source of f.sources) {
    source.domain = "single-publisher.example";
    source.category = "News";
    source.assessment.dimensions.primarySource.classification = "undetermined";
    source.publishedAt = new Date("2010-01-01");
  }
  f.sources[0].publishedAt = null;
  const { data } = await run(f, {
    audit: (input) =>
      sectionAudit(input, {
        sourceFlags: ["WEAKLY_SUPPORTED", "POTENTIALLY_UNRELIABLE"],
        timeSensitive: true,
      }),
  });
  assert.ok(
    data.followUpRequests.some((r) => r.kind === "weak_source_diversity"),
  );
  assert.ok(
    data.followUpRequests.some((r) => r.kind === "missing_primary_sources"),
  );
  assert.ok(
    data.followUpRequests.some(
      (r) => r.kind === "outdated_or_undated_information",
    ),
  );
  assert.equal(data.sourceReviews[0].freshness, "UNKNOWN");
  assert.ok(
    data.sourceReviews.slice(1).every((s) => s.flags.includes("OUTDATED")),
  );
  assert.notEqual(data.decision, "COMPLETE");
  assert.equal(data.quality.components.sourceFreshness.score, 0);
});
test("missing blueprint dimensions become section-scoped research requests with expected evidence", async () => {
  const f = hermesFixture();
  const { data } = await run(f, {
    comparison: () => ({
      ...comparisonAudit(),
      missingDimensions: [
        {
          sectionId: "s0",
          dimension: "Smallholder accessibility",
          reason:
            "The objective includes adoption but no accessibility evidence was collected.",
          query: "smallholder crop monitoring accessibility official survey",
          expectedEvidence: ["Farmer adoption survey"],
        },
      ],
    }),
  });
  assert.ok(data.missingDimensions.length === 1);
  assert.ok(
    data.followUpRequests.some(
      (r) => r.kind === "missing_dimension" && r.sectionId === "s0",
    ),
  );
  assert.equal(data.decision, "NEEDS_MORE_RESEARCH");
});
test("round and search limits enforce INCOMPLETE_LIMIT_REACHED without another research request loop", async () => {
  for (const reason of ["maximum_rounds", "search_limit"]) {
    const f = hermesFixture();
    if (reason === "maximum_rounds") f.state.round = f.state.limits.maxRounds;
    else f.state.usage.searchRequests = f.state.limits.maxSearchRequests;
    const { data } = await run(f, {
      audit: (input) => sectionAudit(input, { questionStatus: "UNANSWERED" }),
    });
    assert.equal(data.decision, "INCOMPLETE_LIMIT_REACHED");
    assert.equal(data.limitReason, reason);
    assert.equal(data.readyForReport, false);
  }
});
test("reaching the final round does not mislabel fully sufficient evidence as incomplete", async () => {
  const f = hermesFixture();
  f.state.round = f.state.limits.maxRounds;
  const { data } = await run(f);
  assert.equal(data.decision, "COMPLETE");
  assert.equal(data.readyForReport, true);
});
test("unchanged evidence audits are reused; changed evidence invalidates the cache", async () => {
  const f = hermesFixture();
  let calls = 0;
  const options = { onCall: () => calls++ };
  const first = await run(f, options);
  f.state.reviews = [{ round: 1, ...first.data }];
  f.state.round = 2;
  const initial = calls;
  const second = await run(f, options);
  assert.equal(calls, initial);
  assert.ok(second.data.sectionAudits.every((a) => a.reused));
  f.evidence[0].passage += " Additional verified retrieval context.";
  const { createHash } = await import("node:crypto");
  f.evidence[0].passageHash = createHash("sha256")
    .update(f.evidence[0].passage)
    .digest("hex");
  await run(f, options);
  assert.ok(calls > initial);
});
test("token-budget exhaustion produces an explicitly incomplete audit, while cancellation propagates", async () => {
  const f = hermesFixture();
  let calls = 0;
  const providers = {
    generateJSON: async () => {
      calls++;
      throw new ExecutionStopped("token_budget", "Token limit");
    },
  };
  const { data } = await performReview({ ...f, providers });
  assert.equal(calls, 1);
  assert.equal(data.decision, "INCOMPLETE_LIMIT_REACHED");
  assert.equal(data.limitReason, "token_budget");
  assert.equal(data.inspection.complete, false);
  assert.equal(data.quality.components.evidenceSupport.score, 0);
  await assert.rejects(
    performReview({
      ...f,
      providers: {
        generateJSON: async () => {
          throw new ExecutionStopped("cancelled", "Cancelled");
        },
      },
    }),
    { code: "cancelled" },
  );
});
test("every claim is checked exactly once across bounded audit batches", async () => {
  const f = hermesFixture();
  f.state.findings[0].claims = Array.from({ length: 30 }, (_, i) => ({
    ...f.state.findings[0].claims[0],
    statement: `Distinct extracted claim ${i}`,
  }));
  const { data } = await run(f);
  assert.equal(data.claimReviews.length, 33);
  assert.equal(new Set(data.claimReviews.map((c) => c.claimId)).size, 33);
  assert.ok(
    data.sectionAudits.every(
      (a) => a.claimIds.length <= 12 && a.evidenceIds.length <= 24,
    ),
  );
  assert.ok(data.claimReviews.every((c) => c.reviewStatus === "reviewed"));
});
test("no-new-query exhaustion cannot be reported as COMPLETE when evidence remains deficient", async () => {
  const f = hermesFixture();
  const { data } = await run(f, {
    audit: (input) => sectionAudit(input, { questionStatus: "UNANSWERED" }),
  });
  const decision = completionDecision(data, f.state, {
    stopReason: "no_new_queries",
  });
  assert.equal(decision.decision, "INCOMPLETE_LIMIT_REACHED");
  assert.equal(decision.limitReason, "no_new_queries");
});

test("academic primary evidence does not silently satisfy an explicit official-source requirement", async () => {
  const f = hermesFixture();
  for (const source of f.sources) {
    source.category = "Academic research";
    source.assessment.dimensions.primarySource.classification =
      "potential_primary";
  }
  const { data } = await run(f);
  assert.ok(data.sections.every((section) => section.missingOfficialSources));
  assert.ok(
    data.followUpRequests.some(
      (request) => request.kind === "missing_official_sources",
    ),
  );
  assert.notEqual(data.decision, "COMPLETE");
});
test("a model cannot label opposing passages as fully supported without disclosing the conflict", async () => {
  const f = hermesFixture();
  const { data } = await run(f, {
    audit: (input) => {
      const audit = sectionAudit(input);
      audit.claims[0].opposition = [
        {
          evidenceId: input.evidence[1].evidenceId,
          quote: input.evidence[1].passage.slice(0, 100),
        },
      ];
      return audit;
    },
  });
  assert.equal(data.inspection.complete, false);
  assert.equal(data.quality.components.evidenceSupport.score, 0);
});
test("the review API returns the persisted review and an explicit empty state for older sessions", async (t) => {
  const { ResearchSession } = await import("../models/index.js");
  const { review } = await import("../controllers/sessions.js");
  const value = { decision: "INCOMPLETE_LIMIT_REACHED", quality: { score: 0 } };
  const lookup = t.mock.method(ResearchSession, "findById", () => ({
    select: async () => ({ reviews: [value] }),
  }));
  let body;
  await review(
    { params: { id: "id" } },
    {
      json(data) {
        body = data;
      },
    },
  );
  assert.deepEqual(body.review, value);
  lookup.mock.mockImplementation(() => ({
    select: async () => ({ reviews: [] }),
  }));
  await review(
    { params: { id: "id" } },
    {
      json(data) {
        body = data;
      },
    },
  );
  assert.equal(body.review, null);
  lookup.mock.mockImplementation(() => ({ select: async () => null }));
  await assert.rejects(review({ params: { id: "id" } }, { json() {} }), {
    status: 404,
  });
});

test("weak source support alone requires independent corroboration rather than an unexplained COMPLETE verdict", async () => {
  const f = hermesFixture();
  const { data } = await run(f, {
    audit: (input) =>
      sectionAudit(input, { sourceFlags: ["WEAKLY_SUPPORTED"] }),
  });
  assert.equal(data.decision, "NEEDS_MORE_RESEARCH");
  assert.ok(
    data.followUpRequests.some(
      (request) => request.kind === "weak_source_quality",
    ),
  );
  assert.equal(data.quality.components.sourceQuality.score, 48);
});

test("provider audit failures preserve collected-source counts while exposing zero inspected support", async () => {
  const f = hermesFixture();
  const { data } = await performReview({
    ...f,
    providers: {
      generateJSON: async () => {
        throw new Error("Provider rate limited");
      },
    },
  });
  assert.ok(
    data.sections.every((section) => section.sourceCoverage.totalSources === 2),
  );
  assert.ok(
    data.sections.every(
      (section) =>
        section.sourceCoverage.inspectedSources === 0 &&
        section.sourceCoverage.usableSources === 0,
    ),
  );
  assert.equal(data.inspection.inspectedEvidenceRecords, 0);
  assert.equal(data.quality.score, 0);
  assert.notEqual(data.decision, "COMPLETE");
});

test("Hermes preserves safe provider failure reasons instead of hiding them as unsupported evidence", async () => {
  const { ProviderError } = await import("../services/provider-errors.js");
  const result = await performReview({
    ...hermesFixture(),
    providers: {
      generateJSON: async () => {
        throw new ProviderError(
          "groq",
          "provider_rate_limit",
          "groq returned HTTP 429. Retry after the provider cooldown.",
          { httpStatus: 429, retryAt: 1000 },
        );
      },
    },
  });
  assert.equal(result.data.inspection.reviewedClaims, 0);
  assert.ok(
    result.data.inspection.errors.every(
      (error) =>
        error.code === "provider_rate_limit" && error.httpStatus === 429,
    ),
  );
  assert.ok(
    result.data.limitations.some((message) => message.includes("HTTP 429")),
  );
  assert.ok(
    result.data.claimReviews.every(
      (claim) => claim.reviewStatus === "not_reviewed",
    ),
  );
});

test("oversized Hermes audits split into smaller citation-complete batches", async () => {
  const { ProviderError } = await import("../services/provider-errors.js");
  const f = hermesFixture();
  let rejected = 0;
  const provider = hermesProvider();
  const result = await performReview({
    ...f,
    providers: {
      generateJSON: async (options) => {
        if (
          options.system.includes("HERMES_SECTION_AUDIT") &&
          options.input.evidence.length > 1
        ) {
          rejected++;
          throw new ProviderError(
            "groq",
            "provider_request_too_large",
            "Request too large.",
            { httpStatus: 413 },
          );
        }
        return provider.generateJSON(options);
      },
    },
  });
  assert.ok(rejected > 0);
  assert.equal(result.data.inspection.reviewedClaims, 4);
  assert.equal(result.data.inspection.inspectedEvidenceRecords, 8);
  assert.equal(result.data.inspection.errors.length, 0);
});

test("provider outage ends an audit after bounded provider recovery without triggering follow-up research", async () => {
  const { ProviderError } = await import("../services/provider-errors.js");
  let calls = 0;
  const { data } = await performReview({
    ...hermesFixture(),
    providers: {
      generateJSON: async () => {
        calls++;
        throw new ProviderError("gemini", "provider_rate_limit", "HTTP 429.", {
          httpStatus: 429,
        });
      },
    },
  });
  assert.equal(calls, 1);
  assert.equal(data.decision, "INCOMPLETE_LIMIT_REACHED");
  assert.equal(data.limitReason, "provider_rate_limit");
  assert.equal(data.inspection.inspectedEvidenceRecords, 0);
});
