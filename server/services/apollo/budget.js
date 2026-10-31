import { ExecutionStopped } from "./errors.js";
export function emptyUsage() {
  return {
    searchRequests: 0,
    llmRequests: 0,
    promptTokens: 0,
    completionTokens: 0,
    reportedTokens: 0,
    estimatedTokens: 0,
    tokensCharged: 0,
    estimatedCostUsd: 0,
    unpricedRequests: 0,
    unreportedRequests: 0,
  };
}
export class ExecutionBudget {
  constructor(state, { signal, now = Date.now } = {}) {
    this.state = state;
    this.signal = signal;
    this.now = now;
  }
  forPhase(deadlineAt, code) {
    const scoped = Object.create(this);
    scoped.phaseDeadline = Math.min(
      Number(deadlineAt),
      this.phaseDeadline ?? Infinity,
    );
    scoped.phaseCode = code;
    return scoped;
  }
  remainingMs() {
    return Math.max(
      0,
      Math.min(
        new Date(this.state.deadlineAt).getTime(),
        this.phaseDeadline ?? Infinity,
      ) - this.now(),
    );
  }
  check() {
    if (this.signal?.aborted)
      throw this.signal.reason instanceof ExecutionStopped
        ? this.signal.reason
        : new ExecutionStopped("cancelled", "Research was cancelled.");
    if (this.now() >= new Date(this.state.deadlineAt).getTime())
      throw new ExecutionStopped(
        "timeout",
        "Research reached its execution timeout.",
      );
    if (this.now() >= (this.phaseDeadline ?? Infinity))
      throw new ExecutionStopped(
        this.phaseCode,
        "Stopping optional work to reserve time for evidence review and report completion.",
      );
  }
  reserveLLM(system, prompt, outputTokens, pricing) {
    this.check();
    // UTF-8 bytes plus overhead is deliberately conservative when tokenizer data is unavailable.
    const input = Buffer.byteLength(system + prompt, "utf8") + 1024;
    const reserved = input + outputTokens;
    if (this.state.usage.tokensCharged + reserved > this.state.limits.maxTokens)
      throw new ExecutionStopped(
        "token_budget",
        "Research reached its token budget.",
      );
    const cost = pricing
      ? (input * pricing.input) / 1e6 + (outputTokens * pricing.output) / 1e6
      : undefined;
    this.reserveCost(cost);
    this.state.usage.llmRequests++;
    this.state.usage.tokensCharged += reserved;
    this.state.usage.estimatedTokens += reserved;
    return { input, outputTokens, reserved, cost };
  }
  reserveCost(cost) {
    if (cost === undefined) {
      if (this.state.limits.maxCostUsd !== undefined)
        throw new ExecutionStopped(
          "unmeasurable_cost",
          "A cost budget requires configured prices for every enabled provider.",
        );
      this.state.usage.unpricedRequests++;
      return;
    }
    if (
      this.state.limits.maxCostUsd !== undefined &&
      this.state.usage.estimatedCostUsd + cost > this.state.limits.maxCostUsd
    )
      throw new ExecutionStopped(
        "cost_budget",
        "Research reached its configured cost budget.",
      );
    this.state.usage.estimatedCostUsd += cost;
  }
  settleLLM(reservation, usage, pricing) {
    if (!usage) {
      this.state.usage.unreportedRequests++;
      return;
    }
    const measured = usage.totalTokens;
    this.state.usage.tokensCharged += measured - reservation.reserved;
    this.state.usage.estimatedTokens -= reservation.reserved;
    this.state.usage.reportedTokens += measured;
    this.state.usage.promptTokens += usage.promptTokens;
    this.state.usage.completionTokens += usage.completionTokens;
    if (pricing && reservation.cost !== undefined)
      this.state.usage.estimatedCostUsd +=
        (usage.promptTokens * pricing.input) / 1e6 +
        (usage.completionTokens * pricing.output) / 1e6 -
        reservation.cost;
    if (this.state.usage.tokensCharged > this.state.limits.maxTokens)
      throw new ExecutionStopped(
        "token_budget",
        "Provider-reported usage exhausted the token budget.",
      );
    if (
      this.state.limits.maxCostUsd !== undefined &&
      this.state.usage.estimatedCostUsd > this.state.limits.maxCostUsd
    )
      throw new ExecutionStopped(
        "cost_budget",
        "Provider-reported usage exhausted the cost budget.",
      );
  }
  rejectLLM(reservation) {
    // Authentication, size and rate-limit rejections do not execute inference.
    // Keep dispatched request counts, but do not treat a reservation as usage.
    this.state.usage.tokensCharged -= reservation.reserved;
    this.state.usage.estimatedTokens -= reservation.reserved;
    if (reservation.cost !== undefined)
      this.state.usage.estimatedCostUsd -= reservation.cost;
    this.state.usage.rejectedRequests =
      (this.state.usage.rejectedRequests || 0) + 1;
  }
  reserveSearch(price) {
    this.check();
    if (this.state.usage.searchRequests >= this.state.limits.maxSearchRequests)
      throw new ExecutionStopped(
        "search_limit",
        "Research reached its search request limit.",
      );
    this.reserveCost(price);
    this.state.usage.searchRequests++;
  }
  requestSignal(ms) {
    this.check();
    return AbortSignal.any([
      ...(this.signal ? [this.signal] : []),
      AbortSignal.timeout(
        Math.max(1, Math.floor(Math.min(ms, this.remainingMs()))),
      ),
    ]);
  }
}
