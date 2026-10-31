import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { createProviderService } from "../services/providers.js";
import { ExecutionBudget, emptyUsage } from "../services/apollo/budget.js";
const config = {
  GROQ_API_KEY: "test-groq-key",
  GROQ_MODEL: "test-primary",
  GEMINI_API_KEY: "test-gemini-key",
  GEMINI_MODEL: "test-fallback",
  GEMINI_FALLBACK_ENABLED: true,
  TAVILY_API_KEY: "test-search-key",
};
const schema = z.object({ answer: z.string().min(1) });
function budget(limits = {}) {
  return new ExecutionBudget({
    deadlineAt: new Date(Date.now() + 10000),
    limits: {
      outputTokens: 1000,
      maxTokens: 100000,
      maxSearchRequests: 2,
      resultsPerSearch: 6,
      searchDepth: "advanced",
      ...limits,
    },
    usage: emptyUsage(),
  });
}
const response = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
test("Groq is primary, JSON is validated, and token usage is accounted", async () => {
  const calls = [];
  const providers = createProviderService({
    config,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return response({
        choices: [{ message: { content: '{"answer":"Supported answer"}' } }],
        usage: { prompt_tokens: 20, total_tokens: 30 },
      });
    },
  });
  const b = budget();
  const result = await providers.generateJSON({
    system: "Return JSON",
    input: { topic: "research" },
    schema,
    budget: b,
  });
  assert.equal(result.provider, "groq");
  assert.equal(calls.length, 1);
  assert.equal(
    JSON.parse(calls[0].options.body).response_format.type,
    "json_object",
  );
  assert.equal(b.state.usage.reportedTokens, 30);
});
test("Groq failure invokes the optional Gemini fallback exactly once", async () => {
  const calls = [];
  const providers = createProviderService({
    config,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return calls.length === 1
        ? response({}, 503)
        : response({
            candidates: [
              {
                content: { parts: [{ text: '{"answer":"Fallback answer"}' }] },
              },
            ],
            usageMetadata: { promptTokenCount: 30, totalTokenCount: 50 },
          });
    },
  });
  const b = budget();
  const result = await providers.generateJSON({
    system: "Return JSON",
    input: {},
    schema,
    budget: b,
  });
  assert.equal(result.provider, "gemini");
  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.headers["x-goog-api-key"], "test-gemini-key");
  assert.equal(
    JSON.parse(calls[1].options.body).generationConfig.responseMimeType,
    "application/json",
  );
  assert.equal(b.state.usage.llmRequests, 2);
  assert.equal(b.state.usage.unreportedRequests, 1);
});
test("schema-invalid primary output also triggers the bounded fallback", async () => {
  let attempts = 0;
  const providers = createProviderService({
    config,
    fetchImpl: async () => {
      attempts++;
      return attempts === 1
        ? response({ choices: [{ message: { content: '{"wrong":true}' } }] })
        : response({
            candidates: [
              { content: { parts: [{ text: '{"answer":"valid"}' }] } },
            ],
          });
    },
  });
  const result = await providers.generateJSON({
    system: "Return JSON",
    input: {},
    schema,
    budget: budget(),
  });
  assert.equal(result.provider, "gemini");
  assert.equal(attempts, 2);
});
test("disabled fallback never calls Gemini, and two invalid attempts terminate", async () => {
  for (const enabled of [false, true]) {
    let attempts = 0;
    const providers = createProviderService({
      config: { ...config, GEMINI_FALLBACK_ENABLED: enabled },
      fetchImpl: async () => {
        attempts++;
        return response({
          choices: [{ message: { content: "not json" } }],
          candidates: [],
        });
      },
    });
    await assert.rejects(
      providers.generateJSON({
        system: "Return JSON",
        input: {},
        schema,
        budget: budget(),
      }),
      /invalid structured output/,
    );
    assert.equal(attempts, enabled ? 2 : 1);
  }
});
test("token budget stops fallback before sending a second request", async () => {
  let attempts = 0;
  const providers = createProviderService({
    config,
    fetchImpl: async () => {
      attempts++;
      return response({}, 503);
    },
  });
  const b = budget({ maxTokens: 2700 });
  await assert.rejects(
    providers.generateJSON({
      system: "Return JSON",
      input: {},
      schema,
      budget: b,
    }),
    { code: "token_budget" },
  );
  assert.equal(attempts, 1);
});
test("Tavily receives Deep mode depth, source count, and abort signal", async () => {
  let captured;
  const providers = createProviderService({
    config,
    fetchImpl: async (url, options) => {
      captured = options;
      return response({
        results: [
          {
            title: "Evidence",
            url: "https://example.org",
            content: "Excerpt",
            score: 0.8,
          },
        ],
      });
    },
  });
  const b = budget();
  const results = await providers.search("agriculture", {
    mode: "deep",
    budget: b,
  });
  const body = JSON.parse(captured.body);
  assert.equal(body.search_depth, "advanced");
  assert.equal(body.max_results, 6);
  assert.equal(b.state.usage.searchRequests, 1);
  assert.ok(captured.signal instanceof AbortSignal);
  assert.equal(results.length, 1);
});
test("cancellation aborts an in-flight request and never triggers fallback", async () => {
  const controller = new AbortController();
  const state = budget().state;
  const b = new ExecutionBudget(state, { signal: controller.signal });
  let attempts = 0;
  const providers = createProviderService({
    config,
    fetchImpl: async (url, options) => {
      attempts++;
      controller.abort();
      options.signal.throwIfAborted();
    },
  });
  await assert.rejects(
    providers.generateJSON({
      system: "Return JSON",
      input: {},
      schema,
      budget: b,
    }),
    { code: "cancelled" },
  );
  assert.equal(attempts, 1);
});

test("explicit pre-generation rejections release token reservations for the configured fallback", async () => {
  let count = 0;
  const service = createProviderService({
    config,
    fetchImpl: async () =>
      ++count === 1
        ? response({}, 413)
        : response({
            candidates: [
              {
                content: {
                  parts: [{ text: '{"answer":"Supported fallback"}' }],
                },
              },
            ],
            usageMetadata: { promptTokenCount: 30, totalTokenCount: 50 },
          }),
  });
  const b = budget({ maxTokens: 2700 });
  const result = await service.generateJSON({
    system: "Return JSON",
    input: {},
    schema,
    budget: b,
  });
  assert.equal(result.provider, "gemini");
  assert.equal(b.state.usage.tokensCharged, 50);
  assert.equal(b.state.usage.rejectedRequests, 1);
  assert.equal(b.state.usage.estimatedTokens, 0);
});
