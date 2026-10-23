"use strict";

const assert = require("node:assert/strict"),
  {
    IntelligenceGovernanceService,
  } = require("../server/governance/intelligence.js");

(async () => {
  const state = {
      id: "experiment-1",
      modelId: "intel-btc",
      challengerVersion: "2",
      state: "running",
      forecasts: [],
      labels: { pending: 0, resolved: 0 },
      graduation: null,
    },
    calls = [],
    experiments = {
      get: () => structuredClone(state),
      observeForecast: async (id, input) => {
        calls.push(["forecast", id, input]);
        state.forecasts.push({ requestId: input.requestId });
        state.labels.pending++;
        return structuredClone(state);
      },
      labelForecast: async (id, input, actor) => {
        calls.push(["resolve", id, input, actor]);
        state.labels.pending--;
        state.labels.resolved++;
        return structuredClone(state);
      },
      graduate: async (id, actor, reason, approvals) => {
        calls.push(["graduate", id, actor, reason, approvals]);
        state.state = "graduated";
        state.graduation = {
          hash: "a".repeat(64),
          modelId: state.modelId,
          challengerVersion: state.challengerVersion,
        };
        return { artifact: structuredClone(state.graduation) };
      },
    },
    governance = {
      promote: async (input, approvals) => {
        calls.push(["activate", input, approvals]);
        return {
          model: { modelId: input.modelId, version: input.version },
          promotion: { graduationId: state.graduation.hash },
        };
      },
    },
    service = new IntelligenceGovernanceService({ governance, experiments });
  service.runs.push({
    id: "run-1",
    state: "experiment-approved",
    approvalId: "approval-1",
  });
  service.approvals.push({
    id: "approval-1",
    runId: "run-1",
    experimentId: state.id,
    modelId: state.modelId,
    version: state.challengerVersion,
  });

  await assert.rejects(
    () =>
      service.activate(
        { experimentId: state.id },
        { primary: "risk-a", secondary: "risk-b" },
      ),
    /intelligence-experiment-graduation-required/,
  );
  const forecast = await service.forecast({
    experimentId: state.id,
    requestId: "request-1",
    symbol: "BTC-USD",
    horizonMs: 60000,
    regime: "risk-on",
    championProbability: 0.5,
    challengerProbability: 0.7,
  });
  assert.equal(forecast.paperOnly, true);
  assert.equal(calls[0][2].challengerProbability, 0.7);
  await assert.rejects(
    () =>
      service.resolve({
        experimentId: state.id,
        requestId: "request-1",
        outcome: 1,
      }),
    /manual-outcome-not-allowed/,
  );
  const resolved = await service.resolve(
    { experimentId: state.id, requestId: "request-1" },
    "oracle-worker",
  );
  assert.equal(resolved.experiment.labels.resolved, 1);
  const graduated = await service.graduate(
    { experimentId: state.id, reason: "paper evidence complete" },
    { primary: "risk-a", secondary: "risk-b" },
    "director",
  );
  assert.equal(graduated.runId, "run-1");
  const activated = await service.activate(
    { experimentId: state.id },
    { primary: "risk-c", secondary: "risk-d" },
  );
  assert.equal(activated.paperOnly, true);
  assert.equal(activated.activation, "paper-champion");
  assert.equal(activated.graduationHash, "a".repeat(64));
  assert.equal(service.status().experiments[0].labels.resolved, 1);

  state.modelId = "other-model";
  assert.throws(
    () => service.approvedExperiment(state.id),
    /intelligence-experiment-binding-mismatch/,
  );
  console.log("intelligence lifecycle tests: ok");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
