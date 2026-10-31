import { z } from "zod";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { setTimeout as delay } from "node:timers/promises";
import { env } from "../../config/env.js";
import { ExecutionStopped } from "../apollo/errors.js";
import { canonicalizeUrl } from "./sources.js";
const resultSchema = z.object({
  title: z.string().nullish(),
  url: z.string(),
  content: z.string().nullish(),
  raw_content: z.string().nullish(),
  text: z.string().nullish(),
  score: z.number().finite().nullish(),
  published_date: z.string().nullish(),
  publishedDate: z.string().nullish(),
  id: z.union([z.string(), z.number()]).optional(),
});
class SearchFailure extends Error {
  constructor(message, { retryable = false, status } = {}) {
    super(message);
    this.name = "SearchFailure";
    this.retryable = retryable;
    this.status = status;
  }
}
let arxivQueue = Promise.resolve(),
  lastArxivAt = 0;
async function arxivGate(signal, interval) {
  const previous = arxivQueue;
  let release;
  arxivQueue = new Promise((resolve) => {
    release = resolve;
  });
  try {
    await new Promise((resolve, reject) => {
      const abort = () => reject(signal.reason);
      if (signal.aborted) return reject(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
      previous.then(() => {
        signal.removeEventListener("abort", abort);
        if (signal.aborted) reject(signal.reason);
        else resolve();
      });
    });
    signal.throwIfAborted();
    const wait = Math.max(0, lastArxivAt + interval - Date.now());
    if (wait) await delay(wait, undefined, { signal });
    signal.throwIfAborted();
    lastArxivAt = Date.now();
    return release;
  } catch (error) {
    previous.then(release);
    throw error;
  }
}
async function readBounded(response, maxBytes = 3_000_000) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes)
        throw new SearchFailure(
          "Search response exceeded the retrieval size limit.",
        );
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally {
    await reader.cancel().catch(() => {});
  }
}
export function createSearchService({
  config = env,
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
} = {}) {
  async function attempt(provider, query, { budget, onAttempt = () => {} }) {
    budget.check();
    let releaseArxiv;
    if (
      budget.state.usage.searchRequests >= budget.state.limits.maxSearchRequests
    )
      throw new ExecutionStopped(
        "search_limit",
        "Research reached its search request limit.",
      );
    if (provider === "arxiv")
      releaseArxiv = await arxivGate(
        budget.requestSignal(45000),
        config.ATHENA_ARXIV_INTERVAL_MS ?? 3000,
      );
    const price =
      provider === "arxiv"
        ? 0
        : provider === "exa"
          ? config.EXA_USD_PER_REQUEST
          : config.TAVILY_USD_PER_REQUEST;
    try {
      budget.reserveSearch(price);
    } catch (error) {
      releaseArxiv?.();
      throw error;
    }
    budget.state.usage.searchProviders ||= {};
    budget.state.usage.searchProviders[provider] =
      (budget.state.usage.searchProviders[provider] || 0) + 1;
    const limit = budget.state.limits.resultsPerSearch;
    const startedAt = now();
    try {
      const signal = budget.requestSignal(
        config.ATHENA_SEARCH_TIMEOUT_MS ?? 30000,
      );
      let endpoint, options;
      if (provider === "arxiv") {
        const words = (query.match(/[\p{L}\p{N}]+/gu) || []).slice(0, 14);
        if (!words.length)
          throw new SearchFailure("Academic query has no searchable terms.");
        const url = new URL("https://export.arxiv.org/api/query");
        url.search = new URLSearchParams({
          search_query: words.map((word) => `all:"${word}"`).join(" AND "),
          start: "0",
          max_results: String(Math.min(limit, 6)),
          sortBy: "relevance",
        }).toString();
        endpoint = url.href;
        options = {
          signal,
          headers: {
            "User-Agent": "ApolloResearch/1.0 (arXiv metadata research client)",
            Accept: "application/atom+xml",
          },
        };
      } else if (provider === "tavily") {
        endpoint = "https://api.tavily.com/search";
        options = {
          method: "POST",
          signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.TAVILY_API_KEY}`,
          },
          body: JSON.stringify({
            query,
            search_depth: budget.state.limits.searchDepth,
            max_results: limit,
            include_answer: false,
            include_raw_content: budget.state.mode === "quick" ? false : "text",
            include_published_date: true,
            auto_parameters: false,
          }),
        };
      } else {
        endpoint = "https://api.exa.ai/search";
        options = {
          method: "POST",
          signal,
          headers: {
            "Content-Type": "application/json",
            "x-api-key": config.EXA_API_KEY,
          },
          body: JSON.stringify({
            query,
            type: "auto",
            numResults: limit,
            contents: {
              text: {
                maxCharacters:
                  budget.state.mode === "quick"
                    ? 6000
                    : budget.state.mode === "deep"
                      ? 24000
                      : 12000,
              },
            },
          }),
        };
      }
      const response = await fetchImpl(endpoint, options);
      if (!response.ok)
        throw new SearchFailure(
          `${provider} returned HTTP ${response.status}.`,
          {
            status: response.status,
            retryable: response.status === 429 || response.status >= 500,
          },
        );
      const body = await readBounded(response);
      let results, requestId;
      if (provider === "arxiv") {
        if (
          /<!DOCTYPE|<!ENTITY/i.test(body) ||
          XMLValidator.validate(body) !== true
        )
          throw new SearchFailure("arXiv returned invalid Atom XML.");
        const parsed = new XMLParser({
          ignoreAttributes: false,
          parseTagValue: false,
          trimValues: false,
          processEntities: true,
        }).parse(body);
        if (!parsed.feed)
          throw new SearchFailure("arXiv returned an invalid feed.");
        const entries = parsed.feed.entry
          ? Array.isArray(parsed.feed.entry)
            ? parsed.feed.entry
            : [parsed.feed.entry]
          : [];
        if (
          entries.some((entry) =>
            String(entry.id || "").includes("/api/errors"),
          )
        )
          throw new SearchFailure("arXiv rejected the academic query.");
        results = entries.map((entry) => ({
          title: String(entry.title || "")
            .replace(/\s+/g, " ")
            .trim(),
          url: entry.id,
          content: entry.summary,
          published_date: entry.published,
          id: entry.id,
        }));
      } else {
        let parsed;
        try {
          parsed = JSON.parse(body);
        } catch {
          throw new SearchFailure(`${provider} returned invalid JSON.`);
        }
        if (!Array.isArray(parsed.results))
          throw new SearchFailure(`${provider} omitted its search results.`);
        results = parsed.results;
        requestId =
          typeof parsed.request_id === "string"
            ? parsed.request_id
            : typeof parsed.requestId === "string"
              ? parsed.requestId
              : undefined;
      }
      const extracted = results
        .slice(0, 100)
        .flatMap((raw) => {
          const validated = resultSchema.safeParse(raw);
          if (!validated.success) return [];
          const value = validated.data;
          try {
            canonicalizeUrl(value.url);
          } catch {
            return [];
          }
          const content =
            provider === "exa"
              ? value.text
              : provider === "arxiv"
                ? value.content
                : value.raw_content?.trim()
                  ? value.raw_content
                  : value.content;
          if (!content?.trim()) return [];
          return [
            {
              title: value.title || new URL(value.url).hostname,
              url: value.url,
              content: content.slice(0, 24000),
              score: value.score ?? undefined,
              published_date: value.published_date || value.publishedDate,
              retrieval: {
                provider,
                query,
                retrievedAt: now(),
                contentKind:
                  provider === "arxiv"
                    ? "abstract"
                    : provider === "exa" || value.raw_content?.trim()
                      ? "page_text"
                      : "search_excerpt",
                providerResultId:
                  value.id === undefined ? undefined : String(value.id),
                requestId,
              },
            },
          ];
        })
        .slice(0, limit);
      onAttempt({
        provider,
        status: extracted.length ? "completed" : "empty",
        startedAt,
        finishedAt: now(),
        resultCount: extracted.length,
      });
      budget.check();
      return extracted;
    } catch (error) {
      budget.check();
      if (error instanceof ExecutionStopped) throw error;
      const safe =
        error instanceof SearchFailure
          ? error
          : new SearchFailure(`${provider} request failed or timed out.`, {
              retryable: true,
            });
      onAttempt({
        provider,
        status: "failed",
        startedAt,
        finishedAt: now(),
        error: safe.message,
      });
      throw safe;
    } finally {
      releaseArxiv?.();
    }
  }
  async function search(query, { budget, kind = "web", onAttempt } = {}) {
    const chain =
      kind === "academic"
        ? ["arxiv"]
        : [
            "tavily",
            ...(config.EXA_API_KEY && config.EXA_FALLBACK_ENABLED !== false
              ? ["exa"]
              : []),
          ];
    let lastError,
      hadEmpty = false;
    for (const provider of chain) {
      if (provider === "tavily" && !config.TAVILY_API_KEY) {
        lastError = new SearchFailure("Tavily credentials are not configured.");
        continue;
      }
      for (let retry = 0; retry <= (config.ATHENA_MAX_RETRIES ?? 1); retry++) {
        try {
          const results = await attempt(provider, query, { budget, onAttempt });
          if (results.length) return results;
          hadEmpty = true;
          break;
        } catch (error) {
          if (error instanceof ExecutionStopped) throw error;
          lastError = error;
          if (!error.retryable || retry === (config.ATHENA_MAX_RETRIES ?? 1))
            break;
          await delay(Math.min(1000 * 2 ** retry, 3000), undefined, {
            signal: budget.requestSignal(5000),
          });
        }
      }
    }
    budget.check();
    if (hadEmpty) return [];
    throw lastError || new SearchFailure("No search provider is available.");
  }
  return { search };
}
