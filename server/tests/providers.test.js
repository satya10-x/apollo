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

test("429 retries honor Retry-After beyond 30 seconds and release rejected reservations", async () => {
  let time = Date.now(),
    calls = 0;
  const waits = [];
  const b = budget();
  b.now = () => time;
  b.state.deadlineAt = new Date(time + 120000);
  const service = createProviderService({
    config: { ...config, GEMINI_FALLBACK_ENABLED: false },
    now: () => time,
    sleep: async (ms) => {
      waits.push(ms);
      time += ms;
    },
    fetchImpl: async () =>
      ++calls === 1
        ? new Response("{}", { status: 429, headers: { "retry-after": "45" } })
        : response({
            choices: [{ message: { content: '{"answer":"Recovered"}' } }],
            usage: { prompt_tokens: 20, total_tokens: 30 },
          }),
  });
  await service.generateJSON({
    system: "Return JSON",
    input: {},
    schema,
    budget: b,
  });
  assert.deepEqual(waits, [45000]);
  assert.equal(calls, 2);
  assert.equal(b.state.usage.rejectedRequests, 1);
  assert.equal(b.state.usage.tokensCharged, 30);
});

test("a throttled primary uses fallback immediately and shares cooldown with later calls", async () => {
  const calls = [];
  const service = createProviderService({
    config,
    sleep: async () => assert.fail("Available fallback must not wait"),
    fetchImpl: async (url) => {
      calls.push(url);
      return url.includes("groq.com")
        ? new Response("{}", { status: 429, headers: { "retry-after": "60" } })
        : response({
            candidates: [
              { content: { parts: [{ text: '{"answer":"Fallback"}' }] } },
            ],
          });
    },
  });
  for (let n = 0; n < 2; n++) {
    const result = await service.generateJSON({
      system: "Return JSON",
      input: {},
      schema,
      budget: budget(),
    });
    assert.equal(result.provider, "gemini");
  }
  assert.equal(calls.filter((url) => url.includes("groq.com")).length, 1);
  assert.equal(calls.length, 3);
});

test("a cooldown beyond the deadline fails clearly without sleeping or sending more requests", async () => {
  let calls = 0;
  const service = createProviderService({
    config: { ...config, GEMINI_FALLBACK_ENABLED: false },
    sleep: async () => assert.fail("Must not wait beyond deadline"),
    fetchImpl: async () => {
      calls++;
      return new Response("{}", {
        status: 429,
        headers: { "retry-after": "3600" },
      });
    },
  });
  for (let n = 0; n < 2; n++) {
    await assert.rejects(
      service.generateJSON({
        system: "Return JSON",
        input: {},
        schema,
        budget: budget(),
      }),
      { code: "provider_rate_limit", httpStatus: 429 },
    );
  }
  assert.equal(calls, 1);
});

test("persistent throttling has a bounded retry count", async () => {
  let time = Date.now(),
    calls = 0;
  const b = budget();
  b.now = () => time;
  const service = createProviderService({
    config: { ...config, GEMINI_FALLBACK_ENABLED: false },
    now: () => time,
    sleep: async (ms) => {
      time += ms;
    },
    fetchImpl: async () => {
      calls++;
      return new Response("{}", {
        status: 429,
        headers: { "retry-after": "1" },
      });
    },
  });
  await assert.rejects(
    service.generateJSON({
      system: "Return JSON",
      input: {},
      schema,
      budget: b,
    }),
    { code: "provider_rate_limit" },
  );
  assert.equal(calls, 2);
  assert.equal(b.state.usage.tokensCharged, 0);
});

test("cancellation during provider cooldown prevents retry", async () => {
  const controller = new AbortController();
  const b = new ExecutionBudget(budget().state, { signal: controller.signal });
  let calls = 0;
  const service = createProviderService({
    config: { ...config, GEMINI_FALLBACK_ENABLED: false },
    sleep: async (ms, value, { signal }) => {
      controller.abort();
      signal.throwIfAborted();
    },
    fetchImpl: async () => {
      calls++;
      return new Response("{}", {
        status: 429,
        headers: { "retry-after": "1" },
      });
    },
  });
  await assert.rejects(
    service.generateJSON({
      system: "Return JSON",
      input: {},
      schema,
      budget: b,
    }),
    { code: "cancelled" },
  );
  assert.equal(calls, 1);
});

test("oversized requests are not retried and retain a safe actionable diagnostic", async () => {
  let calls = 0;
  const service = createProviderService({
    config: { ...config, GEMINI_FALLBACK_ENABLED: false },
    fetchImpl: async () => {
      calls++;
      return response({ error: { message: "private provider payload" } }, 413);
    },
  });
  await assert.rejects(
    service.generateJSON({
      system: "Return JSON",
      input: {},
      schema,
      budget: budget(),
    }),
    (error) => {
      assert.equal(error.code, "provider_request_too_large");
      assert.equal(error.httpStatus, 413);
      assert.ok(!error.message.includes("private provider payload"));
      return true;
    },
  );
  assert.equal(calls, 1);
});

test("a throttled fallback does not mask a recoverable primary request-size rejection", async () => {
  const service = createProviderService({
    config,
    fetchImpl: async (url) =>
      url.includes("groq.com")
        ? response({}, 413)
        : new Response("{}", {
            status: 429,
            headers: { "retry-after": "3600" },
          }),
  });
  await assert.rejects(
    service.generateJSON({
      system: "Return JSON",
      input: {},
      schema,
      budget: budget(),
    }),
    (error) => {
      assert.equal(error.code, "provider_request_too_large");
      assert.match(error.message, /groq HTTP 413; gemini HTTP 429/);
      return true;
    },
  );
});
