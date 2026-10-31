import { AppError } from "../middleware/errors.js";

// Only application-authored messages are exposed; never persist provider bodies,
// credentials, prompts or model-generated validation errors.
export class ProviderError extends AppError {
  constructor(provider, code, message, { httpStatus, retryAt } = {}) {
    super(message, 502);
    this.provider = provider;
    this.code = code;
    this.httpStatus = httpStatus;
    this.retryAt = retryAt;
  }
}
export function providerDiagnostic(error) {
  return error instanceof ProviderError
    ? {
        provider: error.provider,
        code: error.code,
        httpStatus: error.httpStatus,
        retryAt: error.retryAt
          ? new Date(error.retryAt).toISOString()
          : undefined,
        reason: error.message,
      }
    : undefined;
}
export function retryDelay(response, now) {
  const value = response.headers.get("retry-after");
  if (value !== null) {
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    const date = Date.parse(value);
    if (Number.isFinite(date)) return Math.max(0, date - now);
  }
  // Groq reset values are durations (e.g. "1m2.5s"), not epoch timestamps.
  const waits = ["tokens", "requests"].flatMap((kind) => {
    const remaining = response.headers.get(`x-ratelimit-remaining-${kind}`);
    if (remaining === null || Number(remaining) > 0) return [];
    const reset = response.headers.get(`x-ratelimit-reset-${kind}`) || "";
    if (!/^(?:\d+(?:\.\d+)?(?:ms|s|m|h))+$/.test(reset)) return [];
    const units = { ms: 1, s: 1000, m: 60000, h: 3600000 };
    return [...reset.matchAll(/(\d+(?:\.\d+)?)(ms|s|m|h)/g)].reduce(
      (sum, [, amount, unit]) => sum + Number(amount) * units[unit],
      0,
    );
  });
  return waits.length ? Math.max(...waits) : 5000;
}
