// Opt-in real Apollo→Athena→Hermes integration check, isolated from application history.
import mongoose from "mongoose";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import { env } from "../config/env.js";
import { ResearchSession, Source, Evidence, Report } from "../models/index.js";
import { resolveLimits } from "../services/apollo/policies.js";
import { runResearch, shutdownResearch } from "../services/research.js";
const database = `apollo_hv_${Date.now()}_${randomBytes(3).toString("hex")}`;
let connected = false;
try {
  if (!env.MONGODB_URI || !env.GROQ_API_KEY || !env.TAVILY_API_KEY)
    throw new Error(
      "Configure MongoDB, Groq and Tavily before live verification.",
    );
  await mongoose.connect(env.MONGODB_URI, {
    dbName: database,
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 5000,
    socketTimeoutMS: 10000,
    maxPoolSize: 2,
  });
  connected = true;
  await Promise.all([Source.init(), Evidence.init(), Report.init()]);
  const limits = resolveLimits("quick", 1, {
    maxSources: 1,
    maxSearchRequests: 2,
    timeoutMs: 180000,
  });
  const session = await ResearchSession.create({
    topic: "What official evidence describes AI crop monitoring in India?",
    mode: "quick",
    maxRounds: 1,
    limits,
  });
  console.log(
    JSON.stringify({
      status: "running",
      isolatedDatabase: true,
      mode: "quick",
      maxRounds: limits.maxRounds,
      maxSearchRequests: limits.maxSearchRequests,
      maxTokens: limits.maxTokens,
    }),
  );
  const final = await runResearch(session.id);
  const saved = await ResearchSession.findById(session.id).lean(),
    review = saved.reviews.at(-1);
  console.log(
    JSON.stringify({
      pipelineStatus: saved.status,
      stopReason: saved.stopReason,
      error: saved.error,
      llmRequests: saved.usage?.llmRequests,
      searchRequests: saved.usage?.searchRequests,
      sources: saved.sourceIds?.length,
      evidence: saved.evidenceIds?.length,
    }),
  );
  assert.ok(review, "A persisted Hermes review is required.");
  assert.ok(
    review.inspection.inspectedEvidenceRecords > 0,
    "Hermes must have inspected actual stored evidence.",
  );
  assert.ok(
    ["COMPLETE", "NEEDS_MORE_RESEARCH", "INCOMPLETE_LIMIT_REACHED"].includes(
      review.decision,
    ),
  );
  assert.equal(Object.keys(review.quality.components).length, 5);
  console.log(
    JSON.stringify({
      status: "passed",
      pipelineStatus: final.status,
      decision: review.decision,
      quality: review.quality.score,
      inspectedEvidence: review.inspection.inspectedEvidenceRecords,
      reviewedClaims: review.inspection.reviewedClaims,
      contradictions: review.contradictions.length,
      followUpRequests: review.followUpRequests.length,
      reportGenerated: Boolean(await Report.exists({ session: session.id })),
      llmRequests: saved.usage.llmRequests,
      searchRequests: saved.usage.searchRequests,
    }),
  );
} catch (error) {
  const message = [
    env.MONGODB_URI,
    env.GROQ_API_KEY,
    env.GEMINI_API_KEY,
    env.TAVILY_API_KEY,
    env.EXA_API_KEY,
  ]
    .filter(Boolean)
    .reduce(
      (value, secret) => value.split(secret).join("[redacted]"),
      error.message,
    )
    .replace(/mongodb(?:\+srv)?:\/\/\S+/g, "[redacted URI]");
  console.error(JSON.stringify({ status: "failed", error: message }));
  process.exitCode = 1;
} finally {
  await shutdownResearch();
  if (connected) {
    assert.match(database, /^apollo_hv_\d+_[a-f0-9]{6}$/);
    try {
      await mongoose.connection.db.dropDatabase();
      console.log(JSON.stringify({ isolatedDatabaseCleanup: "completed" }));
    } catch {
      console.error(
        JSON.stringify({ isolatedDatabaseCleanup: "failed", database }),
      );
      process.exitCode = 1;
    }
  }
  await mongoose.disconnect();
}
