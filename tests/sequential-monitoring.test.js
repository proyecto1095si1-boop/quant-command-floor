"use strict";

const assert = require("node:assert/strict"),
  {
    ExperimentService,
    requestKey,
  } = require("../server/governance/experiments.js"),
  { logLoss, neweyWest } = require("../server/governance/sequential.js"),
  { testOracle } = require("./helpers/outcome-oracle.js");

const governance = {
    champion: () => ({ modelId: "consensus", version: "1", kind: "consensus" }),
    get: () => ({
      modelId: "consensus",
      version: "2",
      kind: "consensus",
      stage: "challenger",
    }),
  },
  forecast = (requestId, index, degraded = false) => {
    const outcome = index % 2;
    return {
      requestId,
      expectedOutcome: outcome,
      symbol: "BTC-USD",
      horizonMs: 1,
      regime: index % 4 < 2 ? "risk-on" : "risk-off",
      championProbability: outcome ? 0.9 : 0.1,
      challengerProbability: degraded
        ? outcome
          ? 0.1
          : 0.9
        : outcome
          ? 0.95
          : 0.05,
    };
  };

(async () => {
  assert.ok(logLoss(0.9, 1) < logLoss(0.1, 1));
  const hac = neweyWest([1, 1, 0.8, 0.8, 0.6, 0.6]);
  assert.ok(hac.lag > 0);
  assert.ok(hac.standardError >= 0);

  let now = Date.parse("2026-01-01T00:00:00.000Z");
  const events = [],
    outcomes = new Map(),
    outcomeOracle = testOracle(() => now, outcomes),
    service = new ExperimentService({
      governance,
      outcomeOracle,
      record: async (...event) => events.push(event),
      clock: () => now,
      policy: { forecastHorizonMs: 1, labelGraceMs: 0 },
    }),
    observe = async (id, input) => {
      const outcome = input.expectedOutcome;
      outcomes.set(requestKey(input.requestId), outcome);
      await service.observeForecast(id, input);
      now += 1;
      return service.labelForecast(id, {
        requestId: input.requestId,
      });
    },
    healthy = await service.start({
      modelId: "consensus",
      challengerVersion: "2",
      mode: "shadow",
    });
  for (let index = 0; index < 50; index++)
    await observe(healthy.id, forecast(`healthy-${index}`, index));
  assert.equal(service.get(healthy.id).state, "running");
  assert.ok(service.get(healthy.id).sequential.overall.mean < 0);
  assert.equal(service.get(healthy.id).sequential.breaches.length, 0);
  await assert.rejects(
    () => service.observeForecast(healthy.id, forecast("healthy-0", 0)),
    /duplicate-sequential-forecast/,
  );
  await service.stop(healthy.id, "operator", "test-complete");

  const degraded = await service.start({
    modelId: "consensus",
    challengerVersion: "2",
    mode: "canary",
    trafficPercent: 5,
  });
  let result;
  for (let index = 0; index < 60; index++) {
    result = await observe(
      degraded.id,
      forecast(`degraded-${index}`, index, true),
    );
    if (result.state === "rolled-back") break;
  }
  assert.equal(result.state, "rolled-back");
  assert.equal(result.trafficPercent, 0);
  assert.equal(result.rollback.source, "sequential-monitor");
  assert.ok(result.rollback.breaches.includes("sequential-log-loss-global"));
  assert.ok(result.sequential.overall.eValue >= 100);
  assert.ok(result.sequential.overall.statistic > 0);
  await assert.rejects(
    () => service.observeForecast(degraded.id, forecast("late", 1, true)),
    /experiment-not-running/,
  );

  const experimentEvents = events
      .filter(([stream]) => stream === "governance.experiments")
      .map(([, event]) => structuredClone(event)),
    recovered = new ExperimentService({
      governance,
      outcomeOracle,
      clock: () => now,
      policy: { forecastHorizonMs: 1, labelGraceMs: 0 },
    });
  assert.equal(recovered.recover(experimentEvents).experiments, 2);
  assert.equal(recovered.get(degraded.id).state, "rolled-back");
  assert.equal(
    recovered.get(degraded.id).sequential.overall.observations,
    result.sequential.overall.observations,
  );
  const corrupted = structuredClone(experimentEvents),
    forecastEvent = corrupted.find((event) => event.action === "forecast");
  forecastEvent.forecast.maturesAt = new Date(
    Date.parse(forecastEvent.forecast.maturesAt) + 1,
  ).toISOString();
  assert.throws(
    () =>
      new ExperimentService({
        governance,
        outcomeOracle,
        clock: () => now,
        policy: { forecastHorizonMs: 1, labelGraceMs: 0 },
      }).recover(corrupted),
    /experiment-recovery-failed/,
  );

  assert.throws(
    () =>
      new ExperimentService({
        governance,
        policy: { sequential: { alpha: 2 } },
      }),
    /invalid-sequential-policy/,
  );
  console.log("sequential monitoring tests: ok");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
