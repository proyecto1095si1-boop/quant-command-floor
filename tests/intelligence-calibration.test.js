"use strict";

const assert = require("node:assert/strict"),
  {
    calibrateIntelligence,
    normalizeObservations,
  } = require("../server/intelligence/calibration.js"),
  { ResearchLab } = require("../server/research/lab.js"),
  { createGateway } = require("../server/gateway.js");

function dataset(count = 70) {
  const start = Date.parse("2025-01-01T00:00:00Z"),
    horizon = 86400000;
  return Array.from({ length: count }, (_, index) => {
    const direction = index % 2 ? 1 : -1;
    return {
      timestamp: new Date(start + index * 2 * horizon).toISOString(),
      outcomeAt: new Date(start + index * 2 * horizon + horizon).toISOString(),
      asset: "BTC",
      outcome: direction > 0 ? 1 : 0,
      nodes: [
        { id: "macro", signal: -direction * 0.7, confidence: 0.8 },
        { id: "news", signal: 0, confidence: 0.5 },
        { id: "market", signal: direction * 0.9, confidence: 0.95 },
      ],
    };
  });
}

(async () => {
  const observations = dataset(),
    result = calibrateIntelligence({ observations });
  assert.equal(result.paperOnly, true);
  assert.equal(result.method, "nested-purged-embargoed-walk-forward-v1");
  assert.equal(result.folds.length, 2);
  assert.equal(result.outOfSample.observations, 20);
  assert.ok(result.outOfSample.logLoss < Math.log(2));
  assert.ok(result.recommendation.parameters.weights.market >= 0.4);
  assert.equal(result.recommendation.autoApply, false);
  assert.equal(result.recommendation.requiresHumanApproval, true);
  assert.match(result.dataset.hash, /^[a-f0-9]{64}$/);
  assert.match(result.reproducibilityHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(
    calibrateIntelligence({ observations }).recommendation,
    result.recommendation,
  );

  assert.throws(
    () =>
      normalizeObservations([
        observations[0],
        { ...observations[1], outcomeAt: observations[1].timestamp },
      ]),
    /invalid-intelligence-calibration-observation/,
  );
  assert.throws(
    () =>
      normalizeObservations([
        observations[0],
        { ...observations[1], asset: "ETH" },
      ]),
    /single-asset/,
  );
  assert.throws(
    () => calibrateIntelligence({ observations: observations.slice(0, 50) }),
    /insufficient-intelligence-calibration-folds/,
  );
  const overlapping = observations.map((row, index) => ({
    ...row,
    timestamp: new Date(
      Date.parse("2025-01-01T00:00:00Z") + index * 3600000,
    ).toISOString(),
    outcomeAt: new Date(
      Date.parse("2025-01-01T00:00:00Z") + index * 3600000 + 24 * 3600000,
    ).toISOString(),
  }));
  assert.throws(
    () => calibrateIntelligence({ observations: overlapping }),
    /insufficient-causally-mature-training-observations/,
  );
  assert.throws(
    () =>
      normalizeObservations(
        observations,
        Date.parse(observations[0].timestamp),
      ),
    /invalid-intelligence-calibration-observation/,
  );

  const records = [],
    research = new ResearchLab({
      record: async (stream, event) => records.push({ stream, event }),
    }),
    report = await research.calibrateIntelligence({
      calibrationId: "intel-cal-1",
      observations,
    });
  assert.equal(report.id, "intel-cal-1");
  assert.equal(records[0].stream, "research.intelligence-calibration");

  const gateway = createGateway({ research }),
    address = await gateway.listen(0),
    response = await fetch(
      `http://127.0.0.1:${address.port}/v1/research/intelligence-calibration`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ observations }),
      },
    );
  try {
    assert.equal(response.status, 200);
    assert.equal((await response.json()).recommendation.autoApply, false);
  } finally {
    await gateway.close();
  }

  console.log("intelligence calibration tests: ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
