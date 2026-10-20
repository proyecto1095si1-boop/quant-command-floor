"use strict";

const assert = require("node:assert/strict"),
  M = require("../server/portfolio/math.js"),
  { PortfolioService } = require("../server/portfolio/service.js"),
  { RiskGate } = require("../server/pipeline/risk-gate.js");

const series = Array.from({ length: 4 }, (_, asset) =>
    Array.from({ length: 240 }, (_, observation) => {
      const common = Math.sin(observation * 0.17) * 0.008;
      return (
        common * (0.5 + asset * 0.4) +
        Math.cos(observation * (0.11 + asset * 0.03)) * 0.002 * (asset + 1)
      );
    }),
  ),
  estimate = M.oasCovariance(series);
assert.ok(estimate.shrinkage >= 0 && estimate.shrinkage <= 1);
assert.equal(estimate.observations, 240);
assert.ok(estimate.eigenvalues.every((value) => value >= 0));
estimate.covariance.forEach((row, i) =>
  row.forEach((value, j) =>
    assert.ok(Math.abs(value - estimate.covariance[j][i]) < 1e-15),
  ),
);

const indefinite = M.nearestPsd([
  [1, 2],
  [2, 1],
]);
assert.ok(indefinite.eigenvalues.every((value) => value > 0));
for (const weights of [
  [1, 0],
  [0, 1],
  [0.5, 0.5],
  [2, -1],
])
  assert.ok(M.portfolioVariance(weights, indefinite.matrix) >= 0);

const parity = M.riskParity(series, [1, 1, 1, 1], 1),
  diagnostics = M.diagnostics(parity, series, 365 * 24, {
    confidence: 0.99,
    factorLabels: ["core", "core", "beta", "venue"],
  });
assert.ok(Math.abs(parity.reduce((sum, value) => sum + value, 0) - 1) < 1e-12);
assert.ok(
  Math.max(...diagnostics.riskContributions) -
    Math.min(...diagnostics.riskContributions) <
    1e-9,
);
assert.equal(diagnostics.covarianceEstimator, "oas+psd");
assert.ok(Math.abs(diagnostics.zScore - 2.326347874) < 1e-8);
assert.ok(
  Math.abs(
    diagnostics.componentVaR.reduce((sum, value) => sum + value, 0) -
      diagnostics.valueAtRisk,
  ) < 1e-14,
);
assert.ok(
  Math.abs(
    diagnostics.riskContributions.reduce((sum, value) => sum + value, 0) - 1,
  ) < 1e-12,
);
assert.equal(
  diagnostics.factorConcentration.weights.core,
  parity[0] + parity[1],
);
assert.ok(diagnostics.factorConcentration.hhi > 0);
assert.ok(diagnostics.factorConcentration.effectiveFactors > 1);
assert.throws(() => M.inverseNormalCdf(1), /probability-must/);

const single = M.oasCovariance([series[0]]);
assert.equal(single.shrinkage, 1);
assert.equal(single.covariance.length, 1);
const constant = M.diagnostics(
  [0.5, 0.5],
  [Array(60).fill(0), Array(60).fill(0)],
);
assert.ok(Number.isFinite(constant.annualVolatility));
assert.ok(constant.eigenvalues.every((value) => value > 0));

const factorRisk = new RiskGate({
    minObservations: 0,
    maxFactorExposure: 0.45,
    maxGrossExposure: 0.7,
    maxStressLoss: 1,
  }),
  factorProposal = {
    id: "factor-add",
    symbol: "ETH-USD",
    side: "buy",
    qty: 100,
    notional: 10000,
    confidence: 1,
    maxWeight: 0.5,
    factor: "crypto-core",
  },
  factorContext = {
    equity: 100000,
    grossExposure: 40000,
    assetExposure: 20000,
    signedAssetExposure: 20000,
    factorExposure: 40000,
    dataStatus: "healthy",
    spreadBps: 1,
  },
  factorVeto = factorRisk.evaluate(factorProposal, factorContext);
assert.equal(factorVeto.approved, false);
assert.ok(factorVeto.failed.includes("factor-exposure"));
assert.equal(factorVeto.metrics.postFactorExposure, 0.5);
const factorReduction = factorRisk.evaluate(
  {
    ...factorProposal,
    id: "factor-reduce",
    side: "sell",
    notional: 10000,
    reduceOnly: true,
  },
  factorContext,
);
assert.equal(factorReduction.approved, true);
assert.equal(factorReduction.metrics.postFactorExposure, 0.3);

const assets = {
    BTC: {
      product: "BTC-USD",
      maxWeight: 0.35,
      riskClass: "major",
      factor: "core",
    },
    ETH: {
      product: "ETH-USD",
      maxWeight: 0.3,
      riskClass: "major",
      factor: "core",
    },
    SOL: {
      product: "SOL-USD",
      maxWeight: 0.15,
      riskClass: "high-beta",
      factor: "beta",
    },
    BNB: {
      product: "BNB-USD",
      maxWeight: 0.1,
      riskClass: "venue",
      factor: "venue",
    },
  },
  service = new PortfolioService({
    pipeline: {
      desks: { assets },
      marks: () => ({}),
      ledger: {
        snapshot: () => ({ equity: 100000, grossExposure: 0, positions: {} }),
      },
    },
    dataService: {},
  });

(async () => {
  const plan = await service.plan({ returnsMatrix: series });
  assert.equal(plan.diagnostics.covarianceEstimator, "oas+psd");
  assert.ok(plan.diagnostics.covarianceShrinkage >= 0);
  assert.ok(plan.diagnostics.covarianceMinEigenvalue > 0);
  assert.ok(plan.diagnostics.valueAtRisk > 0);
  assert.ok(plan.diagnostics.valueAtRiskNotional > 0);
  assert.equal(plan.diagnostics.tailRisk.confidence, 0.99);
  assert.equal(plan.diagnostics.tailRisk.fhs.available, true);
  assert.equal(plan.diagnostics.tailRisk.evt.available, true);
  assert.ok(
    plan.diagnostics.tailRisk.conservative.expectedShortfall >=
      plan.diagnostics.tailRisk.conservative.valueAtRisk,
  );
  assert.equal(plan.diagnostics.tailBacktest.available, true);
  assert.equal(plan.diagnostics.tailBacktest.observations, 140);
  assert.ok(
    ["green", "yellow", "red"].includes(
      plan.diagnostics.tailBacktest.trafficLight.zone,
    ),
  );
  assert.ok(
    Math.abs(plan.diagnostics.componentVaRSum - plan.diagnostics.valueAtRisk) <
      1e-14,
  );
  assert.equal(
    plan.allocations.every((row) => "marginalVaR" in row),
    true,
  );
  await assert.rejects(
    () =>
      service.plan({
        returnsMatrix: series.map((row, i) =>
          i ? row : row.map((value, j) => (j === 20 ? Number.NaN : value)),
        ),
      }),
    /invalid-portfolio-returns/,
  );
  console.log("portfolio risk model tests: ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
