"use strict";

const assert = require("node:assert/strict"),
  {
    IntelligenceDag,
    pointInTime,
    reconcileMarketRows,
  } = require("../server/intelligence/dag.js"),
  { DeskRegistry } = require("../server/desks/registry.js");

(async () => {
  const now = Date.parse("2026-01-31T23:00:00Z"),
    calls = [],
    recorded = [],
    service = {
      query: async ({ provider, operation, params }) => {
        calls.push({ provider, operation, params });
        if (provider === "fred")
          return {
            data: Array.from({ length: 13 }, (_, index) => ({
              source: "fred",
              date: `2025-${String(index + 1).padStart(2, "0")}-01`,
              value: 100 + index,
              receivedAt: now - 1000,
            })),
          };
        if (["polygon", "yahoo"].includes(provider))
          return {
            data: Array.from({ length: 30 }, (_, index) => ({
              source: provider,
              timestamp: now - (29 - index) * 86400000,
              close: 100 + index,
              receivedAt: now - 1000,
            })),
          };
        return {
          data: [
            {
              source: provider,
              headline: "Bullish adoption surge",
              publishedAt: now - 3600000,
              receivedAt: now - 1000,
            },
            {
              source: provider,
              headline: "Future fake headline",
              publishedAt: now + 3600000,
              receivedAt: now - 1000,
            },
          ],
        };
      },
    },
    dag = new IntelligenceDag({
      service,
      clock: () => now,
      record: async (stream, event) => recorded.push({ stream, event }),
    }),
    snapshot = await dag.refresh("btc", { asOf: now });

  assert.equal(calls.length, 5);
  assert.equal(snapshot.provenance.length, 5);
  assert.equal(
    snapshot.nodes.find((node) => node.id === "market").observations,
    30,
  );
  assert.equal(snapshot.asset, "BTC");
  assert.equal(snapshot.paperOnly, true);
  assert.equal(snapshot.consensus.status, "ready");
  assert.deepEqual(snapshot.consensus.activeSources, [
    "macro",
    "news",
    "market",
  ]);
  assert.ok(snapshot.consensus.signal > 0);
  assert.ok(snapshot.consensus.confidence > 0);
  assert.equal(
    snapshot.nodes.find((node) => node.id === "news").observations,
    2,
  );
  assert.match(snapshot.hash, /^[a-f0-9]{64}$/);
  assert.equal(dag.snapshot("BTC", now - 1), null);
  assert.equal(dag.snapshot("BTC", now).hash, snapshot.hash);
  assert.equal(dag.snapshot("BTC", now + 6 * 60 * 60 * 1000 + 1), null);
  assert.equal(dag.status().assets.BTC.status, "ready");
  assert.equal(recorded[0].stream, "intelligence.BTC");
  assert.equal(recorded[0].event.hash, snapshot.hash);
  await assert.rejects(
    dag.refresh("BTC", { asOf: now + 1 }),
    /invalid-intelligence-as-of/,
  );

  const recoveredDag = new IntelligenceDag({ service, clock: () => now }),
    recovery = recoveredDag.recover({ BTC: [snapshot] });
  assert.deepEqual(recovery, { recovered: true, snapshots: 1, assets: 1 });
  assert.equal(recoveredDag.snapshot("BTC", now).hash, snapshot.hash);
  assert.equal(recoveredDag.status().recovery.recovered, true);
  const tampered = structuredClone(snapshot);
  tampered.consensus.signal = -0.99;
  assert.throws(
    () => recoveredDag.recover({ BTC: [tampered] }),
    /invalid-intelligence-snapshot/,
  );
  assert.equal(
    recoveredDag.snapshot("BTC", now).hash,
    snapshot.hash,
    "failed recovery preserves the last verified atomic state",
  );
  assert.throws(
    () => recoveredDag.recover({ BTC: [snapshot, snapshot] }),
    /invalid-intelligence-snapshot-sequence/,
  );

  assert.equal(
    pointInTime(
      [
        { publishedAt: now - 1, receivedAt: now - 1 },
        { publishedAt: now + 1, receivedAt: now - 1 },
        { publishedAt: now - 1, receivedAt: now + 1 },
      ],
      now,
      1000,
    ).length,
    1,
  );
  assert.deepEqual(
    reconcileMarketRows([
      { source: "polygon", timestamp: 1, close: 100, receivedAt: 3 },
      { source: "yahoo", timestamp: 1, close: 102, receivedAt: 4 },
    ])[0],
    {
      source: "market-consensus",
      sources: ["polygon", "yahoo"],
      timestamp: 1,
      close: 101,
      receivedAt: 4,
    },
  );

  const blocked = new IntelligenceDag({
      service: {
        query: async ({ provider }) => {
          if (!new Set(["polygon", "yahoo"]).has(provider))
            throw new Error("provider-down");
          return service.query({
            provider,
            operation: provider === "polygon" ? "aggregates" : "chart",
            params: {},
          });
        },
      },
      clock: () => now,
    }),
    blockedSnapshot = await blocked.refresh("ETH", { asOf: now });
  assert.equal(blockedSnapshot.consensus.status, "blocked");
  assert.equal(blockedSnapshot.consensus.signal, 0);
  assert.equal(blockedSnapshot.consensus.confidence, 0);

  const desk = new DeskRegistry().analyze("BTC", {
    candles: Array.from({ length: 60 }, (_, index) => ({
      open: 100 + index,
      high: 102 + index,
      low: 99 + index,
      close: 101 + index,
      volume: 100,
    })),
    trades: Array.from({ length: 20 }, (_, index) => ({
      price: 160,
      size: 1,
      side: index % 2 ? "buy" : "sell",
    })),
    book: {
      bids: [{ price: 159, size: 10 }],
      asks: [{ price: 161, size: 10 }],
      spreadBps: 2,
    },
    quality: { status: "healthy" },
    intelligence: snapshot,
  });
  const intelAgent = desk.agents.find((agent) => agent.agent === "Intel Hub");
  assert.equal(intelAgent.metrics.snapshotHash, snapshot.hash);
  assert.equal(intelAgent.signal, snapshot.consensus.signal);
  assert.equal(desk.inputSummary.intelligence, "ready");

  console.log("intelligence DAG tests: ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
