import test from "node:test";
import assert from "node:assert/strict";
import { ResearchSession } from "../models/index.js";
import { cancel } from "../controllers/sessions.js";
import { events } from "../services/events.js";
const id = "000000000000000000000001";
test("cancel atomically terminates only queued/running sessions and publishes the snapshot", async (t) => {
  let captured, published, body;
  t.mock.method(ResearchSession, "findOneAndUpdate", async (filter, update) => {
    captured = { filter, update };
    return { _id: id, id, status: "cancelled", cancelRequested: true };
  });
  const listener = (value) => {
    published = value;
  };
  events.once(id, listener);
  t.after(() => events.off(id, listener));
  await cancel(
    { params: { id } },
    {
      json(value) {
        body = value;
      },
    },
  );
  assert.deepEqual(captured.filter.status, { $in: ["queued", "running"] });
  assert.equal(captured.update.$set.cancelRequested, true);
  assert.equal(captured.update.$set.status, "cancelled");
  assert.equal(body.session.status, "cancelled");
  assert.equal(published.status, "cancelled");
});
test("cancelling an already cancelled session is idempotent", async (t) => {
  t.mock.method(ResearchSession, "findOneAndUpdate", async () => null);
  t.mock.method(ResearchSession, "findById", async () => ({
    _id: id,
    status: "cancelled",
  }));
  let body;
  await cancel(
    { params: { id } },
    {
      json(value) {
        body = value;
      },
    },
  );
  assert.equal(body.session.status, "cancelled");
});
test("completed sessions reject cancellation and missing sessions return 404", async (t) => {
  t.mock.method(ResearchSession, "findOneAndUpdate", async () => null);
  const lookup = t.mock.method(ResearchSession, "findById", async () => ({
    _id: id,
    status: "completed",
  }));
  await assert.rejects(cancel({ params: { id } }, { json() {} }), {
    status: 409,
  });
  lookup.mock.mockImplementation(async () => null);
  await assert.rejects(cancel({ params: { id } }, { json() {} }), {
    status: 404,
  });
});
