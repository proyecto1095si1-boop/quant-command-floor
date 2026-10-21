"use strict";

const assert = require("node:assert/strict"),
  { ModelGovernanceService } = require("../server/governance/service.js"),
  { ExperimentService } = require("../server/governance/experiments.js");

(async () => {
  const events = [],
    record = async (...event) => events.push(event),
    governance = new ModelGovernanceService({
      record,
      policy: { minimumObservations: 20 },
    }),
    reference = Array.from({ length: 20 }, (_, index) => index / 20),
    current = reference.map((value) => value + 0.001),
    champion = await governance.register({
      modelId: "consensus-btc",
      version: "1",
      kind: "consensus",
      parameters: { decay: 0.94 },
    });
  await governance.evaluate({
    modelId: champion.modelId,
    version: champion.version,
    reference,
    current,
    metrics: {
      observations: 20,
      score: 0.7,
      coveragePValue: 0.5,
      independencePValue: 0.5,
    },
  });
  await governance.promote(
    { modelId: champion.modelId, version: champion.version },
    { primary: "alice", secondary: "bob" },
  );
  const challenger = await governance.register({
    modelId: champion.modelId,
    version: "2",
    kind: "consensus",
    parameters: { decay: 0.9 },
  });
  await governance.evaluate({
    modelId: challenger.modelId,
    version: challenger.version,
    reference,
    current,
    metrics: {
      observations: 20,
      score: 0.8,
      coveragePValue: 0.5,
      independencePValue: 0.5,
    },
  });
  await assert.rejects(
    () =>
      governance.promote(
        { modelId: challenger.modelId, version: challenger.version },
        { primary: "alice", secondary: "bob" },
      ),
    /experiment-graduation-required/,
  );

  let now = Date.parse("2026-01-01T00:00:00.000Z");
  const experiments = new ExperimentService({
      governance,
      record,
      clock: () => now,
      policy: {
        minimumObservations: 20,
        forecastHorizonMs: 1,
        labelGraceMs: 0,
        sequential: {
          targetImprovement: 2,
          graduationMinimumObservations: 40,
          graduationMinimumRegimeObservations: 20,
        },
      },
    }),
    experiment = await experiments.start({
      modelId: challenger.modelId,
      challengerVersion: challenger.version,
      mode: "canary",
      trafficPercent: 5,
    }),
    hash = "a".repeat(64);
  await assert.rejects(
    () =>
      experiments.graduate(experiment.id, "director", "", {
        primary: "alice",
        secondary: "bob",
      }),
    /experiment-not-eligible-for-graduation/,
  );
  for (let index = 0; index < 50; index++) {
    const outcome = index % 2,
      regime = index % 4 < 2 ? "risk-on" : "risk-off";
    await experiments.observe(experiment.id, {
      requestId: `operational-${index}`,
      inputHash: hash,
      champion: { value: 0.5, latencyMs: 100 },
      challenger: {
        value: 0.5,
        latencyMs: 90,
        schemaValid: true,
        grounded: true,
      },
    });
    await experiments.observeForecast(experiment.id, {
      requestId: `forecast-${index}`,
      regime,
      horizonMs: 1,
      championProbability: outcome ? 0.01 : 0.99,
      challengerProbability: outcome ? 0.99 : 0.01,
    });
    now += 1;
    await experiments.labelForecast(experiment.id, {
      requestId: `forecast-${index}`,
      outcome,
      outcomeAt: new Date(now).toISOString(),
    });
  }
  const graduation = await experiments.graduate(
    experiment.id,
    "director",
    "non-inferiority-complete",
    { primary: "alice", secondary: "bob" },
  );
  assert.equal(graduation.paperOnly, true);
  assert.equal(graduation.artifact.evidence.eligible, true);
  assert.equal(graduation.artifact.checks.operationalBreaches, true);
  assert.match(graduation.artifact.hash, /^[a-f0-9]{64}$/);
  assert.equal(experiments.get(experiment.id).state, "graduated");
  assert.equal(experiments.get(experiment.id).trafficPercent, 0);

  const promoted = await governance.promote(
    { modelId: challenger.modelId, version: challenger.version },
    { primary: "alice", secondary: "bob" },
  );
  assert.equal(promoted.model.stage, "champion");
  assert.equal(promoted.promotion.graduationId, graduation.artifact.hash);

  const streams = (name) =>
      events
        .filter(([stream]) => stream === name)
        .map(([, event]) => structuredClone(event)),
    recoveredGovernance = new ModelGovernanceService({
      policy: { minimumObservations: 20 },
    });
  const recovered = recoveredGovernance.recover({
    models: streams("governance.models"),
    evaluations: streams("governance.evaluations"),
    graduations: streams("governance.graduations"),
    promotions: streams("governance.promotions"),
  });
  assert.equal(recovered.graduations, 1);
  assert.equal(recoveredGovernance.champion("consensus-btc").version, "2");
  const recoveredExperiments = new ExperimentService({
    governance: recoveredGovernance,
    clock: () => now,
    policy: {
      minimumObservations: 20,
      forecastHorizonMs: 1,
      labelGraceMs: 0,
      sequential: {
        targetImprovement: 2,
        graduationMinimumObservations: 40,
        graduationMinimumRegimeObservations: 20,
      },
    },
  });
  assert.equal(
    recoveredExperiments.recover(streams("governance.experiments")).experiments,
    1,
  );
  assert.equal(recoveredExperiments.get(experiment.id).state, "graduated");
  console.log("experiment graduation tests: ok");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
