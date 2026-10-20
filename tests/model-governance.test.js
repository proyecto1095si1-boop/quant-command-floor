"use strict";

const assert = require("node:assert/strict"),
  MathModel = require("../server/governance/math.js"),
  {
    ModelGovernanceService,
    fingerprint,
  } = require("../server/governance/service.js");

const reference = Array.from(
    { length: 300 },
    (_, index) => Math.sin(index * 0.31) + Math.cos(index * 0.07) * 0.2,
  ),
  stable = reference.map((value, index) => value + Math.sin(index) * 0.005),
  shifted = reference.map((value) => value + 2),
  stableDrift = MathModel.driftReport(reference, stable),
  materialDrift = MathModel.driftReport(reference, shifted);
assert.equal(stableDrift.drifted, false);
assert.equal(materialDrift.drifted, true);
assert.ok(materialDrift.psi.value > stableDrift.psi.value);
assert.ok(materialDrift.ks.statistic > stableDrift.ks.statistic);
assert.ok(materialDrift.standardizedMeanShift > 0.5);
assert.equal(
  MathModel.populationStabilityIndex([1, 2], [1, 2], 10).available,
  false,
);
assert.equal(MathModel.kolmogorovSmirnov([], []).available, false);
assert.deepEqual(MathModel.kolmogorovSmirnov(reference, reference), {
  available: true,
  statistic: 0,
  pValue: 1,
});
assert.throws(
  () => MathModel.driftReport([1, Number.NaN], [1, 2]),
  /reference-must-be-finite/,
);
assert.equal(fingerprint({ b: 2, a: 1 }), fingerprint({ a: 1, b: 2 }));

(async () => {
  const events = [],
    governance = new ModelGovernanceService({
      record: async (...event) => events.push(event),
    }),
    v1 = await governance.register(
      {
        modelId: "portfolio-tail-risk",
        version: "1.0.0",
        kind: "mathematical",
        owner: "risk-team",
        parameters: { confidence: 0.99, lambda: 0.94 },
        artifactHash: "a".repeat(64),
      },
      "alice",
    );
  assert.equal(v1.stage, "challenger");
  assert.equal(v1.configHash.length, 64);
  const evaluation1 = await governance.evaluate(
    {
      modelId: v1.modelId,
      version: v1.version,
      reference,
      current: stable,
      metrics: {
        observations: 300,
        score: 0.8,
        coveragePValue: 0.4,
        independencePValue: 0.3,
        criticalFailures: 0,
      },
    },
    "validation-bot",
  );
  assert.equal(evaluation1.eligible, true);
  assert.equal(evaluation1.datasetHash.length, 64);
  const promoted1 = await governance.promote(
    { modelId: v1.modelId, version: v1.version, reason: "baseline validated" },
    { primary: "alice", secondary: "bob" },
  );
  assert.equal(promoted1.model.stage, "champion");
  assert.equal(promoted1.paperOnly, true);
  await assert.rejects(
    () =>
      governance.promote(
        { modelId: v1.modelId, version: v1.version },
        { primary: "alice", secondary: "bob" },
      ),
    /model-is-not-a-challenger/,
  );

  const v2 = await governance.register({
    modelId: v1.modelId,
    version: "2.0.0",
    kind: "mathematical",
    parameters: { confidence: 0.995, lambda: 0.97 },
  });
  await governance.evaluate({
    modelId: v2.modelId,
    version: v2.version,
    reference,
    current: stable,
    metrics: {
      observations: 300,
      score: 0.7,
      coveragePValue: 0.4,
      independencePValue: 0.3,
    },
  });
  await assert.rejects(
    () =>
      governance.promote(
        { modelId: v2.modelId, version: v2.version },
        { primary: "alice", secondary: "bob" },
      ),
    /challenger-underperforms-champion/,
  );

  const drifted = await governance.register({
    modelId: "stress-risk",
    version: "1.0.0",
    kind: "mathematical",
    parameters: { impactCoefficient: 0.5 },
  });
  const driftedEvaluation = await governance.evaluate({
    modelId: drifted.modelId,
    version: drifted.version,
    reference,
    current: shifted,
    metrics: {
      observations: 300,
      score: 0.9,
      coveragePValue: 0.5,
      independencePValue: 0.5,
    },
  });
  assert.equal(driftedEvaluation.eligible, false);
  assert.equal(driftedEvaluation.checks.drift, false);
  const exaggerated = await governance.register({
    modelId: "short-sample",
    version: "1",
    kind: "mathematical",
  });
  const shortEvaluation = await governance.evaluate({
    modelId: exaggerated.modelId,
    version: exaggerated.version,
    reference: reference.slice(0, 20),
    current: stable.slice(0, 20),
    metrics: {
      observations: 10000,
      score: 1,
      coveragePValue: 1,
      independencePValue: 1,
    },
  });
  assert.equal(shortEvaluation.metrics.observations, 20);
  assert.equal(shortEvaluation.checks.observations, false);
  await assert.rejects(
    () =>
      governance.promote(
        { modelId: drifted.modelId, version: drifted.version },
        { primary: "alice", secondary: "bob" },
      ),
    /model-not-eligible/,
  );
  await assert.rejects(
    () =>
      governance.promote(
        { modelId: v1.modelId, version: v1.version },
        { primary: "same", secondary: "same" },
      ),
    /independent-second-approval/,
  );
  await assert.rejects(
    () =>
      governance.register({
        modelId: v1.modelId,
        version: v1.version,
        kind: "mathematical",
      }),
    /model-version-exists/,
  );
  await assert.rejects(
    () =>
      governance.register({
        modelId: "bad-hash",
        version: "1",
        kind: "ai",
        artifactHash: "not-a-hash",
      }),
    /invalid-model-artifact-hash/,
  );
  await assert.rejects(
    () =>
      governance.register({
        modelId: "ai-reader",
        version: "1",
        kind: "ai",
        parameters: {
          model: "local-model",
          temperature: 0.1,
          maxTokens: 2048,
          promptVersion: "v1",
          apiKey: "forbidden",
        },
      }),
    /parameters-contain-secret/,
  );
  await assert.rejects(
    () =>
      governance.register({
        modelId: "ai-reader",
        version: "1",
        kind: "ai",
        parameters: { model: "local-model", temperature: 3 },
      }),
    /incomplete-ai-model-parameters/,
  );
  const ai = await governance.register({
    modelId: "ai-reader",
    version: "1",
    kind: "ai",
    parameters: {
      model: "local-model",
      temperature: 0.1,
      maxTokens: 2048,
      promptVersion: "v1",
    },
  });
  assert.equal(ai.parameters.temperature, 0.1);
  assert.equal(governance.status().champions[0].version, "1.0.0");
  assert.equal(governance.list().paperOnly, true);
  assert.equal(events[0][0], "governance.models");
  const recovered = new ModelGovernanceService(),
    recovery = recovered.recover({
      models: events
        .filter(([stream]) => stream === "governance.models")
        .map(([, event]) => event),
      evaluations: events
        .filter(([stream]) => stream === "governance.evaluations")
        .map(([, event]) => event),
      promotions: events
        .filter(([stream]) => stream === "governance.promotions")
        .map(([, event]) => event),
    });
  assert.equal(recovery.models, governance.status().models);
  assert.deepEqual(recovered.status().champions, governance.status().champions);
  const corrupt = new ModelGovernanceService();
  assert.throws(
    () => corrupt.recover({ promotions: [{ modelId: "missing" }] }),
    /model-governance-recovery-failed/,
  );
  await assert.rejects(
    () => corrupt.register({ modelId: "x", version: "1", kind: "math" }),
    /model-governance-recovery-failed/,
  );
  console.log("model governance tests: ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
