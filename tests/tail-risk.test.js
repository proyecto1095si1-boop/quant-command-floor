"use strict";

const assert = require("node:assert/strict"),
  Tail = require("../server/risk/tail.js");

function close(actual, expected, tolerance = 1e-12) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} differs from ${expected}`,
  );
}

const returns = Array.from({ length: 400 }, (_, index) => {
    const regular =
      Math.sin(index * 1.7) * 0.008 + Math.cos(index * 0.31) * 0.004;
    return index % 53 === 0 ? -0.04 - (index % 7) * 0.005 : regular;
  }),
  fhs = Tail.filteredHistoricalSimulation(returns, { confidence: 0.99 }),
  scaled = Tail.filteredHistoricalSimulation(
    returns.map((value) => value * 3),
    { confidence: 0.99 },
  );
assert.equal(fhs.available, true);
assert.equal(fhs.observations, 400);
assert.ok(fhs.expectedShortfall >= fhs.valueAtRisk);
close(scaled.valueAtRisk, fhs.valueAtRisk * 3);
close(scaled.expectedShortfall, fhs.expectedShortfall * 3);
close(scaled.forecastVolatility, fhs.forecastVolatility * 3);

const evt = Tail.peaksOverThreshold(returns, {
  confidence: 0.99,
  thresholdQuantile: 0.9,
});
assert.equal(evt.available, true);
assert.equal(evt.model, "evt-pot-gpd-moments");
assert.ok(evt.exceedances >= 10);
assert.ok(evt.expectedShortfall >= evt.valueAtRisk);
assert.ok(evt.shape < 1);
assert.equal(
  Tail.peaksOverThreshold(returns.slice(0, 30), {
    minimumExceedances: 10,
  }).available,
  false,
);
assert.throws(
  () => Tail.peaksOverThreshold(returns, { thresholdQuantile: 0.995 }),
  /confidence-must-exceed/,
);

const conventional = Array(250).fill(false);
conventional[10] = true;
conventional[80] = true;
const kupiec = Tail.kupiecTest(conventional, 0.01);
assert.equal(kupiec.exceptions, 2);
assert.equal(kupiec.rejectAt5Percent, false);
assert.ok(kupiec.pValue > 0.05);
assert.equal(
  Tail.kupiecTest(Array(250).fill(false), 0.01).rejectAt5Percent,
  true,
);

const independent = Tail.christoffersenTest(conventional),
  clusteredSequence = Array(250).fill(false);
for (let index = 100; index < 112; index++) clusteredSequence[index] = true;
const clustered = Tail.christoffersenTest(clusteredSequence);
assert.equal(independent.rejectAt5Percent, false);
assert.equal(clustered.rejectAt5Percent, true);
assert.ok(clustered.statistic > independent.statistic);

assert.deepEqual(Tail.trafficLight(4, 250, 0.01), {
  zone: "green",
  greenMaximum: 4,
  yellowMinimum: 5,
  redMinimum: 10,
});
assert.equal(Tail.trafficLight(5, 250, 0.01).zone, "yellow");
assert.equal(Tail.trafficLight(10, 250, 0.01).zone, "red");

const forecasts = Array(250).fill(0.02),
  losses = Array(250).fill(0);
losses[10] = 0.03;
losses[80] = 0.04;
const backtest = Tail.exceptionBacktest(losses, forecasts, {
  confidence: 0.99,
});
assert.equal(backtest.exceptions, 2);
assert.equal(backtest.trafficLight.zone, "green");
assert.equal(backtest.conditionalCoverage.degreesOfFreedom, 2);

const rolling = Tail.rollingFhsBacktest(returns, {
  confidence: 0.99,
  window: 100,
});
assert.equal(rolling.available, true);
assert.equal(rolling.observations, 300);
assert.equal(rolling.sequence.length, 300);
assert.ok(["green", "yellow", "red"].includes(rolling.trafficLight.zone));

const combined = Tail.tailRisk(returns, { confidence: 0.99 });
assert.ok(combined.conservative);
assert.ok(
  combined.conservative.expectedShortfall >= combined.conservative.valueAtRisk,
);
assert.equal(
  Tail.filteredHistoricalSimulation([0.1], { minimumObservations: 2 }).reason,
  "insufficient-observations",
);
assert.throws(() => Tail.exceptionBacktest([1], [1, 2]), /length-mismatch/);

console.log("tail risk tests: ok");
