"use strict";

const assert = require("node:assert/strict"),
  {
    DynamicCorrelationEstimator,
    conditionNumber,
    eigenvaluesSymmetric,
    matrixDistance,
  } = require("../server/decision/dependence.js");

(() => {
  let seed = 7;
  const random = () => (seed = (seed * 48271) % 2147483647) / 1073741823.5 - 1,
    estimator = new DynamicCorrelationEstimator({
      minimumObservations: 30,
      recoveryObservations: 5,
    }),
    fallback = { "a|b": 0.25 };
  for (let index = 0; index < 29; index++) {
    const x = random(),
      z = random();
    estimator.observe([
      { agent: "a", signal: x },
      { agent: "b", signal: 0.9 * x + 0.1 * z },
      { agent: "c", signal: z },
    ]);
  }
  assert.equal(estimator.current(fallback).source, "static-fallback");
  assert.deepEqual(estimator.current(fallback).correlations, fallback);
  for (let index = 29; index < 80; index++) {
    const x = random(),
      z = random();
    estimator.observe([
      { agent: "a", signal: x },
      { agent: "b", signal: 0.9 * x + 0.1 * z },
      { agent: "c", signal: z },
    ]);
  }
  const dynamic = estimator.current(fallback);
  assert.equal(dynamic.source, "dynamic-ewma");
  assert.ok(dynamic.correlations["a|b"] > 0.7);
  assert.ok(dynamic.estimator.conditionNumber <= 100);
  assert.ok(dynamic.estimator.effectiveWindow > 30);

  let detected = false;
  for (let index = 0; index < 20 && !detected; index++) {
    const x = random(),
      z = random(),
      status = estimator.observe([
        { agent: "a", signal: x },
        { agent: "b", signal: -0.9 * x + 0.1 * z },
        { agent: "c", signal: z },
      ]);
    detected = status.changeDetected;
  }
  assert.equal(detected, true);
  assert.equal(estimator.current(fallback).reason, "structural-change");
  assert.deepEqual(estimator.current(fallback).correlations, fallback);

  const checkpoint = estimator.export(),
    restored = new DynamicCorrelationEstimator({
      minimumObservations: 30,
      recoveryObservations: 5,
    });
  assert.equal(
    restored.restore(checkpoint).observations,
    estimator.status().observations,
  );
  assert.throws(
    () => restored.restore({ ...checkpoint, observations: 999 }),
    /invalid-dependence-checkpoint/,
  );
  assert.throws(
    () =>
      estimator.observe([
        { agent: "a", signal: 0 },
        { agent: "different", signal: 0 },
      ]),
    /dependence-agent-set-changed/,
  );
  assert.throws(
    () => new DynamicCorrelationEstimator({ decay: 1 }),
    /invalid-dependence-policy/,
  );
  assert.deepEqual(
    eigenvaluesSymmetric([
      [1, 0],
      [0, 2],
    ]),
    [1, 2],
  );
  assert.equal(
    conditionNumber([
      [1, 0],
      [0, 2],
    ]),
    2,
  );
  assert.equal(matrixDistance(null, [[1]]), 0);
  console.log("dynamic dependence tests: ok");
})();
