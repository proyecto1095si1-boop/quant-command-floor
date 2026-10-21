"use strict";

const assert = require("node:assert/strict"),
  {
    OutcomeOracle,
    validateArtifact,
    validateResolution,
  } = require("../server/governance/outcome-oracle.js"),
  { MarketDataService } = require("../server/data/service.js");

(async () => {
  let now = Date.parse("2026-01-01T00:00:00.000Z"),
    mode = "healthy";
  const provider = {
      pointInTimeQuotes: async (symbol, targetAt, phase) => {
        const target = Date.parse(targetAt),
          time = new Date(
            mode === "stale" ? target - 31_000 : target,
          ).toISOString(),
          base = phase === "anchor" ? 100 : 101,
          rows = [
            {
              source: "coinbase",
              symbol,
              price: base,
              exchangeAt: time,
              receivedAt: time,
            },
            {
              source: "kraken",
              symbol,
              price: mode === "divergent" ? base * 1.02 : base + 0.01,
              exchangeAt: time,
              receivedAt: time,
            },
          ];
        return mode === "single" ? rows.slice(0, 1) : rows;
      },
    },
    oracle = new OutcomeOracle({
      provider,
      clock: () => now,
      policy: { finalityDelayMs: 100 },
    }),
    predictedAt = new Date(now).toISOString(),
    maturesAt = new Date(now + 1_000).toISOString(),
    anchor = await oracle.anchor({
      requestKey: "hashed-request",
      symbol: "BTC-USD",
      predictedAt,
      maturesAt,
      thresholdBps: 50,
    }),
    forecast = {
      requestKey: "hashed-request",
      symbol: "BTC-USD",
      maturesAt,
      oracleAnchor: anchor,
    };
  assert.equal(validateArtifact(anchor, "anchor", oracle.policy), true);
  assert.equal(anchor.consensus.sources, 2);
  assert.equal(anchor.consensus.price, 100.005);
  await assert.rejects(
    () => oracle.resolve(forecast),
    /oracle-outcome-not-final/,
  );

  now += 1_100;
  const resolution = await oracle.resolve(forecast);
  assert.equal(resolution.outcome, 1);
  assert.ok(resolution.returnBps > 50);
  assert.equal(validateResolution(anchor, resolution, oracle.policy), true);
  const tampered = structuredClone(resolution);
  tampered.outcome = 0;
  assert.equal(validateResolution(anchor, tampered, oracle.policy), false);

  mode = "single";
  await assert.rejects(
    () => oracle.anchor({ symbol: "BTC-USD", predictedAt, maturesAt }),
    /insufficient-oracle-sources/,
  );
  mode = "divergent";
  await assert.rejects(
    () => oracle.anchor({ symbol: "BTC-USD", predictedAt, maturesAt }),
    /oracle-source-divergence/,
  );
  mode = "stale";
  await assert.rejects(
    () => oracle.anchor({ symbol: "BTC-USD", predictedAt, maturesAt }),
    /invalid-oracle-anchor-window/,
  );

  const rows = {
      "ticker.BTC-USD": [
        {
          source: "coinbase",
          symbol: "BTC-USD",
          price: 100,
          receivedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          source: "coinbase",
          symbol: "BTC-USD",
          price: 101,
          receivedAt: "2026-01-01T00:01:00.000Z",
        },
      ],
      "ticker.kraken.BTC-USD": [
        {
          source: "kraken",
          symbol: "BTC-USD",
          price: 100.01,
          receivedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          source: "kraken",
          symbol: "BTC-USD",
          price: 101.01,
          receivedAt: "2026-01-01T00:01:00.000Z",
        },
      ],
    },
    data = new MarketDataService({
      connector: { health: () => ({ status: "stopped" }) },
      secondary: null,
      store: { tail: async (stream) => rows[stream] || [] },
    });
  const before = await data.pointInTimeQuotes(
      "BTC-USD",
      "2026-01-01T00:00:30.000Z",
      "anchor",
      { sources: ["coinbase", "kraken"], maxStalenessMs: 30_000 },
    ),
    after = await data.pointInTimeQuotes(
      "BTC-USD",
      "2026-01-01T00:00:30.000Z",
      "close",
      { sources: ["coinbase", "kraken"], maxOutcomeLagMs: 30_000 },
    );
  assert.deepEqual(
    before.map((row) => row.price),
    [100, 100.01],
  );
  assert.deepEqual(
    after.map((row) => row.price),
    [101, 101.01],
  );
  console.log("outcome oracle tests: ok");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
