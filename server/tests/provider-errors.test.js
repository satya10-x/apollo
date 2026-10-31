import test from "node:test";
import assert from "node:assert/strict";
import {
  retryDelay,
  providerDiagnostic,
  ProviderError,
} from "../services/provider-errors.js";
const response = (headers) => new Response("{}", { status: 429, headers });
test("Retry-After dates and exhausted-resource reset durations are parsed", () => {
  const now = Date.parse("2026-11-01T00:00:00Z");
  assert.equal(
    retryDelay(
      response({ "retry-after": "Sun, 01 Nov 2026 00:01:00 GMT" }),
      now,
    ),
    60000,
  );
  assert.equal(
    retryDelay(
      response({
        "x-ratelimit-remaining-tokens": "0",
        "x-ratelimit-reset-tokens": "1m2.5s",
        "x-ratelimit-remaining-requests": "100",
        "x-ratelimit-reset-requests": "24h",
      }),
      now,
    ),
    62500,
  );
  assert.equal(retryDelay(response({ "retry-after": "invalid" }), now), 5000);
});
test("diagnostics expose only safe application-defined provider errors", () => {
  assert.equal(providerDiagnostic(new Error("sensitive response")), undefined);
  const error = new ProviderError(
    "groq",
    "provider_rate_limit",
    "Rate limited.",
    { httpStatus: 429, retryAt: 1000 },
  );
  assert.deepEqual(providerDiagnostic(error), {
    provider: "groq",
    code: "provider_rate_limit",
    reason: "Rate limited.",
    httpStatus: 429,
    retryAt: "1970-01-01T00:00:01.000Z",
  });
});
