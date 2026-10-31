import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalizeUrl,
  classifySource,
  normalizeRetrievedSource,
  findDuplicateSource,
  QUALITY_DISCLAIMER,
} from "../services/athena/sources.js";
import { extractPassages } from "../services/athena/excerpts.js";
const body = Array.from(
  { length: 60 },
  (_, i) =>
    `Agricultural yields in district ${i} increased by ${i + 2} percent during the reported period.`,
).join(" ");
const source = (overrides = {}) =>
  normalizeRetrievedSource(
    {
      url: "https://example.gov.in/report?utm_source=mail",
      title: "Agricultural yields report",
      content: body,
      score: 0.8,
      retrieval: { provider: "tavily", contentKind: "page_text" },
      ...overrides,
    },
    "agricultural yields",
    new Date("2026-10-31"),
  );
test("canonicalization removes tracking parameters and fragments but preserves meaningful IDs", () => {
  assert.equal(
    canonicalizeUrl(
      "https://www.example.org/report/?id=12&utm_source=mail#results",
    ),
    "https://example.org/report?id=12",
  );
  assert.notEqual(
    canonicalizeUrl("https://example.org/?id=12"),
    canonicalizeUrl("https://example.org/?id=13"),
  );
  for (const url of [
    "javascript:alert(1)",
    "file:///tmp/a",
    "https://user:pass@example.org",
  ])
    assert.throws(() => canonicalizeUrl(url));
});
test("source classification covers each supported source category", () => {
  for (const [url, category] of [
    ["https://arxiv.org/abs/1234", "Academic research"],
    ["https://agricoop.gov.in/policy", "Government"],
    ["https://example.org/market-report", "Web"],
    ["https://example.org/reports/agriculture", "Industry report"],
    ["https://example.com/products/research", "Company"],
    ["https://reuters.com/world/report", "News"],
    ["https://docs.example.com/api", "Technical documentation"],
    ["https://data.gov.in/catalog", "Statistical dataset"],
  ])
    assert.equal(classifySource({ url }), category);
  assert.equal(classifySource({ url: "https://gov.in.evil.example/" }), "Web");
});
test("quality assessments label heuristics and do not invent a publication date", () => {
  const item = source();
  assert.equal(item.publishedAt, undefined);
  assert.equal(item.assessment.dimensions.freshness.score, null);
  assert.equal(item.assessment.disclaimer, QUALITY_DISCLAIMER);
  assert.ok(item.assessment.score >= 0 && item.assessment.score <= 100);
  assert.equal(item.category, "Government");
  assert.ok(Array.isArray(item.fingerprint));
  assert.ok(item.fingerprint.every((part) => /^[a-f\d]{16}$/.test(part)));
});
test("canonical and repeated-content matches preserve an explicit duplicate method", () => {
  const original = source();
  const duplicate = source({
    url: "https://example.gov.in/report?utm_campaign=x",
  });
  assert.equal(
    findDuplicateSource([original], duplicate).method,
    "canonical_url",
  );
  const syndicated = source({ url: "https://news.example.org/copied-report" });
  assert.equal(
    findDuplicateSource([original], syndicated).method,
    "exact_normalized_content",
  );
  const unrelated = source({
    url: "https://example.org/new",
    content: "Different brief content sufficient for excerpt extraction.",
  });
  assert.equal(findDuplicateSource([original], unrelated), null);
});
test("near duplicates require substantial content overlap and compatible titles", () => {
  const original = source();
  const modified = source({
    url: "https://mirror.example/report",
    content: body + " A small editorial addition.",
  });
  assert.equal(
    findDuplicateSource([original], modified)?.method,
    "near_duplicate_content",
  );
  const unrelated = source({
    url: "https://different.example/report",
    title: "Unrelated banking report",
    content: body + " A small editorial addition.",
  });
  assert.equal(findDuplicateSource([original], unrelated), null);
});
test("every evidence passage is an exact bounded span of API content", () => {
  const item = source();
  const passages = extractPassages(item, "district 25 yields");
  assert.ok(passages.length > 0 && passages.length <= 4);
  for (const passage of passages) {
    assert.equal(
      passage.passage,
      item.content.slice(passage.startOffset, passage.endOffset),
    );
    assert.ok(passage.passage.length <= 1400);
    assert.equal(passage.origin, "external_api");
    assert.equal(passage.provider, "tavily");
    assert.equal(passage.originalUrl, item.url);
  }
  assert.deepEqual(
    extractPassages({ ...item, content: "short" }, "question"),
    [],
  );
});
test("normalization never treats a generated summary as retrieved content", () => {
  assert.equal(
    normalizeRetrievedSource(
      {
        url: "https://example.org",
        title: "Generated",
        summary: "AI-generated prose",
      },
      "query",
    ),
    null,
  );
  assert.equal(
    normalizeRetrievedSource(
      { url: "javascript:alert(1)", content: body },
      "query",
    ),
    null,
  );
});
