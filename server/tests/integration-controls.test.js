import test from "node:test";
import assert from "node:assert/strict";
import { ResearchSession, Source, Evidence, Report } from "../models/index.js";
import { approvePlan, remove } from "../controllers/sessions.js";
import { regenerateSection } from "../services/reports/regenerate.js";
import { generateReport } from "../services/reports/generate.js";
import { reportFixture } from "./helpers/reportFixture.js";
import { reportProvider } from "./helpers/reportProvider.js";
const id = "000000000000000000000001";
test("plan approval only updates a live session awaiting approval", async (t) => {
  const call = t.mock.method(
    ResearchSession,
    "findOneAndUpdate",
    async (filter) => {
      assert.equal(filter.stage, "awaiting_approval");
      assert.equal(filter.status, "running");
      return null;
    },
  );
  await assert.rejects(approvePlan({ params: { id } }, { json() {} }), {
    status: 409,
  });
  call.mock.mockImplementation(async () => ({
    id,
    status: "running",
    planApprovedAt: new Date(),
  }));
  let result;
  await approvePlan(
    { params: { id } },
    {
      json(value) {
        result = value;
      },
    },
  );
  assert.ok(result.session.planApprovedAt);
});
test("history deletion refuses active sessions and removes all terminal-session records", async (t) => {
  const claim = t.mock.method(
    ResearchSession,
    "findOneAndUpdate",
    async () => null,
  );
  t.mock.method(ResearchSession, "exists", async () => ({ _id: id }));
  await assert.rejects(remove({ params: { id } }, { json() {} }), {
    status: 409,
  });
  claim.mock.mockImplementation(async (filter) => {
    assert.deepEqual(filter.status.$in, ["completed", "failed", "cancelled"]);
    return { id, status: "completed" };
  });
  const removed = [];
  for (const model of [Source, Evidence, Report])
    t.mock.method(model, "deleteMany", async (filter) => {
      assert.equal(filter.session, id);
      removed.push(model.modelName);
    });
  t.mock.method(ResearchSession, "deleteOne", async () =>
    removed.push("ResearchSession"),
  );
  await remove(
    { params: { id } },
    {
      json(value) {
        assert.equal(value.deleted, true);
      },
    },
  );
  assert.deepEqual(removed.sort(), [
    "Evidence",
    "Report",
    "ResearchSession",
    "Source",
  ]);
});
test("section regeneration reuses reviewed evidence, preserves other sections and rebuilds citations without searches", async () => {
  const f = await reportFixture();
  const stored = (await generateReport({ ...f, providers: reportProvider() }))
    .data;
  f.state.status = "completed";
  const calls = [];
  const doc = await regenerateSection({
    ...f,
    stored,
    sectionId: stored.sections[0].sectionId,
    providers: reportProvider({
      onCall: (options) => calls.push(options.system),
    }),
  });
  assert.equal(
    calls.filter((system) => system.startsWith("APOLLO_SECTION_WRITER")).length,
    1,
  );
  assert.ok(calls.at(-1).startsWith("APOLLO_REPORT_ASSEMBLER"));
  assert.deepEqual(doc.sections.slice(1), stored.sections.slice(1));
  assert.ok(doc.sourceMappings.length);
  assert.equal(doc.generation.revisions.length, 1);
  await assert.rejects(
    regenerateSection({
      ...f,
      stored,
      sectionId: "unknown",
      providers: reportProvider(),
    }),
    { status: 404 },
  );
});
