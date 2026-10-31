import test from "node:test";
import assert from "node:assert/strict";
import { createSearchService } from "../services/athena/search.js";
import { ExecutionBudget, emptyUsage } from "../services/apollo/budget.js";
const config = {
  TAVILY_API_KEY: "test-tavily",
  EXA_API_KEY: "test-exa",
  EXA_FALLBACK_ENABLED: true,
  ATHENA_MAX_RETRIES: 0,
  ATHENA_SEARCH_TIMEOUT_MS: 1000,
  ATHENA_ARXIV_INTERVAL_MS: 3000,
};
const budget = (limits = {}) =>
  new ExecutionBudget({
    deadlineAt: new Date(Date.now() + 20000),
    limits: {
      maxSearchRequests: 8,
      resultsPerSearch: 3,
      searchDepth: "advanced",
      ...limits,
    },
    usage: emptyUsage(),
  });
const response = (body, status = 200) =>
  new Response(JSON.stringify(body), { status });
const text =
  "The retrieved report describes agricultural production and its measured change in 2025.";
test("Tavily requests real page text, ignores generated answers, and preserves provenance", async () => {
  let request;
  const api = createSearchService({
    config,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return response({
        answer: "Generated answer, not evidence",
        results: [
          {
            url: "https://gov.example/report",
            title: "Official report",
            content: "Search excerpt",
            raw_content: text,
            published_date: "2025-01-01",
            score: 0.9,
          },
        ],
        request_id: "request-1",
      });
    },
  });
  const result = await api.search("production", { budget: budget() });
  assert.equal(request.url, "https://api.tavily.com/search");
  const body = JSON.parse(request.options.body);
  assert.equal(body.include_answer, false);
  assert.equal(body.include_raw_content, "text");
  assert.equal(result[0].content, text);
  assert.equal(result[0].retrieval.contentKind, "page_text");
  assert.equal(result[0].retrieval.requestId, "request-1");
  assert.equal(result[0].retrieval.provider, "tavily");
});
test("empty Tavily results fall back to Exa text without accepting Exa summaries", async () => {
  const calls = [];
  const api = createSearchService({
    config,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return calls.length === 1
        ? response({ results: [] })
        : response({
            results: [
              {
                url: "https://example.org/paper",
                title: "Paper",
                text,
                publishedDate: "2025-02-01",
                summary: "Generated summary",
              },
            ],
          });
    },
  });
  const b = budget();
  const results = await api.search("research", { budget: b });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.headers["x-api-key"], "test-exa");
  assert.equal(
    JSON.parse(calls[1].options.body).contents.text.maxCharacters,
    12000,
  );
  assert.equal(results[0].content, text);
  assert.equal(results[0].published_date, "2025-02-01");
  assert.equal(results[0].retrieval.provider, "exa");
  assert.equal(b.state.usage.searchRequests, 2);
});
test("Exa summary-only and unsafe URL results are not treated as evidence", async () => {
  const api = createSearchService({
    config,
    fetchImpl: async (url) =>
      url.includes("tavily")
        ? response({ results: [] })
        : response({
            results: [
              { url: "https://example.org", summary: "AI only" },
              { url: "javascript:alert(1)", text },
            ],
          }),
  });
  assert.deepEqual(await api.search("query", { budget: budget() }), []);
});
test("retries and fallback remain bounded and every dispatched attempt is charged", async () => {
  let attempts = 0;
  const events = [];
  const api = createSearchService({
    config: { ...config, ATHENA_MAX_RETRIES: 1 },
    fetchImpl: async () => {
      attempts++;
      return response({}, 503);
    },
  });
  const b = budget();
  await assert.rejects(
    api.search("query", {
      budget: b,
      onAttempt: (event) => events.push(event),
    }),
    /HTTP 503/,
  );
  assert.equal(attempts, 4);
  assert.equal(b.state.usage.searchRequests, 4);
  assert.equal(events.length, 4);
});
test("application search cap prevents fallback from exceeding the budget", async () => {
  let attempts = 0;
  const api = createSearchService({
    config,
    fetchImpl: async () => {
      attempts++;
      return response({}, 503);
    },
  });
  await assert.rejects(
    api.search("query", { budget: budget({ maxSearchRequests: 1 }) }),
    { code: "search_limit" },
  );
  assert.equal(attempts, 1);
});
test("disabled Exa fallback does not make a second provider request", async () => {
  let attempts = 0;
  const api = createSearchService({
    config: { ...config, EXA_FALLBACK_ENABLED: false },
    fetchImpl: async () => {
      attempts++;
      return response({ results: [] });
    },
  });
  assert.deepEqual(await api.search("query", { budget: budget() }), []);
  assert.equal(attempts, 1);
});
test("malformed JSON falls back safely without inventing sources", async () => {
  let attempts = 0;
  const api = createSearchService({
    config,
    fetchImpl: async () =>
      ++attempts === 1
        ? new Response("not-json")
        : response({ results: [{ url: "https://example.org/result", text }] }),
  });
  assert.equal(
    (await api.search("query", { budget: budget() }))[0].retrieval.provider,
    "exa",
  );
});
test("arXiv Atom abstracts come from a public API and retain original IDs and dates", async () => {
  let request;
  const atom =
    '<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><id>http://arxiv.org/abs/1234.5678v1</id><title>A research paper</title><summary>Original author abstract about agriculture with measured changes &amp; supporting observations.</summary><published>2025-01-01T00:00:00Z</published></entry></feed>';
  const api = createSearchService({
    config,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(atom);
    },
  });
  const b = budget();
  const results = await api.search("agriculture yield", {
    kind: "academic",
    budget: b,
  });
  assert.match(request.url, /https:\/\/export.arxiv.org\/api\/query/);
  assert.equal(results[0].url, "http://arxiv.org/abs/1234.5678v1");
  assert.equal(results[0].published_date, "2025-01-01T00:00:00Z");
  assert.equal(results[0].retrieval.contentKind, "abstract");
  assert.match(results[0].content, /& supporting/);
  assert.equal(b.state.usage.estimatedCostUsd, 0);
});
test("cancellation reaches an active search and never invokes fallback", async () => {
  const controller = new AbortController();
  const base = budget();
  const b = new ExecutionBudget(base.state, { signal: controller.signal });
  let attempts = 0;
  const api = createSearchService({
    config,
    fetchImpl: async (url, options) => {
      attempts++;
      controller.abort();
      options.signal.throwIfAborted();
    },
  });
  await assert.rejects(api.search("query", { budget: b }), {
    code: "cancelled",
  });
  assert.equal(attempts, 1);
});

test("Quick mode retrieves genuine search excerpts without waiting for page extraction", async () => {
  let request;
  const service = createSearchService({
    config,
    fetchImpl: async (_url, options) => {
      request = JSON.parse(options.body);
      return response({
        results: [
          {
            title: "Retrieved source",
            url: "https://example.org/source",
            content: text,
          },
        ],
      });
    },
  });
  const b = budget();
  b.state.mode = "quick";
  const results = await service.search("research", { budget: b });
  assert.equal(request.include_raw_content, false);
  assert.equal(request.include_answer, false);
  assert.equal(results[0].content, text);
  assert.equal(results[0].retrieval.contentKind, "search_excerpt");
});
