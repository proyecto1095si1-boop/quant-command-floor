"use strict";

const assert = require("node:assert/strict"),
  { AiProviderHealth } = require("../server/ai/provider-health.js"),
  { AiProviderPool } = require("../server/ai/provider-pool.js"),
  { createGateway } = require("../server/gateway.js");

function health(id, options = {}) {
  const instance = new AiProviderHealth({
    configured: options.configured !== false,
    providerId: id,
    requireRecovery: true,
    policy: {
      windowSize: 4,
      minSamples: 2,
      failureRate: 0.5,
      consecutiveFailures: 2,
      latencyP95Ms: 100,
      cooldownMs: 1000,
    },
  });
  return instance;
}

function payload() {
  return {
    request_id: "pool-test",
    agent_id: "Macro News Reader",
    input: { headline: "CPI" },
    policy: { paper_only: true, timeout_ms: 1000 },
  };
}

function response(signal = 0.2) {
  return {
    ok: true,
    json: async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              signal,
              confidence: 0.7,
              evidence: ["CPI"],
            }),
          },
        },
      ],
    }),
  };
}

(async () => {
  assert.throws(() => new AiProviderPool({ policy: { maxAttempts: 0 } }));
  assert.throws(
    () => new AiProviderPool({ providers: [{ id: "broken" }] }),
    /invalid-ai-provider-pool-entry/,
  );

  const primaryHealth = health("primary"),
    secondaryHealth = health("secondary"),
    calls = [];
  const pool = new AiProviderPool({
    providers: [
      {
        id: "primary",
        baseUrl: "https://primary.example/v1",
        health: primaryHealth,
        priority: 0,
        costPer1kTokens: 0,
        fetcher: async () => {
          calls.push("primary");
          return { ok: false, status: 503 };
        },
      },
      {
        id: "secondary",
        baseUrl: "https://secondary.example/v1",
        health: secondaryHealth,
        priority: 1,
        costPer1kTokens: 0,
        fetcher: async () => {
          calls.push("secondary");
          return response(0.4);
        },
      },
    ],
    policy: { maxAttempts: 2, maxRequestsPerMinute: 10 },
  });
  assert.equal(pool.status().healthy, false);
  await assert.rejects(() => pool.execute(payload()), /pool-exhausted/);
  pool.recover({ primary: [], secondary: [] });
  const routed = await pool.execute(payload());
  assert.deepEqual(calls, ["primary", "secondary"]);
  assert.equal(routed.provider, "secondary");
  assert.equal(routed.routing.attempts, 2);
  assert.equal(routed.signal, 0.4);
  assert.equal(primaryHealth.status().failures, 1);
  assert.equal(secondaryHealth.status().successes, 1);
  const status = pool.status();
  assert.equal(status.healthy, true);
  assert.equal(status.providers[0].totals.failures, 1);
  assert.equal(status.providers[1].totals.successes, 1);
  assert.equal(JSON.stringify(status).includes("primary.example"), false);

  const cheapHealth = health("cheap"),
    expensiveHealth = health("expensive"),
    selected = [];
  const costPool = new AiProviderPool({
    providers: [
      {
        id: "expensive",
        baseUrl: "https://expensive.example/v1",
        health: expensiveHealth,
        costPer1kTokens: 10,
        fetcher: async () => {
          selected.push("expensive");
          return response();
        },
      },
      {
        id: "cheap",
        baseUrl: "https://cheap.example/v1",
        health: cheapHealth,
        costPer1kTokens: 0.1,
        fetcher: async () => {
          selected.push("cheap");
          return response();
        },
      },
    ],
  });
  costPool.recover({ cheap: [], expensive: [] });
  assert.equal((await costPool.execute(payload())).provider, "cheap");
  assert.deepEqual(selected, ["cheap"]);
  const gateway = createGateway({ aiProviderPool: costPool }),
    address = await gateway.listen(0),
    base = `http://127.0.0.1:${address.port}`,
    gatewayResponse = await fetch(base + "/v1/agents/execute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload()),
    }),
    gatewayResult = await gatewayResponse.json();
  assert.equal(gatewayResponse.status, 200);
  assert.equal(gatewayResult.provider, "cheap");
  const gatewayStatus = await fetch(base + "/v1/ai/provider-health");
  assert.equal(gatewayStatus.status, 200);
  assert.equal((await gatewayStatus.json()).providers.length, 2);
  await gateway.close();

  let budgetCalls = 0;
  const budgetHealth = health("budget"),
    budgetPool = new AiProviderPool({
      providers: [
        {
          id: "budget",
          baseUrl: "https://budget.example/v1",
          health: budgetHealth,
          fetcher: async () => {
            budgetCalls++;
            return response();
          },
        },
      ],
      policy: { maxRequestsPerMinute: 1 },
    });
  budgetPool.recover({ budget: [] });
  await budgetPool.execute(payload());
  await assert.rejects(() => budgetPool.execute(payload()), /pool-exhausted/);
  assert.equal(budgetCalls, 1);

  let release;
  const bulkheadHealth = health("bulkhead"),
    bulkheadPool = new AiProviderPool({
      providers: [
        {
          id: "bulkhead",
          baseUrl: "https://bulkhead.example/v1",
          health: bulkheadHealth,
          maxConcurrent: 1,
          fetcher: () =>
            new Promise((resolve) => {
              release = () => resolve(response());
            }),
        },
      ],
    });
  bulkheadPool.recover({ bulkhead: [] });
  const pending = bulkheadPool.execute(payload());
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(() => bulkheadPool.execute(payload()), /pool-exhausted/);
  assert.equal(bulkheadPool.status().providers[0].inFlight, 1);
  release();
  await pending;
  assert.equal(bulkheadPool.status().providers[0].inFlight, 0);

  console.log("AI provider pool tests: ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
