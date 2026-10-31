import test from "node:test";
import assert from "node:assert/strict";
import { exportReport } from "../controllers/reportExports.js";
import { ResearchSession, Report, Source } from "../models/index.js";
import { reportFixture } from "./helpers/reportFixture.js";
import { generateReport } from "../services/reports/generate.js";
import { reportProvider } from "./helpers/reportProvider.js";
function response() {
  return {
    headers: {},
    set(value) {
      Object.assign(this.headers, value);
    },
    send(value) {
      this.body = value;
    },
  };
}
test("export endpoints reject unfinished or missing sessions and unsupported formats", async (t) => {
  const lookup = t.mock.method(ResearchSession, "findById", () => ({
    select: async () => ({ status: "running" }),
  }));
  await assert.rejects(
    exportReport(
      { params: { id: "id" }, query: { format: "pdf" } },
      response(),
    ),
    { status: 409 },
  );
  lookup.mock.mockImplementation(() => ({ select: async () => null }));
  await assert.rejects(
    exportReport(
      { params: { id: "id" }, query: { format: "markdown" } },
      response(),
    ),
    { status: 404 },
  );
  await assert.rejects(
    exportReport(
      { params: { id: "id" }, query: { format: "html" } },
      response(),
    ),
    { name: "ZodError" },
  );
});
test("saved reports export original reference snapshots without consulting mutable live sources", async (t) => {
  const f = await reportFixture(),
    { data } = await generateReport({ ...f, providers: reportProvider() });
  t.mock.method(ResearchSession, "findById", () => ({
    select: async () => ({ status: "completed", topic: "Topic" }),
  }));
  t.mock.method(Report, "findOne", () => ({ lean: async () => data }));
  t.mock.method(Source, "find", () => {
    throw new Error("Live source lookup is forbidden for snapshot exports");
  });
  const md = response();
  await exportReport(
    { params: { id: "session" }, query: { format: "markdown" } },
    md,
  );
  assert.match(md.headers["Content-Type"], /text\/markdown/);
  assert.match(md.headers["Content-Disposition"], /attachment/);
  assert.ok(md.body.includes(data.references[0].url));
  const pdf = response();
  await exportReport(
    { params: { id: "session" }, query: { format: "pdf" } },
    pdf,
  );
  assert.equal(pdf.headers["Content-Type"], "application/pdf");
  assert.equal(pdf.body.subarray(0, 5).toString(), "%PDF-");
});
test("historical reports retain export support without invented evidence mappings", async (t) => {
  t.mock.method(ResearchSession, "findById", () => ({
    select: async () => ({ status: "completed", topic: "Legacy topic" }),
  }));
  t.mock.method(Report, "findOne", () => ({
    lean: async () => ({
      summary: "Original summary [1].",
      sections: [{ title: "Section", body: "Original section [1]." }],
      limitations: [],
    }),
  }));
  t.mock.method(Source, "find", () => ({
    sort: () => ({
      lean: async () => [
        {
          _id: "source1",
          title: "Original source",
          url: "https://example.org/original",
          domain: "example.org",
        },
      ],
    }),
  }));
  const res = response();
  await exportReport(
    { params: { id: "session" }, query: { format: "markdown" } },
    res,
  );
  assert.ok(
    res.body.includes("original claim/evidence mappings are unavailable"),
  );
  assert.ok(res.body.includes("https://example.org/original"));
});
