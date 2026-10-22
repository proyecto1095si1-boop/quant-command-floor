"use strict";

const assert = require("node:assert/strict"),
  {
    digest,
    openCheckpoint,
    sealCheckpoint,
  } = require("../server/config/checkpoint.js"),
  {
    AiProviderHealth,
    STATES,
    failureCode,
    percentile,
  } = require("../server/ai/provider-health.js"),
  { executeLLM } = require("../server/llm-client.js"),
  { createGateway } = require("../server/gateway.js");

(async () => {
  assert.equal(percentile([30, 10, 20], 0.95), 30);
  assert.equal(percentile([], 0.95), null);
  assert.equal(
    failureCode(new SyntaxError("secret")),
    "provider-invalid-response",
  );
  assert.equal(
    failureCode(Object.assign(new Error("secret"), { name: "AbortError" })),
    "provider-timeout",
  );
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
  assert.equal((await health.acquire()).allowed, true);
  await health.success(25);
  assert.equal(health.status().healthy, true);
  await health.failure(new Error("timeout"), 100);
  await health.failure(new Error("llm-http-503"), 100);
  assert.equal(health.status().state, STATES.OPEN);
  assert.equal((await health.acquire()).reason, "circuit-open");
  now = 1000;
  assert.deepEqual(await health.acquire(), { allowed: true, probe: true });
  assert.equal((await health.acquire()).reason, "half-open-probe-in-flight");
  await health.success(20);
  assert.equal(health.status().state, STATES.CLOSED);
  assert.equal(health.status().healthy, true);

  const slow = new AiProviderHealth({
    configured: true,
    policy: { minSamples: 1, latencyP95Ms: 10 },
  });
  await slow.success(11);
  assert.equal(slow.status().healthy, false);
  assert.equal(slow.status().state, STATES.OPEN);
  assert.equal(slow.status().openReason, "latency-p95");

  const absent = new AiProviderHealth();
  assert.equal((await absent.acquire()).reason, "provider-not-configured");
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

  const checkpoints = [],
    durable = new AiProviderHealth({
      configured: true,
      clock: () => now,
      requireRecovery: true,
      record: async (stream, checkpoint) =>
        checkpoints.push([stream, checkpoint]),
      policy: {
        windowSize: 4,
        minSamples: 2,
        failureRate: 0.5,
        consecutiveFailures: 2,
        latencyP95Ms: 100,
        cooldownMs: 1000,
      },
    });
  assert.equal(
    (await durable.acquire()).reason,
    "provider-health-not-recovered",
  );
  assert.equal(durable.status().healthy, false);
  durable.recover([]);
  await durable.success(20);
  await durable.failure(new Error("secret-token-must-not-leak"), 30);
  assert.equal(checkpoints.length, 2);
  assert.equal(durable.status().recovery.revision, 2);
  assert.equal(checkpoints[0][0], "sre.ai-provider-health");
  assert.equal(
    openCheckpoint(checkpoints[1][1], "ai-provider-health").lastFailure,
    "provider-request-failed",
  );
  const restored = new AiProviderHealth({
      configured: true,
      clock: () => now,
      requireRecovery: true,
      policy: durable.status().policy,
    }),
    recovery = restored.recover(checkpoints.map(([, value]) => value));
  assert.equal(recovery.checkpoints, 2);
  assert.equal(recovery.boundaryTruncated, false);
  assert.equal(restored.status().samples, 2);
  assert.equal(restored.status().lastFailure, "provider-request-failed");
  assert.equal(restored.status().recovery.recovered, true);
  restored.recover([]);
  assert.equal(restored.status().samples, 0);
  assert.equal(restored.status().recovery.revision, 0);
  const truncated = new AiProviderHealth({
    configured: true,
    requireRecovery: true,
    policy: durable.status().policy,
  }).recover([checkpoints[1][1]]);
  assert.equal(truncated.boundaryTruncated, true);
  const currentPrimary = openCheckpoint(
      checkpoints[0][1],
      "ai-provider-health",
    ),
    {
      id: ignoredCurrentId,
      providerId: ignoredProviderId,
      ...legacyBody
    } = currentPrimary;
  void ignoredCurrentId;
  void ignoredProviderId;
  legacyBody.version = 1;
  const legacyCheckpoint = sealCheckpoint("ai-provider-health", {
    id: digest(legacyBody),
    ...legacyBody,
  });
  const legacyPrimary = new AiProviderHealth({
    configured: true,
    providerId: "primary",
    requireRecovery: true,
    policy: durable.status().policy,
  });
  assert.equal(legacyPrimary.recover([legacyCheckpoint]).checkpoints, 1);
  assert.throws(
    () =>
      new AiProviderHealth({
        configured: true,
        providerId: "secondary",
        requireRecovery: true,
        policy: durable.status().policy,
      }).recover([legacyCheckpoint]),
    /invalid-ai-provider-health-checkpoint/,
  );
  const tampered = openCheckpoint(checkpoints[1][1], "ai-provider-health");
  tampered.previousId = "broken-chain";
  assert.throws(
    () =>
      new AiProviderHealth({
        configured: true,
        requireRecovery: true,
        policy: durable.status().policy,
      }).recover([
        checkpoints[0][1],
        sealCheckpoint("ai-provider-health", tampered),
      ]),
    /invalid-ai-provider-health-checkpoint/,
  );
  assert.throws(
    () =>
      new AiProviderHealth({
        configured: true,
        requireRecovery: true,
        policy: { ...durable.status().policy, latencyP95Ms: 101 },
      }).recover(checkpoints.map(([, value]) => value)),
    /invalid-ai-provider-health-checkpoint/,
  );
  const unavailableStorage = new AiProviderHealth({
    configured: true,
    record: async () => {
      throw new Error("disk-secret-must-not-leak");
    },
  });
  await assert.rejects(
    () => unavailableStorage.success(20),
    /provider-health-persistence-failed/,
  );
  assert.equal(unavailableStorage.status().recovery.recovered, false);
  const failingPersistence = new AiProviderHealth({
    configured: true,
    record: async () => {
      throw new Error("disk-error");
    },
  });
  await assert.rejects(
    () =>
      executeLLM(
        {
          agent_id: "Macro News Reader",
          input: {},
          policy: { timeout_ms: 1000 },
        },
        {
          baseUrl: "http://localhost:11434/v1",
          providerHealth: failingPersistence,
          fetcher: async () => ({
            ok: true,
            json: async () => ({
              choices: [
                {
                  message: {
                    content: '{"signal":0,"confidence":0,"evidence":[]}',
                  },
                },
              ],
            }),
          }),
        },
      ),
    (error) =>
      error.message === "provider-health-persistence-failed" &&
      error.providerUnavailable === true,
  );

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
