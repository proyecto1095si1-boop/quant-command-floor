"use strict";

const assert = require("node:assert/strict"),
  { createGateway } = require("../server/gateway.js"),
  { ResearchLab } = require("../server/research/lab.js"),
  {
    calibrateConsensus,
    walkForwardFolds,
  } = require("../server/research/consensus-calibration.js");

function observations(length = 78) {
  return Array.from({ length }, (_, index) => {
    const outcome = index % 7 < 4 ? 1 : 0,
      direction = outcome ? 1 : -1,
      regime = index % 26 < 13 ? "risk_on_low_vol" : "risk_off_crisis";
    return {
      timestamp: new Date(Date.UTC(2025, 0, 1, 0, index)).toISOString(),
      asset: "BTC-USD",
      regime,
      regimeProbability: 0.9,
      outcome,
      signals: [
        { agent: "Technical", signal: direction * 0.8, confidence: 0.85 },
        {
          agent: "Market Structure",
          signal: direction * 0.75,
          confidence: 0.8,
        },
        {
          agent: "Whale",
          signal: index % 3 ? direction * 0.5 : -direction * 0.2,
          confidence: 0.7,
        },
      ],
    };
  });
}

(async () => {
  const foldPolicy = {
      minimumTrainingObservations: 30,
      testObservations: 10,
      purgeObservations: 2,
      embargoObservations: 3,
      minimumFolds: 3,
    },
    folds = walkForwardFolds(78, foldPolicy);
  assert.equal(folds.length, 3);
  for (const fold of folds) {
    assert.ok(fold.train.end < fold.purge.start);
    assert.ok(fold.purge.end < fold.test.start);
    assert.ok(fold.test.end < fold.embargo.start);
    assert.equal(fold.test.start - fold.train.end - 1, 2);
  }

  const input = {
      observations: observations(),
      folds: foldPolicy,
      dependencePolicy: { minimumObservations: 8 },
      grid: {
        decay: [0.9, 0.94],
        baseShrinkage: [0.1, 0.3],
        minimumAbsoluteSignal: [0.15, 0.25],
        minimumDirectionalProbability: [0.55],
      },
    },
    first = calibrateConsensus(input),
    second = calibrateConsensus(input);
  assert.equal(first.paperOnly, true);
  assert.equal(first.search.candidates, 8);
  assert.equal(first.reproducibilityHash, second.reproducibilityHash);
  assert.deepEqual(first.recommendation, second.recommendation);
  assert.equal(first.recommendation.autoApply, false);
  assert.equal(first.recommendation.requiresHumanApproval, true);
  assert.equal(first.recommendation.state, "research-only");
  assert.deepEqual(first.dataset.regimes, [
    "risk_off_crisis",
    "risk_on_low_vol",
  ]);
  assert.ok(
    first.search.ranking.every((candidate) => candidate.folds.length === 3),
  );
  assert.ok(
    first.search.ranking.every((candidate) =>
      Object.values(candidate.regimes).every(
        (metric) => metric.observations > 0,
      ),
    ),
  );

  assert.throws(
    () => calibrateConsensus({ ...input, observations: observations(40) }),
    /insufficient-calibration-folds/,
  );
  assert.throws(
    () =>
      calibrateConsensus({
        ...input,
        observations: observations().map((row) => ({ ...row, regime: "one" })),
      }),
    /calibration-requires-multiple-regimes/,
  );
  const unordered = observations();
  unordered[2].timestamp = unordered[1].timestamp;
  assert.throws(
    () => calibrateConsensus({ ...input, observations: unordered }),
    /invalid-calibration-observation/,
  );

  const events = [],
    lab = new ResearchLab({ record: async (stream) => events.push(stream) }),
    report = await lab.calibrateConsensus({ ...input, calibrationId: "wf-1" });
  assert.equal(report.id, "wf-1");
  assert.equal(events.at(-1), "research.consensus-calibration");
  assert.equal(lab.champion, null);
  assert.equal(lab.catalog().calibrations[0].recommendation.autoApply, false);

  const gateway = createGateway({ research: lab }),
    address = await gateway.listen(0);
  try {
    const response = await fetch(
      `http://127.0.0.1:${address.port}/v1/research/consensus-calibration`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...input, calibrationId: "wf-api" }),
      },
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.id, "wf-api");
    assert.equal(body.paperOnly, true);
    assert.equal(body.recommendation.autoApply, false);
  } finally {
    await gateway.close();
  }
  console.log("consensus calibration tests: ok");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
