"use strict";
const assert = require("node:assert/strict"),
  M = require("../server/portfolio/math.js"),
  { PortfolioService } = require("../server/portfolio/service.js");
(async () => {
  const series = Array.from({ length: 4 }, (_, j) =>
      Array.from(
        { length: 120 },
        (_, i) => Math.sin(i * (0.2 + j * 0.03)) * 0.004 + (j + 1) * 0.0001,
      ),
    ),
    caps = [0.35, 0.3, 0.15, 0.1],
    rp = M.riskParity(series, caps, 0.85);
  assert.ok(Math.abs(rp.reduce((a, b) => a + b, 0) - 0.85) < 1e-9);
  rp.forEach((w, i) => assert.ok(w <= caps[i] + 1e-9));
  const d = M.diagnostics(rp, series);
  assert.ok(d.annualVolatility > 0);
  assert.ok(d.diversificationRatio >= 1);
  const reb = M.rebalance([0.5, 0, 0, 0], rp, { band: 0.01, maxTurnover: 0.1 });
  assert.ok(reb.turnover <= 0.1000001);
  assert.equal(reb.scaled, true);
  const assets = {
      BTC: { product: "BTC-USD", maxWeight: 0.35 },
      ETH: { product: "ETH-USD", maxWeight: 0.3 },
      SOL: { product: "SOL-USD", maxWeight: 0.15 },
      BNB: { product: "BNB-USD", maxWeight: 0.1 },
    },
    pipeline = {
      desks: { assets },
      marks: () => ({}),
      ledger: {
        snapshot: () => ({ equity: 100000, grossExposure: 0, positions: {} }),
      },
    },
    events = [],
    svc = new PortfolioService({
      pipeline,
      dataService: {},
      record: async (s, e) => events.push([s, e]),
    }),
    plan = await svc.plan({ returnsMatrix: series });
  assert.equal(plan.allocations.length, 4);
  assert.equal(plan.approval.state, "proposed");
  assert.ok(plan.cashTarget >= 0.149);
  assert.equal(events[0][0], "risk.stress");
  assert.equal(events[1][0], "portfolio.plans");
  assert.equal(plan.diagnostics.stress.paperOnly, true);
  assert.ok(plan.diagnostics.stress.results.length > 0);
  assert.ok(svc.scenarios().scenarios.length > 0);
  const stress = await svc.stress({
    portfolioPlanId: plan.id,
    scenarioIds: ["ftx-2022"],
  });
  assert.equal(stress.paperOnly, true);
  const reverse = await svc.reverseStress({
    portfolioPlanId: plan.id,
    targetLossRatio: 0.1,
  });
  assert.equal(reverse.paperOnly, true);
  assert.equal(svc.stressStatus().reverseRuns, 1);
  assert.throws(
    () => svc.stress({ portfolioPlanId: "missing" }),
    /portfolio-plan-not-found/,
  );
  console.log("portfolio tests: ok");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
