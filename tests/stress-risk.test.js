"use strict";

const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  { liquidationCost } = require("../server/risk/liquidity.js"),
  {
    stressCorrelation,
    lowerTailDependence,
    ridgeFactorLoadings,
  } = require("../server/risk/dependency.js"),
  { reverseMarketShock } = require("../server/risk/reverse-stress.js"),
  { StressEngine, digest } = require("../server/risk/stress-engine.js"),
  { scenarioById, composeScenario } = require("../server/risk/scenarios.js");

const golden = JSON.parse(
  fs.readFileSync(path.join(__dirname, "golden/stress-cases.json"), "utf8"),
);
function close(actual, expected, tolerance = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) < tolerance,
    `${actual} differs from ${expected}`,
  );
}

const liquid = liquidationCost(
    { notional: 100000 },
    { volatility: 0.04, dailyVolume: 1000000, spreadBps: 10 },
    {},
  ),
  doubledParticipation = liquidationCost(
    { notional: 200000 },
    { volatility: 0.04, dailyVolume: 1000000, spreadBps: 10 },
    {},
  ),
  quarterDepth = liquidationCost(
    { notional: 100000 },
    { volatility: 0.04, dailyVolume: 1000000, spreadBps: 10 },
    { depthMultiplier: 0.25 },
  );
close(doubledParticipation.impactRate / liquid.impactRate, Math.sqrt(2));
close(quarterDepth.impactRate / liquid.impactRate, 2);
assert.equal(liquid.complete, true);
assert.equal(liquid.liquidatableFractions["5d"], 1);
const missing = liquidationCost({ notional: 100000 });
assert.equal(missing.complete, false);
assert.ok(missing.cost > 0);
assert.deepEqual(missing.missing, ["dailyVolume", "spreadBps"]);
assert.equal(
  liquidationCost(
    { notional: 100 },
    { dailyVolume: 1000, spreadBps: 1 },
    { venueUnavailable: true },
  ).liquidatableFractions["1d"],
  0,
);

const series = Array.from({ length: 3 }, (_, asset) =>
    Array.from({ length: 300 }, (_, observation) => {
      const market = Math.sin(observation * 0.37) * 0.02;
      const crash = observation % 47 === 0 ? -0.1 : 0;
      return (
        market * (1 + asset * 0.2) +
        crash +
        Math.cos(observation + asset) * 0.002
      );
    }),
  ),
  dependency = stressCorrelation(series);
assert.equal(dependency.available, true);
dependency.stress.forEach((row, i) =>
  row.forEach((value, j) => close(value, dependency.stress[j][i], 1e-12)),
);
assert.ok(dependency.eigenvalues.every((value) => value >= 0));
dependency.stress.forEach((row, index) => close(row[index], 1, 1e-12));
const tailDependence = lowerTailDependence(series);
assert.equal(tailDependence.length, 3);
tailDependence.flat().forEach((value) => assert.ok(value >= 0 && value <= 1));

const factorA = Array.from({ length: 100 }, (_, index) =>
    Math.sin(index * 0.21),
  ),
  factorB = Array.from({ length: 100 }, (_, index) => Math.cos(index * 0.13)),
  factorAsset = factorA.map(
    (value, index) => 0.01 + 2 * value - 0.5 * factorB[index],
  ),
  regression = ridgeFactorLoadings(
    factorAsset,
    { market: factorA, liquidity: factorB },
    0,
  );
assert.equal(regression.available, true);
close(regression.intercept, 0.01);
close(regression.loadings.market, 2);
close(regression.loadings.liquidity, -0.5);
close(regression.rSquared, 1);

const reverse = reverseMarketShock([golden.reverseStress.exposure], {
  equity: golden.reverseStress.equity,
  targetLossRatio: golden.reverseStress.targetLossRatio,
});
assert.equal(reverse.reachable, true);
close(reverse.criticalShock, golden.reverseStress.expectedCriticalShock, 1e-9);
assert.equal(
  reverseMarketShock([1], { equity: 100000, targetLossRatio: 0.9 }).reachable,
  false,
);
assert.equal(
  reverseMarketShock([50000], {
    equity: 100000,
    targetLossRatio: 0.1,
    fixedCosts: 10000,
  }).criticalShock,
  0,
);

const plan = {
    id: "golden-plan",
    equity: golden.marketShock.equity,
    allocations: [
      {
        asset: "BTC",
        product: "BTC-USD",
        factor: "crypto-core",
        targetWeight: golden.marketShock.weight,
        tradeNotional: 60000,
        venue: "coinbase",
      },
    ],
    diagnostics: {
      tailRisk: { conservative: { expectedShortfall: 0.03 } },
    },
  },
  records = [],
  engine = new StressEngine({
    record: async (...event) => records.push(event),
  }),
  scenario = {
    id: "golden-market",
    version: 1,
    name: "Golden market shock",
    horizon: "1d",
    source: "test",
    factorShocks: { "crypto-core": golden.marketShock.shock },
    liquidity: { spreadMultiplier: 1, depthMultiplier: 1 },
  },
  evaluated = engine.evaluateScenario(plan, scenario, {
    liquidityData: {
      "BTC-USD": {
        volatility: 0.04,
        dailyVolume: 10000000,
        spreadBps: 2,
      },
    },
  });
close(evaluated.marketLoss, golden.marketShock.expectedMarketLoss);
assert.ok(evaluated.totalLoss > evaluated.marketLoss);
assert.equal(evaluated.completeness, 1);

const stablecoinPlan = {
    ...plan,
    equity: golden.stablecoinDepeg.notional,
    allocations: [
      {
        ...plan.allocations[0],
        asset: "USDC",
        product: "USDC-USD",
        factor: "stablecoin",
        targetWeight: 1,
        tradeNotional: 100000,
      },
    ],
  },
  stablecoinResult = engine.evaluateScenario(
    stablecoinPlan,
    {
      ...scenario,
      factorShocks: { stablecoin: golden.stablecoinDepeg.shock },
    },
    {},
  );
close(stablecoinResult.marketLoss, golden.stablecoinDepeg.expectedMarketLoss);
assert.ok(stablecoinResult.warnings[0].fallbackHaircutApplied);

(async () => {
  const input = {
      scenarioIds: ["ftx-2022"],
      returnsMatrix: series.slice(0, 1),
      liquidityData: {
        "BTC-USD": {
          volatility: 0.04,
          dailyVolume: 10000000,
          spreadBps: 2,
        },
      },
    },
    first = await engine.run(plan, input),
    second = await engine.run(plan, input);
  assert.equal(first.paperOnly, true);
  assert.equal(first.integrity.hash, second.integrity.hash);
  assert.equal(digest({ b: 2, a: 1 }), digest({ a: 1, b: 2 }));
  assert.equal(first.completeness, 1);
  assert.equal(first.dependency.correlation.available, true);
  assert.equal(records.length, 2);
  assert.equal(records[0][0], "risk.stress");
  assert.ok(first.capitalBuffer.total > first.capitalBuffer.expectedShortfall);
  assert.equal(engine.scenarios().paperOnly, true);
  assert.equal(engine.status().runs, 2);
  const reverseRun = await engine.reverse(plan, { targetLossRatio: 0.1 });
  assert.equal(reverseRun.paperOnly, true);
  assert.equal(reverseRun.integrity.hash.length, 64);
  assert.equal(engine.status().reverseRuns, 1);
  assert.equal(records.at(-1)[0], "risk.reverse-stress");

  const unavailable = composeScenario(scenarioById("ftx-2022"), {
    unavailableVenues: ["coinbase"],
  });
  assert.equal(
    engine.evaluateScenario(plan, unavailable, input).rows[0].liquidity
      .liquidatable,
    false,
  );
  assert.throws(
    () => composeScenario(scenario, { forbidden: true }),
    /unsupported-stress-override/,
  );
  assert.throws(() => scenarioById("missing"), /unknown-stress-scenario/);
  console.log("advanced stress risk tests: ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
