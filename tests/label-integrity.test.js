"use strict";

const assert = require("node:assert/strict"),
  { ExperimentService } = require("../server/governance/experiments.js"),
  { validateRevisionChain } = require("../server/governance/labels.js");

const governance = {
  champion: () => ({ modelId: "consensus", version: "1", kind: "consensus" }),
  get: () => ({
    modelId: "consensus",
    version: "2",
    kind: "consensus",
    stage: "challenger",
  }),
};

(async () => {
  let now = Date.parse("2026-01-01T00:00:00.000Z");
  const events = [],
    service = new ExperimentService({
      governance,
      clock: () => now,
      record: async (...event) => events.push(structuredClone(event)),
      policy: { forecastHorizonMs: 1_000, labelGraceMs: 500 },
    }),
    experiment = await service.start({
      modelId: "consensus",
      challengerVersion: "2",
    }),
    prediction = {
      requestId: "prediction-1",
      horizonMs: 1_000,
      regime: "risk-on",
      championProbability: 0.6,
      challengerProbability: 0.7,
    };

  await assert.rejects(
    () =>
      service.observeForecast(experiment.id, {
        ...prediction,
        requestId: "leaky-prediction",
        outcome: 1,
      }),
    /forecast-outcome-not-allowed/,
  );

  let state = await service.observeForecast(experiment.id, prediction);
  assert.equal(state.labels.pending, 1);
  assert.equal(state.sequential.overall.observations, 0);
  await assert.rejects(
    () =>
      service.labelForecast(experiment.id, {
        requestId: prediction.requestId,
        outcome: 1,
        outcomeAt: new Date(now).toISOString(),
      }),
    /label-before-horizon/,
  );

  now += 1_000;
  await assert.rejects(
    () =>
      service.labelForecast(experiment.id, {
        requestId: prediction.requestId,
        outcome: 1,
        outcomeAt: new Date(now + 1).toISOString(),
      }),
    /label-from-future/,
  );
  await assert.rejects(
    () =>
      service.labelForecast(experiment.id, {
        requestId: prediction.requestId,
        horizonMs: 2_000,
        outcome: 1,
        outcomeAt: new Date(now).toISOString(),
      }),
    /label-horizon-mismatch/,
  );

  state = await service.labelForecast(experiment.id, {
    requestId: prediction.requestId,
    horizonMs: 1_000,
    outcome: 1,
    outcomeAt: new Date(now).toISOString(),
  });
  assert.equal(state.labels.labeled, 1);
  assert.equal(state.sequential.overall.observations, 1);
  assert.equal(validateRevisionChain(state.forecasts[0]), true);
  const originalOutcomeAt = state.forecasts[0].activeLabel.outcomeAt;
  now += 1;
  await assert.rejects(
    () =>
      service.labelForecast(
        experiment.id,
        {
          requestId: prediction.requestId,
          outcome: 0,
          outcomeAt: new Date(now + 1).toISOString(),
          correctionReason: "wrong target time",
          secondApprover: "reviewer",
        },
        "operator",
      ),
    /label-from-future/,
  );
  await assert.rejects(
    () =>
      service.labelForecast(
        experiment.id,
        {
          requestId: prediction.requestId,
          outcome: 0,
          outcomeAt: new Date(now).toISOString(),
          correctionReason: "wrong target time",
          secondApprover: "reviewer",
        },
        "operator",
      ),
    /label-correction-target-mismatch/,
  );
  await assert.rejects(
    () =>
      service.labelForecast(
        experiment.id,
        {
          requestId: prediction.requestId,
          outcome: 0,
          outcomeAt: originalOutcomeAt,
          correctionReason: "source correction",
          secondApprover: "operator",
        },
        "operator",
      ),
    /label-correction-approval-required/,
  );
  state = await service.labelForecast(
    experiment.id,
    {
      requestId: prediction.requestId,
      outcome: 0,
      outcomeAt: originalOutcomeAt,
      correctionReason: "exchange corrected close",
      secondApprover: "reviewer",
    },
    "operator",
  );
  assert.equal(state.labels.corrected, 1);
  assert.equal(state.forecasts[0].revisions.length, 2);
  assert.equal(
    state.forecasts[0].revisions[1].previousHash,
    state.forecasts[0].revisions[0].hash,
  );
  assert.equal(validateRevisionChain(state.forecasts[0]), true);

  await service.observeForecast(experiment.id, {
    ...prediction,
    requestId: "prediction-2",
  });
  await assert.rejects(
    () =>
      service.graduate(experiment.id, "director", "premature", {
        primary: "alice",
        secondary: "reviewer",
      }),
    (error) =>
      error.message === "experiment-not-eligible-for-graduation" &&
      error.checks.allForecastsResolved === false,
  );
  now += 1_499;
  await assert.rejects(
    () =>
      service.censorForecast(experiment.id, {
        requestId: "prediction-2",
        reason: "feed unavailable",
      }),
    /forecast-not-censorable-yet/,
  );
  now += 1;
  state = await service.censorForecast(
    experiment.id,
    { requestId: "prediction-2", reason: "feed unavailable" },
    "operator",
  );
  assert.equal(state.labels.censored, 1);
  await assert.rejects(
    () =>
      service.graduate(experiment.id, "director", "biased sample", {
        primary: "alice",
        secondary: "reviewer",
      }),
    (error) =>
      error.message === "experiment-not-eligible-for-graduation" &&
      error.checks.censorRate === false,
  );
  await assert.rejects(
    () =>
      service.labelForecast(experiment.id, {
        requestId: "prediction-2",
        outcome: 1,
        outcomeAt: new Date(now).toISOString(),
      }),
    /censored-forecast-is-terminal/,
  );

  const eventRows = events
      .filter(([stream]) => stream === "governance.experiments")
      .map(([, event]) => event),
    recovered = new ExperimentService({
      governance,
      clock: () => now,
      policy: { forecastHorizonMs: 1_000, labelGraceMs: 500 },
    });
  assert.equal(recovered.recover(eventRows).experiments, 1);
  assert.equal(recovered.get(experiment.id).labels.corrected, 1);
  const tampered = structuredClone(eventRows);
  tampered.find((event) => event.action === "label").revision.outcome = 0;
  assert.throws(
    () =>
      new ExperimentService({
        governance,
        clock: () => now,
        policy: { forecastHorizonMs: 1_000, labelGraceMs: 500 },
      }).recover(tampered),
    /experiment-recovery-failed/,
  );
  console.log("label integrity tests: ok");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
