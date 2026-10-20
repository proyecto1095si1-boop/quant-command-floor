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
    address = await gateway.listen(0),
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
  await gateway.close();
  console.log("gateway tests: ok");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
