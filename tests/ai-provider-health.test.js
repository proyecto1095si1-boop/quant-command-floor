"use strict";

const assert = require("node:assert/strict"),
  {
    AiProviderHealth,
    STATES,
    percentile,
  } = require("../server/ai/provider-health.js"),
  { executeLLM } = require("../server/llm-client.js"),
  { createGateway } = require("../server/gateway.js");

(async () => {
  assert.equal(percentile([30, 10, 20], 0.95), 30);
  assert.equal(percentile([], 0.95), null);
  assert.throws(
    () => new AiProviderHealth({ policy: { failureRate: 2 } }),
    /invalid-ai-provider-health-policy/,
  );

  let now = 0;
  const health = new AiProviderHealth({
    configured: true,
    clock: () => now,
    policy: {
      windowSize: 4,
      minSamples: 2,
      failureRate: 0.5,
      consecutiveFailures: 2,
      latencyP95Ms: 100,
      cooldownMs: 1000,
    },
  });
  assert.equal(health.status().healthy, false);
  assert.equal(health.acquire().allowed, true);
  health.success(25);
  assert.equal(health.status().healthy, true);
  health.failure(new Error("timeout"), 100);
  health.failure(new Error("llm-http-503"), 100);
  assert.equal(health.status().state, STATES.OPEN);
  assert.equal(health.acquire().reason, "circuit-open");
  now = 1000;
  assert.deepEqual(health.acquire(), { allowed: true, probe: true });
  assert.equal(health.acquire().reason, "half-open-probe-in-flight");
  health.success(20);
  assert.equal(health.status().state, STATES.CLOSED);
  assert.equal(health.status().healthy, true);

  const slow = new AiProviderHealth({
    configured: true,
    policy: { minSamples: 1, latencyP95Ms: 10 },
  });
  slow.success(11);
  assert.equal(slow.status().healthy, false);

  const absent = new AiProviderHealth();
  assert.equal(absent.acquire().reason, "provider-not-configured");
  assert.equal(absent.status().healthy, false);

  let requestClock = 10;
  const observed = new AiProviderHealth({ configured: true });
  await executeLLM(
    {
      agent_id: "Macro News Reader",
      input: { headline: "CPI" },
      policy: { timeout_ms: 1000 },
    },
    {
      baseUrl: "http://localhost:11434/v1",
      providerHealth: observed,
      clock: () => requestClock,
      fetcher: async () => {
        requestClock = 35;
        return {
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  content: '{"signal":0.1,"confidence":0.6,"evidence":["CPI"]}',
                },
              },
            ],
          }),
        };
      },
    },
  );
  assert.equal(observed.status().p95LatencyMs, 25);

  const gatewayHealth = new AiProviderHealth({
      configured: true,
      policy: { minSamples: 1, consecutiveFailures: 1 },
    }),
    gateway = createGateway({
      aiProviderHealth: gatewayHealth,
      llm: {
        baseUrl: "http://localhost:11434/v1",
        fetcher: async () => ({ ok: false, status: 503 }),
      },
    }),
    address = await gateway.listen(0),
    base = `http://127.0.0.1:${address.port}`,
    response = await fetch(base + "/v1/agents/execute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        request_id: "fallback-1",
        agent_id: "Macro News Reader",
        input: { prior_bull: 0.5, events: [] },
        policy: { paper_only: true },
      }),
    }),
    fallback = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(fallback.fallback, {
    used: true,
    engine: "local-math",
    reason: "llm-http-503",
  });
  assert.equal(fallback.version, "local-math-1.0.0");
  const healthResponse = await fetch(base + "/v1/ai/provider-health"),
    healthBody = await healthResponse.json();
  assert.equal(healthResponse.status, 200);
  assert.equal(healthBody.state, STATES.OPEN);
  assert.equal(healthBody.lastFailure, "llm-http-503");
  assert.equal(JSON.stringify(healthBody).includes("apiKey"), false);
  await gateway.close();

  console.log("AI provider health tests: ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
