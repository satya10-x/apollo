// Opt-in live API verification. No research sessions or sample records are inserted.
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { createSearchService } from "../services/athena/search.js";
import { ExecutionBudget, emptyUsage } from "../services/apollo/budget.js";
import { normalizeRetrievedSource } from "../services/athena/sources.js";
import { extractPassages } from "../services/athena/excerpts.js";
const state = {
  deadlineAt: new Date(Date.now() + 100000),
  limits: { maxSearchRequests: 4, resultsPerSearch: 1, searchDepth: "basic" },
  usage: emptyUsage(),
};
const budget = new ExecutionBudget(state);
const config = {
  ...env,
  ATHENA_MAX_RETRIES: 0,
  ATHENA_SEARCH_TIMEOUT_MS: 20000,
};
for (const provider of ["tavily", "exa", "arxiv"]) {
  if (
    (provider === "tavily" && !env.TAVILY_API_KEY) ||
    (provider === "exa" && !env.EXA_API_KEY)
  ) {
    console.log(JSON.stringify({ provider, status: "not_configured" }));
    continue;
  }
  try {
    const service = createSearchService({
      config: {
        ...config,
        ...(provider === "exa"
          ? { TAVILY_API_KEY: "", EXA_FALLBACK_ENABLED: true }
          : provider === "tavily"
            ? { EXA_FALLBACK_ENABLED: false }
            : {}),
      },
    });
    const results = await service.search(
      provider === "arxiv"
        ? "retrieval augmented generation"
        : "AI agriculture India government crop monitoring",
      { budget, kind: provider === "arxiv" ? "academic" : "web" },
    );
    const first =
      results[0] &&
      normalizeRetrievedSource(results[0], "agriculture research");
    const passages = first
      ? extractPassages(first, "agriculture research")
      : [];
    if (
      first &&
      passages.some(
        (p) => first.content.slice(p.startOffset, p.endOffset) !== p.passage,
      )
    )
      throw new Error("Excerpt validation failed.");
    console.log(
      JSON.stringify({
        provider,
        status: first ? "retrieved" : "empty",
        title: first?.title,
        url: first?.url,
        contentKind: first?.contentKind,
        passages: passages.length,
      }),
    );
  } catch (error) {
    console.log(
      JSON.stringify({ provider, status: "failed", error: error.message }),
    );
    process.exitCode = 1;
  }
}
if (env.MONGODB_URI) {
  try {
    await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    await mongoose.connection.db.admin().ping();
    console.log(JSON.stringify({ database: "reachable" }));
  } catch {
    console.log(JSON.stringify({ database: "unavailable" }));
  } finally {
    await mongoose.disconnect();
  }
}
console.log(
  JSON.stringify({
    searchRequests: state.usage.searchRequests,
    searchProviders: state.usage.searchProviders,
  }),
);
