import test from "node:test";
import assert from "node:assert/strict";
import { app } from "../app.js";
import { createSchema } from "../controllers/sessions.js";

const server = app.listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => new Promise((resolve) => server.close(resolve)));

test("health exposes readiness without exposing credentials", async () => {
  const response = await fetch(`${base}/api/health`);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(Object.keys(data).sort(), [
    "database",
    "researchConfigured",
    "status",
  ]);
  assert.equal(data.database, "disconnected");
});
test("database-dependent endpoints fail explicitly instead of returning fake data", async () => {
  for (const path of ["/api/sessions", "/api/sessions/stats"]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 503);
    const data = await response.json();
    assert.match(data.error, /MongoDB/);
    assert.equal(data.sessions, undefined);
  }
});
test("malformed JSON is rejected with a client error", async () => {
  const response = await fetch(`${base}/api/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{broken",
  });
  assert.equal(response.status, 400);
});
test("unknown API paths return JSON 404", async () => {
  const response = await fetch(`${base}/api/unknown`);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error, "API endpoint not found.");
});
test("research input is trimmed and bounded", () => {
  assert.deepEqual(
    createSchema.parse({
      topic: "  Battery recycling economics  ",
      mode: "deep",
      maxRounds: 5,
    }),
    {
      topic: "Battery recycling economics",
      mode: "deep",
      maxRounds: 5,
      requirePlanApproval: false,
    },
  );
  for (const value of [
    { topic: "tiny", mode: "quick", maxRounds: 1 },
    { topic: "Valid research topic", mode: "unknown", maxRounds: 1 },
    { topic: "Valid research topic", mode: "standard", maxRounds: 6 },
    { topic: "Valid research topic", mode: "standard", maxRounds: 1.5 },
    { topic: "x".repeat(501), mode: "standard", maxRounds: 2 },
  ])
    assert.equal(createSchema.safeParse(value).success, false);
});

test("execution overrides are validated and cannot inject internal control fields", () => {
  const valid = createSchema.parse({
    topic: "A sufficiently detailed topic",
    mode: "deep",
    maxRounds: 4,
    limits: {
      timeoutMs: 60000,
      maxSearchRequests: 12,
      maxTokens: 20000,
      maxCostUsd: 1,
    },
  });
  assert.equal(valid.limits.maxSearchRequests, 12);
  for (const limits of [
    { maxRounds: 999 },
    { maxSearchRequests: 0 },
    { timeoutMs: 0 },
    { maxTokens: -1 },
    { maxCostUsd: -1 },
    { outputTokens: 999999 },
  ])
    assert.equal(
      createSchema.safeParse({
        topic: "A sufficiently detailed topic",
        mode: "deep",
        maxRounds: 3,
        limits,
      }).success,
      false,
    );
});
