"use strict";

const assert = require("node:assert/strict"),
  { AiCostLedger, dayKey, tokenCount } = require("../server/ai/cost-ledger.js"),
  { AiProviderHealth } = require("../server/ai/provider-health.js"),
  { AiProviderPool } = require("../server/ai/provider-pool.js");

(async () => {
  assert.equal(dayKey(Date.parse("2026-10-22T23:59:00Z")), "2026-10-22");
  assert.equal(tokenCount({ totalTokens: 12, reported: true }, 50), 12);
  assert.equal(tokenCount({ totalTokens: 0, reported: false }, 50), 50);
  assert.throws(() => new AiCostLedger({ policy: { providerDailyUsd: 0 } }));
  let now = Date.parse("2026-10-22T12:00:00Z");
  const written = [],
    ledger = new AiCostLedger({
      clock: () => now,
      requireRecovery: true,
      record: async (stream, event) => written.push([stream, event]),
      policy: {
        providerDailyUsd: 0.001,
        agentDailyUsd: 0.001,
        estimatedTokens: 100,
      },
    });
  assert.equal(
    ledger.authorize({
      providerId: "primary",
      agentId: "Macro",
      costPer1kTokens: 0.002,
    }).reason,
    "cost-ledger-not-recovered",
  );
  ledger.recover([]);
  const reservation = ledger.authorize({
    providerId: "primary",
    agentId: "Macro",
    costPer1kTokens: 0.002,
    estimatedTokens: 150,
  });
  assert.equal(reservation.allowed, true);
  assert.deepEqual(
    await ledger.settle(reservation.reservationId, {
      totalTokens: 150,
      reported: true,
    }),
    { tokens: 150, cost: "0.00030000", estimated: false },
  );
  assert.equal(written[0][0], "sre.ai-cost-ledger");
  assert.equal(ledger.status().providers.primary.remaining, "0.00070000");
  assert.equal(ledger.status().agents.Macro.tokens, 150);
  assert.equal(
    ledger.authorize({
      providerId: "primary",
      agentId: "Macro",
      costPer1kTokens: 0.002,
      estimatedTokens: 400,
    }).reason,
    "provider-daily-budget",
  );
  const restored = new AiCostLedger({
    clock: () => now,
    requireRecovery: true,
    policy: ledger.status().policy,
  });
  restored.recover(written.map(([, event]) => event));
  assert.equal(restored.status().providers.primary.cost, "0.00030000");
  now = Date.parse("2026-10-23T00:00:01Z");
  assert.deepEqual(restored.status().providers, {});
  assert.equal(restored.status().day, "2026-10-23");

  const integratedLedger = new AiCostLedger({
      policy: { providerDailyUsd: 1, agentDailyUsd: 1, estimatedTokens: 100 },
    }),
    integratedHealth = new AiProviderHealth({
      configured: true,
      providerId: "primary",
    });
  integratedLedger.recover([]);
  integratedHealth.recover([]);
  const pool = new AiProviderPool({
    costLedger: integratedLedger,
    providers: [
      {
        id: "primary",
        baseUrl: "https://provider.example/v1",
        health: integratedHealth,
        costPer1kTokens: 0.01,
        fetcher: async () => ({
          ok: true,
          json: async () => ({
            usage: {
              prompt_tokens: 80,
              completion_tokens: 20,
              total_tokens: 100,
            },
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
    ],
  });
  pool.recover({ primary: [] });
  const result = await pool.execute({
    agent_id: "Macro News Reader",
    input: {},
    policy: { paper_only: true },
  });
  assert.deepEqual(result.cost, {
    tokens: 100,
    cost: "0.00100000",
    estimated: false,
  });
  assert.equal(
    integratedLedger.status().agents["Macro News Reader"].cost,
    "0.00100000",
  );
  console.log("AI cost ledger tests: ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
