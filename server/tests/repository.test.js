import test from "node:test";
import assert from "node:assert/strict";
import { ResearchSession, Report } from "../models/index.js";
import { mongoRepository } from "../services/apollo/repository.js";
import { ExecutionStopped } from "../services/apollo/errors.js";

test("session claims and state saves require exclusive active ownership", async (t) => {
  const filters = [];
  t.mock.method(ResearchSession, "findOneAndUpdate", (filter, update) => {
    filters.push(filter);
    return { lean: async () => ({ _id: "test-session", ...update.$set }) };
  });
  await mongoRepository.claim("test-session");
  await mongoRepository.save({
    _id: "test-session",
    status: "running",
    stage: "planning",
  });
  assert.equal(filters[0].status, "queued");
  assert.deepEqual(filters[0].cancelRequested, { $ne: true });
  assert.equal(filters[1].status, "running");
  assert.deepEqual(filters[1].cancelRequested, { $ne: true });
});
test("report publication has a database-side deadline guard", async (t) => {
  let captured;
  t.mock.method(ResearchSession, "findOneAndUpdate", (filter) => {
    captured = filter;
    return { lean: async () => ({ _id: "test-session", status: "completed" }) };
  });
  await mongoRepository.save({ _id: "test-session", status: "completed" });
  assert.deepEqual(captured.$expr, { $gt: ["$deadlineAt", "$$NOW"] });
});
test("a cancelled session cannot be revived by a late checkpoint", async (t) => {
  t.mock.method(ResearchSession, "findOneAndUpdate", () => ({
    lean: async () => null,
  }));
  await assert.rejects(
    mongoRepository.save({ _id: "test-session", status: "running" }),
    { code: "cancelled" },
  );
});
test("a report is removed when cancellation wins the final commit race", async (t) => {
  let removed = false;
  t.mock.method(Report, "create", async () => ({ _id: "test-report" }));
  t.mock.method(Report, "deleteOne", async (filter) => {
    assert.equal(filter._id, "test-report");
    removed = true;
  });
  t.mock.method(mongoRepository, "save", async () => {
    throw new ExecutionStopped("cancelled", "Cancelled");
  });
  await assert.rejects(mongoRepository.finish({ _id: "test-session" }, {}), {
    code: "cancelled",
  });
  assert.equal(removed, true);
});
test("deadline expiration during report persistence prevents publication", async (t) => {
  let removed = false,
    published = false;
  t.mock.method(Report, "create", async () => ({ _id: "test-report" }));
  t.mock.method(Report, "deleteOne", async () => {
    removed = true;
  });
  t.mock.method(mongoRepository, "save", async () => {
    published = true;
  });
  await assert.rejects(
    mongoRepository.finish(
      { _id: "test-session" },
      {},
      {
        check: () => {
          throw new ExecutionStopped("timeout", "Deadline exceeded");
        },
      },
    ),
    { code: "timeout" },
  );
  assert.equal(removed, true);
  assert.equal(published, false);
});

test("source and evidence ID defaults are safe in MongoDB upsert context", async () => {
  const { Source, Evidence } = await import("../models/index.js");
  assert.doesNotThrow(() => Source.schema.path("sourceId").getDefault(null));
  assert.doesNotThrow(() =>
    Evidence.schema.path("evidenceId").getDefault(null),
  );
  const source = new Source();
  const evidence = new Evidence();
  assert.equal(source.sourceId, String(source._id));
  assert.equal(evidence.evidenceId, String(evidence._id));
});
