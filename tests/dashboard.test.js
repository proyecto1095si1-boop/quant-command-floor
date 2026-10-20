const assert = require("node:assert/strict"),
  A = require("../server/dashboard/analytics.js"),
  { DashboardService } = require("../server/dashboard/service.js");
(async () => {
  assert.deepEqual(
    A.returns([100, 110, 99]).map((x) => +x.toFixed(2)),
    [0.1, -0.1],
  );
  assert.equal(+A.maxDrawdown([100, 120, 90, 110]).max.toFixed(2), 0.25);
  assert.ok(
    A.varCvar([0.1, -0.2, 0.03, -0.1]).cvar >=
      A.varCvar([0.1, -0.2, 0.03, -0.1]).var,
  );
  assert.equal(+A.correlation([1, 2, 3], [2, 4, 6]).toFixed(5), 1);
  const runs = [
      {
        id: "1",
        asset: "BTC",
        status: "completed",
        finishedAt: "2026-01-01",
        portfolio: { equity: 100000 },
        desk: { action: "LONG" },
        execution: { fill: { fee: 5 } },
      },
      {
        id: "2",
        asset: "ETH",
        status: "veto",
        finishedAt: "2026-01-02",
        portfolio: { equity: 98000 },
        desk: { action: "SHORT" },
        risk: { decision: "VETO" },
      },
      {
        id: "3",
        asset: "BTC",
        status: "completed",
        finishedAt: "2026-01-03",
        portfolio: { equity: 102000 },
        desk: { action: "LONG" },
        execution: { fill: { fee: 4 } },
      },
    ],
    store = { tail: async () => runs },
    data = {
      store,
      storage: async () => ({ bytes: 100, files: 1 }),
      health: () => ({
        status: "healthy",
        maxDivergenceBps: 1,
        divergenceLimitBps: 25,
        source: { lastLatencyMs: 40, errorRate: 0 },
        secondary: { lastLatencyMs: 60 },
        quality: { status: "healthy" },
      }),
      connector: {
        candles: async (product) =>
          [1, 2, 3, 4].map((x, i) => ({
            close: x * (product === "BTC-USD" ? 1 : 2) + i,
          })),
      },
    },
    pipeline = {
      desks: {
        assets: { BTC: { product: "BTC-USD" }, ETH: { product: "ETH-USD" } },
      },
      status: () => ({
        halted: false,
        metrics: { fills: 2, vetos: 1 },
        portfolio: {
          equity: 102000,
          cash: 90000,
          grossExposure: 12000,
          fees: 9,
        },
        audit: { valid: true, count: 20 },
      }),
    },
    dashboard = new DashboardService({ pipeline, dataService: data }),
    overview = await dashboard.overview();
  assert.equal(overview.execution.fills, 2);
  assert.equal(overview.execution.byAsset.BTC.fills, 2);
  assert.equal(overview.risk.vetos, 1);
  assert.ok(overview.performance.maxDrawdown > 0);
  assert.equal(overview.alerts.length, 0);
  const csv = await dashboard.csv();
  assert.ok(csv.includes("run_id,asset"));
  assert.ok(csv.includes("BTC"));
  console.log("dashboard tests: ok");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
