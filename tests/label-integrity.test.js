"use strict";

const assert = require("node:assert/strict"),
  {
    ExperimentService,
    requestKey,
  } = require("../server/governance/experiments.js"),
  { validateRevisionChain } = require("../server/governance/labels.js"),
  { testOracle } = require("./helpers/outcome-oracle.js");

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
    outcomes = new Map([[requestKey("prediction-1"), 1]]),
    outcomeOracle = testOracle(() => now, outcomes),
    service = new ExperimentService({
      governance,
      outcomeOracle,
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
      symbol: "BTC-USD",
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
      }),
    /manual-outcome-not-allowed/,
  );
  await assert.rejects(
    () =>
      service.labelForecast(experiment.id, {
        requestId: prediction.requestId,
      }),
    /oracle-outcome-not-final/,
  );
  now += 1_000;
  await assert.rejects(
    () =>
      service.labelForecast(experiment.id, {
        requestId: prediction.requestId,
        horizonMs: 2_000,
      }),
    /label-horizon-mismatch/,
  );

  state = await service.labelForecast(experiment.id, {
    requestId: prediction.requestId,
    horizonMs: 1_000,
  });
  assert.equal(state.labels.labeled, 1);
  assert.equal(state.sequential.overall.observations, 1);
  assert.equal(validateRevisionChain(state.forecasts[0]), true);
  assert.equal(state.forecasts[0].activeLabel.evidence.outcome, 1);
  now += 1;
  outcomes.set(requestKey(prediction.requestId), 0);
  await assert.rejects(
    () =>
      service.labelForecast(
        experiment.id,
        {
          requestId: prediction.requestId,
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

  await assert.rejects(
    () =>
      service.observeForecast(experiment.id, {
        ...prediction,
        requestId: "different-target",
        symbol: "ETH-USD",
      }),
    /experiment-target-mismatch/,
  );

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
      }),
    /censored-forecast-is-terminal/,
  );

  const eventRows = events
      .filter(([stream]) => stream === "governance.experiments")
      .map(([, event]) => event),
    recovered = new ExperimentService({
      governance,
      outcomeOracle,
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
        outcomeOracle,
        clock: () => now,
        policy: { forecastHorizonMs: 1_000, labelGraceMs: 500 },
      }).recover(tampered),
    /experiment-recovery-failed/,
  );
  const poisonedAnchor = structuredClone(eventRows),
    forecastEvent = poisonedAnchor.find((event) => event.action === "forecast");
  forecastEvent.forecast.oracleAnchor.observations[0].price *= 2;
  assert.throws(
    () =>
      new ExperimentService({
        governance,
        outcomeOracle,
        clock: () => now,
        policy: { forecastHorizonMs: 1_000, labelGraceMs: 500 },
      }).recover(poisonedAnchor),
    /experiment-recovery-failed/,
  );
  console.log("label integrity tests: ok");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
