const assert = require("node:assert/strict"),
  { DeskRegistry } = require("../server/desks/registry.js");
require("./consensus.test.js");
function candles(n = 120) {
  let p = 100;
  return Array.from({ length: n }, (_, i) => {
    const open = p;
    p += 0.25 + Math.sin(i / 4) * 0.15;
    return {
      open,
      high: Math.max(open, p) + 0.2,
      low: Math.min(open, p) - 0.2,
      close: p,
      volume: 100 + i * 2,
      openTime: new Date(1792440000000 + i * 300000).toISOString(),
    };
  });
}
function trades(n = 100) {
  return Array.from({ length: n }, (_, i) => ({
    tradeId: String(i + 1),
    price: 100 + i * 0.1,
    size: i > 94 ? 10 : 0.1,
    side: i % 3 ? "buy" : "sell",
    exchangeAt: new Date(1792440000000 + i * 1000).toISOString(),
  }));
}
(() => {
  const registry = new DeskRegistry(),
    list = registry.list();
  assert.deepEqual(
    list.map((x) => x.asset),
    ["BTC", "ETH", "SOL", "BNB"],
  );
  assert.ok(list.every((x) => x.agents.length === 7));
  const context = {
      candles: candles(),
      trades: trades(),
      book: {
        bids: [{ price: 100, size: 8 }],
        asks: [{ price: 101, size: 2 }],
        spreadBps: 2,
      },
      quality: { status: "healthy" },
    },
    report = registry.analyze("BTC", context);
  assert.equal(report.status, "ok");
  assert.ok(["LONG", "SHORT", "NO_TRADE"].includes(report.action));
  assert.equal(report.agents.length, 6);
  assert.equal(report.inputSummary.candles, 120);
  assert.ok(report.signal >= -1 && report.signal <= 1);
  assert.equal(report.policy.paperOnly, true);
  assert.equal(report.consensus.paperOnly, true);
  assert.equal(report.dependence.source, "static-fallback");
  assert.equal(report.dependence.reason, "warmup");
  assert.ok(report.consensus.effectiveAgents > 0);
  assert.equal(report.formula.includes("logit"), true);
  const blocked = registry.analyze("ETH", {
    candles: candles(10),
    trades: [],
    book: {},
    quality: { status: "degraded" },
  });
  assert.equal(blocked.action, "NO_TRADE");
  assert.ok(blocked.blockers.includes("book:missing"));
  assert.ok(blocked.blockers.length >= 4);
  const decisionState = registry.exportDecisionState(),
    restoredRegistry = new DeskRegistry();
  assert.equal(
    restoredRegistry.restoreDecisionState(decisionState).BTC.observations,
    1,
  );
  assert.equal(
    restoredRegistry.restoreDecisionState(decisionState).ETH.observations,
    1,
  );
  assert.throws(
    () =>
      restoredRegistry.restoreDecisionState({
        ...decisionState,
        assets: {
          ...decisionState.assets,
          BTC: { ...decisionState.assets.BTC, observations: 999 },
        },
      }),
    /invalid-decision-checkpoint/,
  );
  assert.throws(() => registry.analyze("DOGE", context));
  console.log("desk tests: ok");
})();
