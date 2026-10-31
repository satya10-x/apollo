// Opt-in integration check: real retrieval, production Mongo repository, isolated disposable DB.
import mongoose from "mongoose";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import { env } from "../config/env.js";
import { providers } from "../services/providers.js";
import { ResearchSession, Source, Evidence } from "../models/index.js";
import { mongoRepository } from "../services/apollo/repository.js";
import { createAthenaRetriever } from "../services/athena/retrieval.js";
import { ExecutionBudget, emptyUsage } from "../services/apollo/budget.js";
const dbName = `apollo_av_${Date.now()}_${randomBytes(4).toString("hex")}`;
let connected = false;
try {
  if (!env.MONGODB_URI || !env.TAVILY_API_KEY)
    throw new Error("MongoDB and Tavily must be configured.");
  await mongoose.connect(env.MONGODB_URI, {
    dbName,
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 5000,
    socketTimeoutMS: 10000,
    maxPoolSize: 1,
  });
  connected = true;
  await Promise.all([Source.init(), Evidence.init()]);
  const session = await ResearchSession.create({
    topic: "AI agriculture India government crop monitoring",
    mode: "standard",
    maxRounds: 1,
  });
  await mongoRepository.claim(session.id);
  const task = {
    id: "verify-retrieval",
    sectionId: "agriculture",
    question: "What government evidence describes AI crop monitoring in India?",
    queries: ["AI agriculture India government crop monitoring"],
    expectedEvidence: ["Government publications"],
    status: "running",
  };
  const state = {
    _id: session._id,
    status: "running",
    stage: "searching",
    limits: {
      maxSources: 3,
      maxSearchRequests: 3,
      resultsPerSearch: 3,
      searchDepth: "basic",
    },
    usage: emptyUsage(),
    deadlineAt: new Date(Date.now() + 90000),
    researchMemory: { queries: [], investigatedQuestions: [] },
    tasks: [task],
  };
  const sources = [],
    evidence = [],
    budget = new ExecutionBudget(state);
  const collect = createAthenaRetriever({
    repository: mongoRepository,
    providers,
    config: { ATHENA_ARXIV_ENABLED: false, ATHENA_SEARCH_CONCURRENCY: 1 },
  });
  const run = async (task, section) =>
    collect({
      state,
      task,
      section,
      sources,
      evidence,
      budget,
      sourceAllowance: 3,
      checkpoint: async () => {
        budget.check();
        await mongoRepository.save(state);
      },
    });
  await run(task, { id: "agriculture", title: "Agricultural AI applications" });
  assert.ok(sources.length > 0, "A real source must be retrieved.");
  assert.ok(evidence.length > 0, "Supporting excerpts must be persisted.");
  const second = {
    ...task,
    id: "verify-reuse",
    sectionId: "adoption",
    sourceIds: [],
    evidenceIds: [],
  };
  await run(second, { id: "adoption", title: "Farmer adoption" });
  const savedSources = await mongoRepository.listSources(session.id),
    savedEvidence = await mongoRepository.listEvidence(session.id);
  assert.equal(
    state.usage.searchRequests,
    1,
    "Repeated session query must reuse prior retrieval.",
  );
  assert.ok(
    savedSources.every(
      (item) =>
        String(item._id) === item.sourceId &&
        item.content === undefined &&
        item.sections.includes("Farmer adoption"),
    ),
  );
  assert.ok(
    savedEvidence.every(
      (item) =>
        String(item._id) === item.evidenceId &&
        item.origin === "external_api" &&
        item.sectionIds.includes("adoption"),
    ),
  );
  assert.ok(
    savedEvidence.every((item) =>
      item.provenance.every(
        (record) => record.documentHash && record.originalUrl,
      ),
    ),
  );
  console.log(
    JSON.stringify({
      status: "passed",
      sources: savedSources.length,
      evidence: savedEvidence.length,
      searchRequests: state.usage.searchRequests,
      memoryReuse: true,
      isolatedDatabase: true,
    }),
  );
} catch (error) {
  const safeMessage = [
    env.MONGODB_URI,
    env.TAVILY_API_KEY,
    env.EXA_API_KEY,
    env.GROQ_API_KEY,
    env.GEMINI_API_KEY,
  ]
    .filter(Boolean)
    .reduce(
      (message, secret) => message.split(secret).join("[redacted]"),
      error.message,
    )
    .replace(/mongodb(?:\+srv)?:\/\/\S+/g, "[redacted MongoDB URI]");
  console.error(
    JSON.stringify({
      status: "failed",
      error: safeMessage,
      code: error.code,
      name: error.name,
    }),
  );
  process.exitCode = 1;
} finally {
  if (connected) {
    assert.match(dbName, /^apollo_av_\d+_[a-f0-9]{8}$/);
    try {
      await mongoose.connection.db.dropDatabase();
      console.log(JSON.stringify({ isolatedDatabaseCleanup: "completed" }));
    } catch {
      console.error(
        JSON.stringify({ isolatedDatabaseCleanup: "failed", database: dbName }),
      );
      process.exitCode = 1;
    }
  }
  await mongoose.disconnect();
}
