require("./intelligence-connectors.test.js");
require("./intelligence-api.test.js");
require("./intelligence-dag.test.js");

const assert = require("node:assert/strict"),
  { createGateway } = require("../server/gateway.js"),
  { execute } = require("../server/agent-engine.js");
(async () => {
  const sentiment = execute("Social Sentiment Scanner", {
    text: "bullish growth strong adoption",
  });
  assert.ok(sentiment.signal > 0.5);
  assert.ok(sentiment.confidence >= 0 && sentiment.confidence <= 1);
  const chain = execute("On-Chain Analyst", {
    history: [10, 11, 9, 10, 12],
    net_flow: 40,
    destination: "exchange",
  });
  assert.ok(chain.signal < 0);
  const anomaly = execute("Anomaly Detector", {
    samples: [40, 41, 39, 40, 42, 39, 41],
    current: 400,
  });
  assert.equal(anomaly.evidence.at(-1), "anomaly=true");
  const gateway = createGateway({
      allowedOrigin: "http://localhost:8080",
      llm: { baseUrl: null },
    }),
    backfillPlan = {
      id: "plan-1",
      mode: "dry-run",
      paperOnly: true,
      missing: 1,
    },
    backfillCalls = [];
  gateway.setDataService({
    planBackfill: async (input) => {
      backfillCalls.push({ operation: "plan", input });
      return backfillPlan;
    },
    executeBackfill: async (plan, approvedBy) => {
      backfillCalls.push({ operation: "execute", plan, approvedBy });
      return { kind: "historical-backfill", state: "staged" };
    },
  });
  const address = await gateway.listen(0),
    base = `http://127.0.0.1:${address.port}`;
  const health = await fetch(base + "/v1/health");
  assert.equal(health.status, 200);
  assert.equal((await health.json()).services.gateway, "ok");
  const denied = await fetch(base + "/v1/health", {
    headers: { origin: "https://evil.example" },
  });
  assert.equal(denied.status, 403);
  const response = await fetch(base + "/v1/agents/execute", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:8080",
    },
    body: JSON.stringify({
      request_id: "test-1",
      agent_id: "Macro News Reader",
      input: {
        prior_bull: 0.5,
        events: [{ bull_likelihood: 0.8 }, { bull_likelihood: 0.7 }],
      },
      policy: { paper_only: true },
    }),
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.ok(result.signal > 0);
  assert.equal(result.agent_id, "Macro News Reader");
  const unsafe = await fetch(base + "/v1/agents/execute", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      agent_id: "Macro News Reader",
      input: {},
      policy: { paper_only: false },
    }),
  });
  assert.equal(unsafe.status, 422);
  const planned = await fetch(base + "/v1/data/backfill/plan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      product: "BTC-USD",
      start: "2026-10-20T00:00:00.000Z",
      end: "2026-10-20T00:01:00.000Z",
      granularity: 60,
    }),
  });
  assert.equal(planned.status, 200);
  assert.deepEqual(await planned.json(), backfillPlan);
  const staged = await fetch(base + "/v1/data/backfill/execute", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ plan: backfillPlan, approvedBy: "Data Operator" }),
  });
  assert.equal(staged.status, 200);
  assert.equal((await staged.json()).state, "staged");
  assert.deepEqual(
    backfillCalls.map((call) => call.operation),
    ["plan", "execute"],
  );
  assert.equal(backfillCalls[1].approvedBy, "Data Operator");
  await gateway.close();
  console.log("gateway tests: ok");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
