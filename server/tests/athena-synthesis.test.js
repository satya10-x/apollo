import test from "node:test";
import assert from "node:assert/strict";
import { researchTask } from "../services/agents/athena.js";
import { ProviderError } from "../services/provider-errors.js";

test("Athena shrinks oversized requests without losing citation validation", async () => {
  const counts = [];
  const evidence = Array.from({ length: 6 }, (_, i) => ({
    _id: `e${i}`,
    source: `s${i}`,
    passage: `Retrieved evidence ${i}`,
    taskIds: ["t"],
  }));
  const sources = evidence.map((e) => ({
    _id: e.source,
    title: "Source",
    url: "https://example.org",
  }));
  const providers = {
    generateJSON: async (options) => {
      counts.push(options.input.evidence.length);
      if (options.input.evidence.length > 1)
        throw new ProviderError(
          "groq",
          "provider_request_too_large",
          "HTTP 413.",
          { httpStatus: 413 },
        );
      const e = options.input.evidence[0];
      const data = {
        summary: "Evidence summary",
        claims: [
          {
            statement: "Supported finding",
            sourceIds: [e.sourceId],
            evidenceIds: [e.evidenceId],
          },
        ],
        limitations: [],
      };
      options.validate(data);
      assert.throws(() =>
        options.validate({
          ...data,
          claims: [
            {
              statement: "Wrong citation",
              sourceIds: ["unknown"],
              evidenceIds: ["unknown"],
            },
          ],
        }),
      );
      return { data };
    },
  };
  const result = await researchTask({
    task: { id: "t" },
    sources,
    evidence,
    providers,
    budget: { state: { mode: "standard" } },
  });
  assert.deepEqual(counts, [6, 3, 1]);
  assert.deepEqual(result.data.claims[0].evidenceIds, ["e0"]);
});
