import test from "node:test";
import assert from "node:assert/strict";
import { buildEvidence, validateCitations } from "../services/evidence.js";

test("evidence context has a bounded excerpt budget and stable reference numbers", () => {
  const sources = Array.from({ length: 100 }, (_, i) => ({
    title: `Source ${i}`,
    url: `https://example.org/${i}`,
    content: "a".repeat(7000),
  }));
  const evidence = buildEvidence(sources);
  assert.equal(evidence.length, 100);
  assert.equal(evidence[99].number, 100);
  assert.equal(evidence[99].url, sources[99].url);
  assert.ok(
    evidence.reduce((total, s) => total + s.content.length, 0) <= 70000,
  );
  assert.deepEqual(buildEvidence([]), []);
});
test("reports require citations in the summary and every section", () => {
  assert.throws(
    () =>
      validateCitations(
        {
          summary: "Unsupported statement",
          sections: [{ body: "A sourced claim [1]." }],
        },
        1,
      ),
    /omitted/,
  );
  assert.throws(
    () =>
      validateCitations(
        {
          summary: "A sourced summary [1].",
          sections: [{ body: "Unsupported statement" }],
        },
        1,
      ),
    /omitted/,
  );
});
test("reports reject nonexistent source references", () => {
  for (const citation of ["[0]", "[3]"])
    assert.throws(
      () =>
        validateCitations(
          {
            summary: `A claim ${citation}`,
            sections: [{ body: "A supported section [1]." }],
          },
          2,
        ),
      /invalid/,
    );
  assert.doesNotThrow(() =>
    validateCitations(
      { summary: "A claim [2].", sections: [{ body: "Another claim [1]." }] },
      2,
    ),
  );
});
