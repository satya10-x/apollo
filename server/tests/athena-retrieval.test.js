import test from "node:test";
import assert from "node:assert/strict";
import { createAthenaRetriever } from "../services/athena/retrieval.js";
import { researchTask } from "../services/agents/athena.js";
import { ExecutionBudget, emptyUsage } from "../services/apollo/budget.js";
import { retrievalRepository } from "./helpers/retrievalRepository.js";
const raw = (
  query,
  url = `https://example.org/${encodeURIComponent(query)}`,
) => ({
  url,
  title: "Evidence report",
  content: `Retrieved factual passage for ${query}: the measured agricultural change was 12 percent.`,
  retrieval: { provider: "tavily", contentKind: "page_text" },
});
function setup(search, { arxiv = false, maxSources = 20 } = {}) {
  const repository = retrievalRepository(),
    sources = [],
    evidence = [];
  const state = {
    _id: "session",
    mode: "standard",
    limits: {
      maxSearchRequests: 20,
      maxSources,
      resultsPerSearch: 4,
      searchDepth: "basic",
    },
    usage: emptyUsage(),
    deadlineAt: new Date(Date.now() + 10000),
    researchMemory: { queries: [], investigatedQuestions: [] },
  };
  const budget = new ExecutionBudget(state);
  const providers = {
    search: async (query, options) => {
      options.budget.reserveSearch(undefined);
      return search(query, options);
    },
  };
  const collect = createAthenaRetriever({
    repository,
    providers,
    config: { ATHENA_SEARCH_CONCURRENCY: 2, ATHENA_ARXIV_ENABLED: arxiv },
  });
  const run = async (
    task,
    section = { id: "section1", title: "Research section" },
  ) => {
    await collect({
      state,
      task,
      section,
      sources,
      evidence,
      budget,
      sourceAllowance: 10,
      checkpoint: async () => {
        budget.check();
      },
    });
    return task;
  };
  return { run, repository, state, sources, evidence, budget };
}
const task = (queries, id = "task1") => ({
  id,
  sectionId: "section1",
  question: "What changed in agricultural output?",
  queries,
  expectedEvidence: ["Official statistics"],
});
test("multiple queries execute in bounded parallel batches", async () => {
  let active = 0,
    peak = 0,
    release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const h = setup(async (query) => {
    active++;
    peak = Math.max(peak, active);
    if (active === 2) release();
    await gate;
    active--;
    return [raw(query)];
  });
  const result = await h.run(
    task(["first query", "second query", "third query"]),
  );
  assert.equal(peak, 2);
  assert.equal(h.state.usage.searchRequests, 3);
  assert.equal(result.sourceIds.length, 3);
  assert.equal(result.evidenceIds.length, 3);
});
test("normalized session query memory reuses sources and evidence across sections", async () => {
  let searches = 0;
  const h = setup(async (query) => {
    searches++;
    return [raw(query)];
  });
  await h.run(task(["crop yield statistics"]));
  const second = await h.run(task(["  Crop   Yield Statistics  "], "task2"), {
    id: "section2",
    title: "Economics",
  });
  assert.equal(searches, 1);
  assert.equal(second.cachedQueries.length, 1);
  assert.equal(h.state.researchMemory.queries.length, 1);
  assert.equal(h.repository.sources[0].sections.length, 2);
  assert.ok(h.repository.evidence[0].sectionIds.includes("section2"));
  assert.equal(h.state.researchMemory.investigatedQuestions.length, 2);
});
test("repeated URLs and syndicated content merge without losing provider provenance", async () => {
  const content =
    "An agricultural report provides measured evidence about crop production and farmer adoption. ".repeat(
      20,
    );
  const h = setup(async (query) => [
    { ...raw(query), content, url: `https://publisher-${query}.org/article` },
  ]);
  const result = await h.run(task(["one", "two"]));
  assert.equal(result.sourceIds.length, 1);
  assert.equal(h.repository.sources.length, 1);
  assert.equal(h.repository.sources[0].originalUrls.length, 2);
  assert.equal(h.repository.sources[0].provenance.length, 2);
  assert.ok(h.repository.evidence[0].provenance.length >= 2);
  assert.equal(h.repository.sources[0].content, undefined);
});
test("one failed query does not discard evidence from successful queries", async () => {
  const h = setup(async (query) => {
    if (query === "broken") throw new Error("API failed");
    return [raw(query)];
  });
  const result = await h.run(task(["broken", "working"]));
  assert.equal(result.sourceIds.length, 1);
  assert.equal(result.retrievalWarnings.length, 1);
  assert.ok(
    h.state.researchMemory.queries.some((entry) => entry.status === "failed"),
  );
  assert.ok(
    h.state.researchMemory.queries.some(
      (entry) => entry.status === "completed",
    ),
  );
});
test("parallel query results cannot overrun the global source cap", async () => {
  const h = setup(
    async (query) => Array.from({ length: 4 }, (_, i) => raw(`${query} ${i}`)),
    { maxSources: 2 },
  );
  await h.run(task(["one", "two"]));
  assert.equal(h.repository.sources.length, 2);
  assert.equal(h.state.sourceIds.length, 2);
  assert.ok(
    h.repository.evidence.every((item) =>
      h.state.sourceIds.includes(item.source),
    ),
  );
});
test("academic evidence requirements add an arXiv-specific job within shared limits", async () => {
  const kinds = [];
  const h = setup(
    async (query, { kind }) => {
      kinds.push(kind);
      return [raw(query, `https://${kind}.example.org/report`)];
    },
    { arxiv: true },
  );
  const request = task(["crop monitoring"]);
  request.expectedEvidence = ["Academic research papers"];
  await h.run(request);
  assert.deepEqual(kinds, ["web", "academic"]);
  assert.equal(h.state.usage.searchRequests, 2);
});
test("evidence records preserve exact passages and never contain generated findings", async () => {
  const result = raw("crop yield");
  const h = setup(async () => [result]);
  await h.run(task(["crop yield"]));
  for (const item of h.repository.evidence) {
    assert.equal(item.origin, "external_api");
    assert.ok(result.content.includes(item.passage));
    assert.ok(
      item.provenance.every(
        (p) => p.documentHash && p.originalUrl === result.url,
      ),
    );
  }
  assert.equal(h.repository.sources[0].content, undefined);
});
test("Athena rejects source/evidence mismatches in model-generated claims", async () => {
  const source = {
    _id: "source1",
    title: "Report",
    url: "https://example.org",
  };
  const evidence = {
    _id: "evidence1",
    source: "source1",
    passage: "Verbatim retrieved passage",
    origin: "external_api",
  };
  const providers = {
    generateJSON: async (options) => {
      const value = options.schema.parse({
        summary: "A derived finding",
        claims: [
          {
            statement: "Generated interpretation",
            sourceIds: ["source1"],
            evidenceIds: ["invented-evidence"],
          },
        ],
        limitations: [],
      });
      options.validate(value);
      return { data: value };
    },
  };
  await assert.rejects(
    researchTask({
      task: task(["query"]),
      sources: [source],
      evidence: [evidence],
      providers,
      budget: {},
    }),
    /outside its assigned evidence/,
  );
});

test("large evidence sets use a bounded synthesis context without altering stored passages", async () => {
  const evidence = Array.from({ length: 100 }, (_, i) => ({
    _id: `e${i}`,
    source: `s${i}`,
    passage: "Retrieved evidence passage. ".repeat(40),
    origin: "external_api",
    taskIds: i === 99 ? ["task1"] : [],
  }));
  const sources = evidence.map((item) => ({
    _id: item.source,
    title: "Retrieved document",
    url: "https://example.org",
  }));
  let captured;
  const providers = {
    generateJSON: async (options) => {
      captured = options.input;
      return {
        data: options.schema.parse({
          summary: "Insufficient evidence for a claim.",
          claims: [],
          limitations: [],
        }),
      };
    },
  };
  await researchTask({
    task: task(["query"]),
    sources,
    evidence,
    providers,
    budget: {},
  });
  assert.equal(captured.evidence.length, 6);
  assert.equal(captured.evidence[0].evidenceId, "e99");
  assert.equal(captured.sourceMetadata.length, 6);
  assert.equal(evidence.length, 100);
  assert.ok(
    captured.evidence.every(
      (item) =>
        evidence.find((original) => original._id === item.evidenceId)
          .passage === item.passage,
    ),
  );
});
