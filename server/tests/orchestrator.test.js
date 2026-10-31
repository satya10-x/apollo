import { sectionAudit, comparisonAudit } from "./helpers/hermesProvider.js";
import { writerResponse, assemblerResponse } from "./helpers/reportProvider.js";
import { retrievalRepository } from "./helpers/retrievalRepository.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createOrchestrator } from "../services/apollo/orchestrator.js";
import { resolveLimits } from "../services/apollo/policies.js";
import {
  blueprintSchema,
  validateSectionReferences,
} from "../services/apollo/schemas.js";
import { ExecutionStopped } from "../services/apollo/errors.js";

function blueprint(mode = "standard") {
  return {
    objective: "Assess agricultural research evidence",
    scope: "India, recent evidence, stated limitations",
    domain: "Agriculture",
    complexity: "moderate",
    dimensions: ["Adoption", "Economics"],
    informationNeeds: ["Primary evidence"],
    sections: Array.from({ length: 4 }, (_, i) => ({
      id: `section${i}`,
      title: `Dimension ${i}`,
      priority: "high",
      dependsOn: i === 0 ? ["section1"] : i === 3 ? ["section0"] : [],
      subQuestions: [
        {
          id: `question${i}`,
          question: `Question ${i}?`,
          queries: [`initial query ${i}`],
          expectedEvidence: ["Official statistics"],
        },
      ],
    })),
  };
}
function harness({
  mode = "standard",
  rounds = 3,
  limits = {},
  review,
  search,
  generate,
  externalSignal,
  approval,
} = {}) {
  const saved = [],
    calls = [],
    sourceMap = new Map();
  let report = null,
    claimed = false,
    time = 1000;
  const session = {
    _id: "test-session",
    topic: "Impact of AI on Indian agriculture",
    mode,
    maxRounds: rounds,
    requirePlanApproval: !!approval,
    limits: { ...resolveLimits(mode, rounds), ...limits },
  };
  const repository = {
    ...retrievalRepository(),
    async waitForPlanApproval(state, budget) {
      assert.equal(calls.filter((call) => call.type === "search").length, 0);
      await approval(state, budget);
      budget.check();
      return new Date(time);
    },
    async claim() {
      if (claimed) return null;
      claimed = true;
      return structuredClone(session);
    },
    async save(state) {
      saved.push(structuredClone(state));
      return state;
    },
    async stop(state) {
      saved.push(structuredClone(state));
      return structuredClone(state);
    },
    async finish(state, value) {
      report = value;
      saved.push(structuredClone(state));
      return state;
    },
  };
  const providers = {
    async search(query, { budget }) {
      budget.reserveSearch(undefined);
      calls.push({ type: "search", query });
      if (search) return search(query, budget);
      return Array.from({ length: 2 }, (_, i) => ({
        title: "Primary evidence",
        url: `https://department-${i}.gov.in/${encodeURIComponent(query)}/${i}`,
        published_date: new Date(time).toISOString(),
        content: "Substantive agricultural evidence excerpt",
        score: 0.8,
      }));
    },
    async generateJSON(options) {
      options.budget.check();
      calls.push({
        type: "llm",
        system: options.system,
        input: structuredClone(options.input),
      });
      if (generate)
        await generate(options, () => {
          time += session.limits.timeoutMs + 1;
        });
      let data;
      if (options.system.startsWith("APOLLO_SECTION_WRITER"))
        data = writerResponse(options.input);
      else if (options.system.startsWith("APOLLO_REPORT_ASSEMBLER"))
        data = assemblerResponse(options.input);
      else if (options.system.startsWith("You are Apollo"))
        data = blueprint(mode);
      else if (options.system.startsWith("You are Athena"))
        data = {
          summary: "Task evidence assessed.",
          claims: [
            {
              statement: "Evidence-backed finding",
              sourceIds: [options.input.evidence[0].sourceId],
              evidenceIds: [options.input.evidence[0].evidenceId],
            },
          ],
          limitations: [],
        };
      else if (options.system.includes("HERMES_SECTION_AUDIT")) {
        const requested = review?.(options.input);
        const gaps =
          requested?.gaps.filter(
            (g) => g.sectionId === options.input.section.id,
          ) || [];
        data = sectionAudit(options.input, {
          questionStatus: gaps.length ? "UNANSWERED" : "ANSWERED",
          followUps: gaps.map((g) => ({
            questionId: options.input.section.subQuestions[0].id,
            missingQuestion: g.description,
            query: g.queries[0],
            expectedEvidence: ["Official statistics"],
            priority: g.priority,
            reason: g.description,
          })),
        });
      } else if (options.system.includes("HERMES_COMPARISON_AUDIT"))
        data = comparisonAudit();
      else
        data = {
          summary: "Summary supported by evidence [1].",
          sections: options.input.blueprint.sections.map((section) => ({
            sectionId: section.id,
            title: section.title,
            body: "Evidence-backed section [1].",
          })),
          limitations: [],
        };
      data = options.schema.parse(data);
      options.validate?.(data);
      return { data, provider: "test", model: "test-model" };
    },
  };
  const run = createOrchestrator({ repository, providers, now: () => time });
  return {
    run: () => run("test-session", { signal: externalSignal }),
    saved,
    calls,
    get report() {
      return report;
    },
    session,
  };
}
test("Apollo runs the actual section pipeline in dependency order and persists the report", async () => {
  const h = harness();
  const result = await h.run();
  assert.equal(result.status, "completed");
  assert.equal(result.stopReason, "sufficient_evidence");
  assert.deepEqual(result.completedTasks, [
    "initial-question0",
    "initial-question1",
    "initial-question2",
    "initial-question3",
  ]);
  assert.deepEqual(result.pendingTasks, []);
  const dispatched = h.calls
    .filter((c) => c.type === "llm" && c.system.startsWith("You are Athena"))
    .map((c) => c.input.task.sectionId);
  assert.ok(dispatched.indexOf("section1") < dispatched.indexOf("section0"));
  assert.ok(dispatched.indexOf("section0") < dispatched.indexOf("section3"));
  assert.equal(result.sourceIds.length, 8);
  assert.equal(result.usage.searchRequests, 4);
  assert.equal(h.report.sections.length, 4);
  assert.ok(h.saved.some((s) => s.tasks.some((t) => t.status === "running")));
  assert.ok(result.decisions.some((d) => d.reason === "hermes_review"));
});
test("Hermes feedback creates actual follow-up tasks and a second review", async () => {
  const h = harness({
    review: (input) => ({
      coverage: input.round === 1 ? 45 : 96,
      readyForReport: input.round > 1,
      rationale: "Coverage review",
      sections: input.blueprint.sections.map((s) => ({
        sectionId: s.id,
        coverage: input.round === 1 ? 45 : 96,
        assessment: "Needs review",
      })),
      gaps:
        input.round === 1
          ? [
              {
                sectionId: "section0",
                description: "Adoption data is missing",
                priority: "high",
                queries: ["follow-up adoption statistics"],
              },
            ]
          : [],
    }),
  });
  const result = await h.run();
  assert.equal(result.status, "completed");
  assert.equal(result.round, 2);
  assert.equal(result.reviews.length, 2);
  assert.ok(result.tasks.length >= 5);
  assert.ok(
    h.calls.some(
      (c) => c.type === "search" && c.query === "follow-up adoption statistics",
    ),
  );
});
test("Quick respects one round even when Hermes requests further work", async () => {
  const h = harness({
    mode: "quick",
    rounds: 5,
    review: (input) => ({
      coverage: 20,
      readyForReport: false,
      rationale: "More evidence required",
      sections: input.blueprint.sections.map((s) => ({
        sectionId: s.id,
        coverage: 20,
        assessment: "Incomplete",
      })),
      gaps: [
        {
          sectionId: "section0",
          description: "Missing cost evidence",
          priority: "high",
          queries: ["new cost evidence"],
        },
      ],
    }),
  });
  const result = await h.run();
  assert.equal(result.round, 1);
  assert.equal(result.stopReason, "maximum_rounds");
  assert.equal(result.tasks.length, 4);
  assert.ok(h.report.limitations.includes("Missing cost evidence"));
});
test("search caps stop new searches while preserving evidence and uncompleted task reasons", async () => {
  const h = harness({ limits: { maxSearchRequests: 1 } });
  const result = await h.run();
  assert.equal(result.usage.searchRequests, 1);
  assert.equal(result.stopReason, "search_limit");
  assert.equal(result.status, "completed");
  assert.equal(result.tasks.filter((t) => t.status === "skipped").length, 3);
});
test("repeated follow-up queries cannot create an infinite loop", async () => {
  const h = harness({
    review: (input) => ({
      coverage: 10,
      readyForReport: false,
      rationale: "Still incomplete",
      sections: input.blueprint.sections.map((s) => ({
        sectionId: s.id,
        coverage: 10,
        assessment: "Incomplete",
      })),
      gaps: [
        {
          sectionId: "section0",
          description: "Missing evidence",
          priority: "high",
          queries: ["initial query 0"],
        },
      ],
    }),
  });
  const result = await h.run();
  assert.ok(result.round <= result.limits.maxRounds);
  assert.notEqual(result.stopReason, "sufficient_evidence");
  assert.equal(result.reviews.at(-1).decision, "INCOMPLETE_LIMIT_REACHED");
});
test("cancellation during a provider operation prevents report generation", async () => {
  const controller = new AbortController();
  const h = harness({
    externalSignal: controller.signal,
    search: (query, budget) => {
      controller.abort(new ExecutionStopped("cancelled", "Cancelled in test"));
      budget.check();
    },
  });
  const result = await h.run();
  assert.equal(result.status, "cancelled");
  assert.equal(h.report, null);
  assert.equal(result.pendingTasks.length, 0);
  assert.ok(result.tasks.every((t) => t.status === "cancelled"));
});
test("the overall deadline is checked after provider operations", async () => {
  const h = harness({
    generate: async (options, expire) => {
      expire();
    },
  });
  const result = await h.run();
  assert.equal(result.status, "failed");
  assert.equal(result.stopReason, "timeout");
  assert.equal(h.report, null);
  assert.equal(result.usage.searchRequests, 0);
});
test("a failed evidence search is persisted as a failed session, not fabricated findings", async () => {
  const h = harness({
    search: () => {
      throw new Error("Search unavailable");
    },
  });
  const result = await h.run();
  assert.equal(result.status, "failed");
  assert.equal(result.stopReason, "no_evidence");
  assert.ok(
    result.researchMemory.queries.every((query) => query.status === "failed"),
  );
  assert.deepEqual(result.findings, []);
  assert.equal(h.report, null);
});
test("the same queued session cannot be claimed twice", async () => {
  const h = harness();
  await h.run();
  assert.equal(await h.run(), null);
});
test("blueprints reject cyclic, unknown or duplicate dependencies and question IDs", () => {
  const cycle = blueprint();
  cycle.sections[1].dependsOn = ["section0"];
  assert.equal(blueprintSchema.safeParse(cycle).success, false);
  const unknown = blueprint();
  unknown.sections[1].dependsOn = ["missing"];
  assert.equal(blueprintSchema.safeParse(unknown).success, false);
  const duplicate = blueprint();
  duplicate.sections[1].subQuestions[0].id = "question0";
  assert.equal(blueprintSchema.safeParse(duplicate).success, false);
  const short = blueprint();
  short.sections.pop();
  assert.equal(blueprintSchema.safeParse(short).success, false);
});
test("review and report section references cannot omit or invent plan sections", () => {
  assert.throws(
    () =>
      validateSectionReferences(
        { sections: [{ sectionId: "missing" }] },
        blueprint(),
      ),
    /every planned section/,
  );
  const duplicate = {
    sections: Array.from({ length: 4 }, () => ({ sectionId: "section0" })),
  };
  assert.throws(
    () => validateSectionReferences(duplicate, blueprint()),
    /every planned section/,
  );
});

test("mode limits are distinct and request overrides cannot raise ceilings", () => {
  const quick = resolveLimits("quick", 5),
    standard = resolveLimits("standard", 5),
    deep = resolveLimits("deep", 5);
  assert.equal(quick.maxRounds, 1);
  assert.equal(standard.maxRounds, 3);
  assert.equal(deep.maxRounds, 5);
  assert.ok(
    quick.maxSources < standard.maxSources &&
      standard.maxSources < deep.maxSources,
  );
  assert.equal(deep.searchDepth, "advanced");
  const clamped = resolveLimits("quick", 5, {
    maxSearchRequests: 200,
    maxTokens: 2000000,
    timeoutMs: 3600000,
  });
  assert.equal(clamped.maxSearchRequests, quick.maxSearchRequests);
  assert.equal(clamped.maxTokens, quick.maxTokens);
  assert.equal(clamped.timeoutMs, quick.timeoutMs);
  assert.equal(
    resolveLimits("quick", 1, { maxTokens: undefined }).maxTokens,
    quick.maxTokens,
  );
});
test("Apollo does not accept premature report readiness when section evidence is thin", async () => {
  const h = harness({
    search: (query) => [
      {
        title: "One source",
        url: `https://example.org/${encodeURIComponent(query)}`,
        content:
          "One substantive retrieved passage about crop yield changes in the reporting period.",
        score: 0.8,
      },
    ],
  });
  const result = await h.run();
  assert.notEqual(result.stopReason, "sufficient_evidence");
  assert.equal(result.reviews.at(-1).decision, "INCOMPLETE_LIMIT_REACHED");
});

test("initial tasks share limited sources without starving all later sections or follow-ups", async () => {
  const h = harness({
    limits: { maxSources: 8 },
    review: (input) => ({
      coverage: input.round === 1 ? 40 : 96,
      readyForReport: input.round > 1,
      rationale: "Follow up on missing evidence",
      sections: input.blueprint.sections.map((s) => ({
        sectionId: s.id,
        coverage: input.round === 1 ? 40 : 96,
        assessment: "Evidence review",
      })),
      gaps:
        input.round === 1
          ? [
              {
                sectionId: "section0",
                description: "Additional adoption evidence",
                priority: "high",
                queries: ["additional adoption evidence"],
              },
            ]
          : [],
    }),
  });
  const result = await h.run();
  assert.equal(result.status, "completed");
  assert.equal(result.round, 2);
  assert.ok(
    result.tasks
      .filter((task) => task.round === 1)
      .every((task) => task.sourceIds.length > 0),
  );
  assert.ok(result.tasks.find((task) => task.round === 2).sourceIds.length > 0);
  assert.ok(result.sourceIds.length <= 8);
});

test("Athena synthesis failure preserves real evidence for Hermes without fabricating verified findings", async () => {
  const h = harness({
    rounds: 1,
    generate: async (options) => {
      if (options.system.startsWith("You are Athena"))
        throw new Error("Structured synthesis rejected");
    },
  });
  const result = await h.run(),
    review = result.reviews.at(-1);
  assert.ok(result.evidenceIds.length > 0);
  assert.deepEqual(result.findings, []);
  assert.ok(
    result.tasks.every((task) => task.reason === "finding_synthesis_failed"),
  );
  assert.ok(review.inspection.inspectedEvidenceRecords > 0);
  assert.equal(review.quality.components.evidenceSupport.score, 0);
  assert.equal(review.decision, "INCOMPLETE_LIMIT_REACHED");
  assert.ok(
    review.followUpRequests.some(
      (request) => request.kind === "missing_verified_findings",
    ),
  );
});

test("optional plan approval gates every external search and preserves real agent review events", async () => {
  let reviewed = false;
  const h = harness({
    approval: async (state) => {
      reviewed = true;
      assert.ok(state.blueprint);
      assert.equal(state.stage, "awaiting_approval");
    },
  });
  const state = await h.run();
  assert.ok(reviewed);
  assert.equal(state.status, "completed");
  assert.ok(h.saved.some((s) => s.stage === "awaiting_approval"));
  assert.ok(
    state.events.some(
      (e) => e.agent === "Hermes" && e.message.includes("Verifying claims"),
    ),
  );
});
test("cancellation at plan approval never dispatches Athena", async () => {
  const controller = new AbortController();
  const h = harness({
    externalSignal: controller.signal,
    approval: async () =>
      controller.abort(
        new ExecutionStopped("cancelled", "Cancelled at approval"),
      ),
  });
  const state = await h.run();
  assert.equal(state.status, "cancelled");
  assert.equal(h.calls.filter((call) => call.type === "search").length, 0);
  assert.equal(h.report, null);
});
