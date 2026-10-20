"use strict";

const assert = require("node:assert/strict"),
  { createGateway } = require("../server/gateway.js");

(async () => {
  const calls = [],
    aiEvaluation = {
      status: () => ({ paperOnly: true, datasets: 1, runs: 0 }),
      registerDataset: async (input, actor) => {
        calls.push(["dataset", actor, input]);
        return { datasetId: input.datasetId, hash: "a".repeat(64) };
      },
      run: async (input, actor) => {
        calls.push(["run", actor, input]);
        return { paperOnly: true, eligible: true, score: 1 };
      },
    },
    gateway = createGateway({ aiEvaluation }),
    address = await gateway.listen(0),
    base = `http://127.0.0.1:${address.port}`,
    status = await fetch(`${base}/v1/governance/ai-evaluation`);
  assert.equal((await status.json()).paperOnly, true);
  const dataset = await fetch(`${base}/v1/governance/ai-evaluation/datasets`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ datasetId: "suite", version: "1", cases: [] }),
  });
  assert.equal(dataset.status, 200);
  assert.equal((await dataset.json()).datasetId, "suite");
  const run = await fetch(`${base}/v1/governance/ai-evaluation/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ modelId: "agent", version: "2" }),
  });
  assert.equal(run.status, 200);
  assert.equal((await run.json()).eligible, true);
  assert.equal(calls[0][1], "local-development");
  await gateway.close();
  console.log("AI evaluation API tests: ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
