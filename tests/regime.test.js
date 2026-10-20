"use strict";
const assert = require("node:assert/strict"),
  M = require("../server/regime/math.js"),
  {
    RegimeService,
    STATES,
    TRANSITION,
  } = require("../server/regime/service.js");
(() => {
  const trend = Array.from(
      { length: 140 },
      (_, i) => 100 * Math.exp(i * 0.001) * (1 + Math.sin(i * 0.3) * 0.001),
    ),
    candles = trend.map((close) => ({ close })),
    h = M.hurst(trend);
  assert.ok(h >= 0 && h <= 1);
  const cp = M.changePoint([
    ...Array(30).fill(0.001),
    ...Array(30).fill(-0.01),
  ]);
  assert.ok(cp.probability > 0.8);
  const p = M.hmm(M.features(trend, 5), STATES, TRANSITION);
  assert.ok(Math.abs(p.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  const service = new RegimeService(),
    result = service.analyze({ asset: "BTC", candles, book: { spreadBps: 5 } });
  assert.ok(result.probability > 0 && result.probability <= 1);
  assert.ok(result.expectedDuration > 1);
  assert.ok(result.riskMultiplier > 0 && result.riskMultiplier <= 1);
  assert.equal(Object.keys(result.probabilities).length, 4);
  console.log("regime tests: ok");
})();
