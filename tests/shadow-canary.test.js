"use strict";

const assert = require("node:assert/strict"),
  { ModelGovernanceService } = require("../server/governance/service.js"),
  {
    ExperimentService,
    assignmentFraction,
    cleanOutcome,
    summarize,
  } = require("../server/governance/experiments.js");

const reference = Array.from({ length: 20 }, (_, index) => Math.sin(index)),
  current = reference.map(
    (value, index) => value + Math.sin(index * 2) * 0.001,
  );

(async () => {
  const governance = new ModelGovernanceService({
      policy: { minimumObservations: 20 },
    }),
    champion = await governance.register({
      modelId: "macro-reader",
      version: "1.0.0",
      kind: "ai",
      parameters: {
        model: "local-a",
        temperature: 0,
        maxTokens: 1000,
        promptVersion: "v1",
      },
    });
  await governance.evaluate({
    modelId: champion.modelId,
    version: champion.version,
    reference,
    current,
    metrics: {
      observations: 20,
      score: 0.8,
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
      version: "2.0.0",
      kind: "ai",
      parameters: {
        model: "local-b",
        temperature: 0.1,
        maxTokens: 1200,
        promptVersion: "v2",
      },
    }),
    events = [],
    service = new ExperimentService({
      governance,
      record: async (...event) => events.push(event),
      policy: { minimumObservations: 3 },
    }),
    experiment = await service.start(
      {
        modelId: champion.modelId,
        challengerVersion: challenger.version,
        mode: "canary",
        trafficPercent: 10,
      },
      "carol",
    );
  assert.equal(experiment.state, "running");
  assert.equal(experiment.paperOnly, true);
  const assignment = service.assign(experiment.id, "request-1"),
    repeated = service.assign(experiment.id, "request-1");
  assert.deepEqual(assignment, repeated);
  assert.equal(assignment.paperOnly, true);
  assert.equal(assignment.requestKey.length, 64);
  assert.equal("requestId" in assignment, false);
  assert.ok(assignmentFraction(experiment.id, "request-1") >= 0);
  await assert.rejects(
    () =>
      service.start({
        modelId: champion.modelId,
        challengerVersion: challenger.version,
      }),
    /model-experiment-already-running/,
  );

  const inputHash = "f".repeat(64),
    good = (requestId, policyViolation = false) => ({
      requestId,
      inputHash,
      champion: {
        outputHash: "a".repeat(64),
        label: "BULL",
        score: 0.7,
        latencyMs: 100,
      },
      challenger: {
        outputHash: "b".repeat(64),
        label: "BULL",
        score: 0.72,
        latencyMs: 110,
        schemaValid: true,
        grounded: true,
        policyViolation,
      },
    });
  await service.observe(experiment.id, good("one"));
  await assert.rejects(
    () =>
      service.observe(experiment.id, {
        requestId: "missing-outcomes",
        inputHash,
      }),
    /experiment-outcomes-required/,
  );
  await assert.rejects(
    () => service.observe(experiment.id, good("one")),
    /duplicate-experiment-observation/,
  );
  await service.observe(experiment.id, good("two"));
  const rolledBack = await service.observe(experiment.id, good("three", true));
  assert.equal(rolledBack.state, "rolled-back");
  assert.equal(rolledBack.trafficPercent, 0);
  assert.deepEqual(rolledBack.rollback.breaches, ["policy-violation"]);
  assert.equal(
    service.assign(experiment.id, "after").challengerSelected,
    false,
  );
  await assert.rejects(
    () => service.observe(experiment.id, good("four")),
    /experiment-not-running/,
  );

  const listed = service.list();
  assert.equal(listed.paperOnly, true);
  assert.equal(listed.experiments[0].observations, 3);
  const experimentEvents = events
      .filter(([stream]) => stream === "governance.experiments")
      .map(([, event]) => event),
    recovered = new ExperimentService({ governance });
  assert.equal(recovered.recover(experimentEvents).experiments, 1);
  assert.equal(recovered.list().experiments[0].state, "rolled-back");
  const corrupt = new ExperimentService({ governance });
  assert.throws(
    () => corrupt.recover([{ action: "observe", experimentId: "missing" }]),
    /experiment-recovery-failed/,
  );

  const shadow = await service.start({
    modelId: champion.modelId,
    challengerVersion: challenger.version,
    mode: "shadow",
  });
  assert.equal(
    service.assign(shadow.id, "shadow-request").challengerSelected,
    false,
  );
  const stopped = await service.stop(shadow.id, "alice", "enough evidence");
  assert.equal(stopped.state, "stopped");
  await assert.rejects(() => service.stop(shadow.id), /experiment-not-running/);

  const numericSummary = summarize([
    {
      champion: cleanOutcome({ value: -1, latencyMs: 10 }),
      challenger: cleanOutcome({ value: 1, latencyMs: 20 }),
    },
  ]);
  assert.equal(numericSummary.meanAbsoluteDelta, 2);
  assert.equal(numericSummary.signDisagreementRate, 1);
  assert.equal(numericSummary.latencyP95Ratio, 2);
  assert.equal(cleanOutcome({ value: null }).value, null);
  assert.throws(
    () => cleanOutcome({ value: Number.NaN }),
    /invalid-experiment-outcome/,
  );
  assert.throws(
    () => cleanOutcome({ outputHash: "raw-output" }),
    /invalid-experiment-output-hash/,
  );
  console.log("shadow canary tests: ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
