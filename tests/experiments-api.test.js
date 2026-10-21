"use strict";

const assert = require("node:assert/strict"),
  { createGateway } = require("../server/gateway.js");

(async () => {
  const calls = [],
    experiments = {
      list: () => ({ paperOnly: true, experiments: [] }),
      start: async (input, actor) => {
        calls.push(["start", actor, input]);
        return { id: "experiment-1", state: "running" };
      },
      assign: (id, requestId) => ({
        paperOnly: true,
        experimentId: id,
        requestId,
        selectedVersion: "1",
      }),
      observe: async (id) => ({ id, summary: { observations: 1 } }),
      observeForecast: async (id) => ({
        id,
        sequential: { overall: { observations: 1 } },
      }),
      stop: async (id, actor, reason) => {
        calls.push(["stop", actor, reason]);
        return { id, state: "stopped" };
      },
      graduate: async (id, actor, reason) => ({
        paperOnly: true,
        artifact: { experimentId: id, graduatedBy: actor, reason },
      }),
    },
    gateway = createGateway({ experiments }),
    address = await gateway.listen(0),
    base = `http://127.0.0.1:${address.port}`,
    request = async (path, body, headers = {}) => {
      const response = await fetch(`${base}${path}`, {
        method: body ? "POST" : "GET",
        headers: { "content-type": "application/json", ...headers },
        body: body ? JSON.stringify(body) : undefined,
      });
      assert.equal(response.status, 200);
      return response.json();
    };
  assert.equal((await request("/v1/governance/experiments")).paperOnly, true);
  const started = await request("/v1/governance/experiments/start", {
    modelId: "risk",
    challengerVersion: "2",
  });
  assert.equal(started.state, "running");
  const assigned = await request("/v1/governance/experiments/assign", {
    experimentId: started.id,
    requestId: "request-1",
  });
  assert.equal(assigned.paperOnly, true);
  const observed = await request("/v1/governance/experiments/observe", {
    experimentId: started.id,
  });
  assert.equal(observed.summary.observations, 1);
  const forecast = await request("/v1/governance/experiments/forecast", {
    experimentId: started.id,
  });
  assert.equal(forecast.sequential.overall.observations, 1);
  const graduated = await request(
    "/v1/governance/experiments/graduate",
    {
      experimentId: started.id,
      reason: "evidence-complete",
    },
    { "x-second-approver": "risk-reviewer" },
  );
  assert.equal(graduated.paperOnly, true);
  const stopped = await request("/v1/governance/experiments/stop", {
    experimentId: started.id,
    reason: "done",
  });
  assert.equal(stopped.state, "stopped");
  assert.equal(calls[0][1], "local-development");
  await gateway.close();
  console.log("experiments API tests: ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
