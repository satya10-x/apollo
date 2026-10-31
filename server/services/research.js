import { createOrchestrator } from "./apollo/orchestrator.js";
import { mongoRepository } from "./apollo/repository.js";
import { providers } from "./providers.js";
import { ExecutionStopped } from "./apollo/errors.js";
const run = createOrchestrator({ repository: mongoRepository, providers });
const active = new Map();
export function runResearch(id) {
  const key = String(id);
  if (active.has(key)) return active.get(key).promise;
  const controller = new AbortController();
  const promise = run(key, { signal: controller.signal }).finally(() =>
    active.delete(key),
  );
  active.set(key, { controller, promise });
  return promise;
}
export function cancelResearch(id) {
  active
    .get(String(id))
    ?.controller.abort(
      new ExecutionStopped("cancelled", "Research cancelled by the user."),
    );
}
export async function shutdownResearch() {
  const jobs = [...active.values()];
  jobs.forEach((job) =>
    job.controller.abort(
      new ExecutionStopped(
        "server_shutdown",
        "The server stopped during research. Start a new session to retry.",
      ),
    ),
  );
  await Promise.allSettled(jobs.map((job) => job.promise));
}

export async function waitForResearch(id) {
  const job = active.get(String(id));
  if (job) await job.promise;
}
