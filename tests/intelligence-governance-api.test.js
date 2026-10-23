"use strict";

const assert = require("node:assert/strict"),
  { createGateway } = require("../server/gateway.js");

(async () => {
  const calls = [],
    intelligenceGovernance = {
      status: () => ({ paperOnly: true, ready: true }),
      registerDataset: async (input, actor) => {
        calls.push(["dataset", input, actor]);
        return { paperOnly: true, datasetId: input.datasetId };
      },
      evaluate: async (input, actor) => {
        calls.push(["evaluate", input, actor]);
        return { paperOnly: true, id: "intel-run-1", eligible: true };
      },
      approveExperiment: async (input, approvals, actor) => {
        calls.push(["approve", input, approvals, actor]);
        return { paperOnly: true, experiment: { mode: "shadow" } };
      },
    },
    gateway = createGateway({ intelligenceGovernance }),
    address = await gateway.listen(0),
    base = `http://127.0.0.1:${address.port}`,
    request = async (path, payload, headers = {}) => {
      const response = await fetch(base + path, {
        method: payload ? "POST" : "GET",
        headers: payload
          ? { "content-type": "application/json", ...headers }
          : headers,
        body: payload ? JSON.stringify(payload) : undefined,
      });
      assert.equal(response.status, 200);
      return response.json();
    };
  try {
    assert.equal((await request("/v1/governance/intelligence")).ready, true);
    await request("/v1/governance/intelligence/datasets", {
      datasetId: "signed-intel-1",
    });
    await request("/v1/governance/intelligence/evaluate", {
      datasetId: "signed-intel-1",
    });
    const approved = await request(
      "/v1/governance/intelligence/approve-experiment",
      { runId: "intel-run-1", mode: "shadow" },
      { "x-second-approver": "risk-reviewer" },
    );
    assert.equal(approved.experiment.mode, "shadow");
    assert.deepEqual(
      calls.map(([name]) => name),
      ["dataset", "evaluate", "approve"],
    );
    assert.equal(calls[2][2].secondary, "risk-reviewer");
    assert.notEqual(calls[2][2].primary, calls[2][2].secondary);
  } finally {
    await gateway.close();
  }
  console.log("intelligence governance API tests: ok");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
