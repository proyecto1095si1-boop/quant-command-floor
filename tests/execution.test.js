"use strict";
const assert = require("node:assert/strict"),
  { schedule, sliceProfile } = require("../server/execution/router.js"),
  { ExecutionService } = require("../server/execution/service.js"),
  { RiskGate } = require("../server/pipeline/risk-gate.js"),
  { PaperLedger } = require("../server/pipeline/paper-ledger.js");
(async () => {
  assert.deepEqual(
    sliceProfile([1, 2, 3, 4], 2).map((x) => +x.toFixed(1)),
    [0.3, 0.7],
  );
  const route = schedule(
    { id: "p", symbol: "BTC-USD", side: "buy", notional: 6000, price: 100 },
    { slices: 6 },
  );
  assert.equal(route.children.length, 6);
  assert.equal(route.scheduledNotional, 6000);
  const plan = {
      id: "plan-1",
      allocations: [{ asset: "BTC", product: "BTC-USD", tradeNotional: 6000 }],
    },
    portfolio = { plans: [plan] },
    ledger = new PaperLedger(),
    risk = new RiskGate({ minObservations: 0, maxStressLoss: 1 }),
    pipeline = {
      risk,
      ledger,
      dataService: { health: () => ({ status: "healthy" }) },
      marks: () => ({ "BTC-USD": 100 }),
      desks: { assets: { BTC: { maxWeight: 0.35 } } },
    },
    events = [],
    svc = new ExecutionService({
      pipeline,
      portfolio,
      record: async (s, e) => events.push([s, e]),
    }),
    submitted = await svc.submit({
      planId: "plan-1",
      approvedBy: "Human Director",
      prices: { BTC: 100 },
      idempotencyKey: "once",
    });
  assert.equal(submitted.parents.length, 1);
  assert.equal(submitted.queued, 6);
  assert.deepEqual(
    await svc.submit({
      planId: "plan-1",
      approvedBy: "Human Director",
      prices: { BTC: 100 },
      idempotencyKey: "once",
    }),
    submitted,
  );
  let riskReviews = 0;
  const riskContexts = [];
  const evaluate = risk.evaluate.bind(risk);
  risk.evaluate = (...args) => {
    riskReviews++;
    riskContexts.push(args[1]);
    return evaluate(...args);
  };
  const reconciled = await svc.drain({ spreadBps: 5, depthNotional: 100000 });
  assert.equal(reconciled.filled, 6);
  assert.equal(svc.status().queue, 0);
  assert.equal(ledger.fills.length, 6);
  assert.equal(riskReviews, 6);
  assert.ok(riskContexts.every((context) => context.dataStatus === "healthy"));
  assert.ok(svc.metrics.fees > 0);
  assert.equal(svc.status().tca.fills, 6);
  assert.ok(
    Number.isFinite(svc.status().tca.weightedImplementationShortfallBps),
  );
  const degradedPlan = {
    id: "plan-degraded",
    allocations: [{ asset: "BTC", product: "BTC-USD", tradeNotional: 600 }],
  };
  portfolio.plans.push(degradedPlan);
  await svc.submit({
    planId: "plan-degraded",
    approvedBy: "Human Director",
    prices: { BTC: 100 },
  });
  pipeline.dataService.health = () => ({ status: "degraded" });
  const rejectedForData = await svc.drain({
    spreadBps: 5,
    depthNotional: 100000,
  });
  assert.equal(rejectedForData.rejected, 6);
  pipeline.dataService.health = () => ({ status: "healthy" });
  const qtyBeforeReduction = ledger.positions.get("BTC-USD").qty,
    reductionPlan = {
      id: "plan-reduce",
      allocations: [{ asset: "BTC", product: "BTC-USD", tradeNotional: -600 }],
    };
  portfolio.plans.push(reductionPlan);
  await svc.submit({
    planId: "plan-reduce",
    approvedBy: "Human Director",
    prices: { BTC: 100 },
  });
  risk.halt("emergency");
  const reducedWhileHalted = await svc.drain({
    spreadBps: 100,
    depthNotional: 100000,
  });
  assert.equal(reducedWhileHalted.filled, 6);
  assert.ok(ledger.positions.get("BTC-USD").qty < qtyBeforeReduction);
  assert.equal(
    svc.children
      .filter((x) => x.parentId === svc.parents.at(-1).id)
      .every((x) => x.risk.metrics.exposure.reduceOnlyRequested),
    true,
  );
  await assert.rejects(
    () => svc.submit({ planId: "plan-1", prices: { BTC: 100 } }),
    /human-approval-required/,
  );
  console.log("execution tests: ok");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
