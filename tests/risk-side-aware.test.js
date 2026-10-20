"use strict";

const assert = require("node:assert/strict"),
  { RiskGate, projectExposure } = require("../server/pipeline/risk-gate.js");

const proposal = (side, notional, reduceOnly = false) => ({
    id: `${side}-${notional}`,
    symbol: "BTC-USD",
    side,
    qty: notional / 100,
    notional,
    confidence: 1,
    maxWeight: 1,
    reduceOnly,
  }),
  context = (
    signedAssetExposure,
    grossExposure = Math.abs(signedAssetExposure),
  ) => ({
    equity: 100000,
    signedAssetExposure,
    assetExposure: Math.abs(signedAssetExposure),
    grossExposure,
    exposures: { "BTC-USD": signedAssetExposure },
    dataStatus: "healthy",
    spreadBps: 2,
  });

(() => {
  assert.deepEqual(projectExposure(proposal("buy", 10000), context(60000)), {
    current: 60000,
    delta: 10000,
    post: 70000,
    currentAbsolute: 60000,
    postAbsolute: 70000,
    grossBefore: 60000,
    grossAfter: 70000,
    directionReduces: false,
    riskReducing: false,
    closes: false,
    flips: false,
    reduceOnlyRequested: false,
    reduceOnlyValid: false,
  });
  const cases = [
    [
      "long reduction",
      proposal("sell", 10000),
      context(60000),
      50000,
      50000,
      false,
    ],
    ["long close", proposal("sell", 60000), context(60000), 0, 0, false],
    [
      "short increase",
      proposal("sell", 10000),
      context(-60000),
      -70000,
      70000,
      false,
    ],
    [
      "short reduction",
      proposal("buy", 10000),
      context(-60000),
      -50000,
      50000,
      false,
    ],
    [
      "long to short flip",
      proposal("sell", 15000),
      context(10000),
      -5000,
      5000,
      true,
    ],
    [
      "multi-asset reduction",
      proposal("sell", 10000),
      context(60000, 90000),
      50000,
      80000,
      false,
    ],
  ];
  for (const [name, order, state, post, gross, flips] of cases) {
    const projected = projectExposure(order, state);
    assert.equal(projected.post, post, `${name}: signed exposure`);
    assert.equal(projected.grossAfter, gross, `${name}: gross exposure`);
    assert.equal(projected.flips, flips, `${name}: flip`);
  }

  const risk = new RiskGate({ maxStressLoss: 1 });
  const reduction = risk.evaluate(proposal("sell", 10000), context(65000));
  assert.equal(reduction.approved, true);
  assert.equal(reduction.metrics.postGrossExposure, 0.55);
  assert.equal(reduction.metrics.exposure.riskReducing, true);

  const increase = risk.evaluate(proposal("buy", 10000), context(65000));
  assert.equal(increase.approved, false);
  assert.ok(increase.failed.includes("gross-exposure"));
  assert.equal(increase.metrics.postGrossExposure, 0.75);

  risk.halt("emergency");
  const emergency = risk.evaluate(proposal("sell", 10000, true), {
    ...context(65000),
    dataStatus: "degraded",
    drawdown: 0.5,
    var: 0.5,
    cvar: 0.6,
    correlation: 1,
    spreadBps: 1000,
    returns: [-0.2],
  });
  assert.equal(emergency.approved, true);
  assert.equal(emergency.metrics.exposure.reduceOnlyValid, true);
  assert.ok(emergency.reduceOnlyOverrides.includes("drawdown"));

  const flip = risk.evaluate(proposal("sell", 15000, true), context(10000));
  assert.equal(flip.approved, false);
  assert.ok(flip.failed.includes("reduce-only"));
  assert.equal(flip.metrics.exposure.flips, true);

  const opening = risk.evaluate(proposal("sell", 10000, true), context(0));
  assert.equal(opening.approved, false);
  assert.ok(opening.failed.includes("reduce-only"));

  console.log("side-aware risk tests: ok");
})();
