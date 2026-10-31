import test from "node:test";
import assert from "node:assert/strict";
import { ExecutionBudget, emptyUsage } from "../services/apollo/budget.js";
function make(limits = {}) {
  const state = {
    deadlineAt: new Date(Date.now() + 10000),
    limits: { maxTokens: 10000, maxSearchRequests: 2, ...limits },
    usage: emptyUsage(),
  };
  return { state, budget: new ExecutionBudget(state) };
}
test("token reservations reject requests before they exceed the budget", () => {
  const { budget, state } = make({ maxTokens: 2000 });
  assert.throws(() => budget.reserveLLM("system", "input", 1000), {
    code: "token_budget",
  });
  assert.equal(state.usage.llmRequests, 0);
});
test("reported usage settles a conservative reservation", () => {
  const { budget, state } = make();
  const pricing = { input: 1, output: 2 };
  const reservation = budget.reserveLLM("system", "input", 2000, pricing);
  budget.settleLLM(
    reservation,
    { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    pricing,
  );
  assert.equal(state.usage.tokensCharged, 150);
  assert.equal(state.usage.estimatedTokens, 0);
  assert.equal(state.usage.reportedTokens, 150);
  assert.ok(Math.abs(state.usage.estimatedCostUsd - 0.0002) < 1e-10);
});
test("missing token usage keeps the conservative charge", () => {
  const { budget, state } = make();
  const reservation = budget.reserveLLM("system", "input", 1000);
  budget.settleLLM(reservation, undefined);
  assert.equal(state.usage.tokensCharged, reservation.reserved);
  assert.equal(state.usage.unreportedRequests, 1);
});
test("search and cost caps are checked before dispatch", () => {
  const { budget, state } = make({ maxCostUsd: 0.02 });
  budget.reserveSearch(0.01);
  budget.reserveSearch(0.01);
  assert.throws(() => budget.reserveSearch(0.01), { code: "search_limit" });
  assert.equal(state.usage.searchRequests, 2);
  const other = make({ maxCostUsd: 0.001 });
  assert.throws(() => other.budget.reserveSearch(0.01), {
    code: "cost_budget",
  });
  assert.equal(other.state.usage.searchRequests, 0);
});
test("an explicit cost budget refuses unpriced requests", () => {
  const { budget } = make({ maxCostUsd: 1 });
  assert.throws(() => budget.reserveSearch(undefined), {
    code: "unmeasurable_cost",
  });
  assert.throws(() => budget.reserveLLM("system", "input", 100), {
    code: "unmeasurable_cost",
  });
});
test("requests fail immediately after cancellation or deadline", () => {
  const controller = new AbortController();
  const { state } = make();
  const budget = new ExecutionBudget(state, { signal: controller.signal });
  controller.abort();
  assert.throws(() => budget.check(), { code: "cancelled" });
  const expired = make();
  expired.state.deadlineAt = new Date(0);
  assert.throws(() => expired.budget.check(), { code: "timeout" });
});
