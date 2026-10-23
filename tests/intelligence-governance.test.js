"use strict";

const assert = require("node:assert/strict"),
  crypto = require("node:crypto"),
  {
    IntelligenceGovernanceService,
    groundTruth,
  } = require("../server/governance/intelligence.js"),
  {
    ModelGovernanceService,
    fingerprint,
  } = require("../server/governance/service.js"),
  { ExperimentService } = require("../server/governance/experiments.js"),
  { normalizeObservations } = require("../server/intelligence/calibration.js"),
  { createGateway } = require("../server/gateway.js");

function observations(length = 125) {
  const start = Date.parse("2025-01-01T00:00:00Z"),
    day = 86400000;
  return Array.from({ length }, (_, index) => {
    const direction = index % 2 ? 1 : -1;
    return {
      timestamp: new Date(start + index * 2 * day).toISOString(),
      outcomeAt: new Date(start + index * 2 * day + day).toISOString(),
      asset: "BTC",
      outcome: direction > 0 ? 1 : 0,
      nodes: [
        { id: "macro", signal: direction * 0.4, confidence: 0.7 },
        { id: "news", signal: direction * 0.6, confidence: 0.8 },
        { id: "market", signal: direction * 0.9, confidence: 0.95 },
      ],
    };
  });
}

function signedDataset(privateKey, rows) {
  const normalized = normalizeObservations(rows),
    manifest = {
      schemaVersion: 1,
      owner: "quant-research",
      license: "internal",
      languages: ["numeric"],
      jurisdictions: ["global"],
      createdAt: "2025-01-01T00:00:00.000Z",
      collectionMethod: "paper-replay",
      samplingMethod: "chronological",
      sourceHashes: [fingerprint({ source: "intelligence-snapshots" })],
      groundTruthHash: groundTruth(normalized),
      parentDatasetHashes: [],
    },
    casesHash = fingerprint(normalized),
    manifestHash = fingerprint(manifest),
    attestationHash = fingerprint({
      datasetId: "intel-btc",
      version: "1.0.0",
      casesHash,
      manifestHash,
    }),
    signature = crypto.sign(
      null,
      Buffer.from(attestationHash, "hex"),
      privateKey,
    );
  return {
    datasetId: "intel-btc",
    version: "1.0.0",
    description: "BTC signed intelligence calibration",
    observations: rows,
    split: { holdoutObservations: 30, purgeObservations: 5 },
    manifest,
    attestation: {
      reviewerId: "risk-reviewer",
      algorithm: "Ed25519",
      signature: signature.toString("base64"),
    },
  };
}

(async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519"),
    events = [],
    record = async (stream, event) =>
      events.push([stream, structuredClone(event)]),
    defaultGovernance = new ModelGovernanceService(),
    governance = new ModelGovernanceService({
      record,
      policy: { requiredGraduationKinds: [] },
    }),
    experiments = new ExperimentService({ governance, record }),
    service = new IntelligenceGovernanceService({
      governance,
      experiments,
      record,
      trustedReviewers: new Map([["risk-reviewer", publicKey]]),
    }),
    input = signedDataset(privateKey, observations()),
    dataset = await service.registerDataset(input, "researcher");
  assert.ok(
    defaultGovernance.policy.requiredGraduationKinds.includes("intelligence"),
  );
  assert.equal(dataset.holdoutState, "sealed");
  assert.equal(dataset.split.development.observations, 90);
  assert.equal(dataset.split.holdout.observations, 30);
  assert.match(dataset.hash, /^[a-f0-9]{64}$/);

  const run = await service.evaluate(
    {
      datasetId: dataset.datasetId,
      datasetVersion: dataset.version,
      folds: {
        minimumTrainingObservations: 40,
        testObservations: 10,
        purgeObservations: 2,
        embargoObservations: 2,
        minimumFolds: 3,
      },
    },
    "researcher",
  );
  assert.equal(run.paperOnly, true);
  assert.equal(run.eligible, true);
  assert.equal(run.holdout.observations, 30);
  assert.ok(Object.values(run.checks).every(Boolean));
  assert.equal(run.calibration.recommendation.autoApply, false);
  assert.match(run.reproducibilityHash, /^[a-f0-9]{64}$/);
  await assert.rejects(
    () =>
      service.evaluate({
        datasetId: dataset.datasetId,
        datasetVersion: dataset.version,
      }),
    /intelligence-holdout-already-consumed/,
  );

  await governance.register({
    modelId: "intel-hub-btc",
    version: "1.0.0",
    kind: "intelligence",
    parameters: { baseline: true },
    artifactHash: fingerprint({ baseline: true }),
  });
  await governance.evaluate({
    modelId: "intel-hub-btc",
    version: "1.0.0",
    reference: Array(250).fill(0.5),
    current: Array(250).fill(0.5),
    metrics: {
      observations: 250,
      score: 0.8,
      coveragePValue: 0.9,
      independencePValue: 0.9,
      criticalFailures: 0,
    },
  });
  await governance.promote(
    { modelId: "intel-hub-btc", version: "1.0.0" },
    { primary: "risk-a", secondary: "risk-b" },
  );
  await governance.register({
    modelId: "intel-hub-btc",
    version: "2.0.0",
    kind: "intelligence",
    parameters: run.calibration.recommendation.parameters,
    artifactHash: run.reproducibilityHash,
  });

  await assert.rejects(
    () =>
      service.approveExperiment(
        {
          runId: run.id,
          modelId: "intel-hub-btc",
          version: "2.0.0",
          mode: "canary",
          trafficPercent: 10,
        },
        { primary: "risk-a", secondary: "risk-b" },
      ),
    /invalid-intelligence-canary-traffic/,
  );
  await assert.rejects(
    () =>
      service.approveExperiment(
        { runId: run.id, modelId: "intel-hub-btc", version: "2.0.0" },
        { primary: "same", secondary: "same" },
      ),
    /independent-second-approval-required/,
  );
  const approved = await service.approveExperiment(
    {
      runId: run.id,
      modelId: "intel-hub-btc",
      version: "2.0.0",
      mode: "shadow",
      trafficPercent: 0,
    },
    { primary: "risk-a", secondary: "risk-b" },
    "director",
  );
  assert.equal(approved.experiment.mode, "shadow");
  assert.equal(approved.experiment.trafficPercent, 0);
  assert.equal(service.status().approvals, 1);

  const datasetEvent = events.find(
      ([stream]) => stream === "governance.intelligence-datasets",
    )[1],
    runEvent = events.find(
      ([stream]) => stream === "governance.intelligence-runs",
    )[1],
    approvalEvent = events.find(
      ([stream]) => stream === "governance.intelligence-approvals",
    )[1],
    restored = new IntelligenceGovernanceService({
      governance,
      experiments,
      trustedReviewers: new Map([["risk-reviewer", publicKey]]),
    }),
    recovery = restored.recover({
      datasets: [datasetEvent],
      runs: [runEvent],
      approvals: [approvalEvent],
    });
  assert.deepEqual(recovery, {
    recovered: true,
    datasets: 1,
    runs: 1,
    approvals: 1,
  });
  assert.equal(restored.status().sealedHoldouts, 0);
  const tampered = structuredClone(runEvent);
  tampered.holdout.logLoss = 0;
  assert.throws(
    () =>
      new IntelligenceGovernanceService({
        governance,
        experiments,
        trustedReviewers: new Map([["risk-reviewer", publicKey]]),
      }).recover({ datasets: [datasetEvent], runs: [tampered] }),
    /intelligence-governance-recovery-failed/,
  );
  const rewrittenSplit = structuredClone(datasetEvent);
  rewrittenSplit.split.development.end--;
  rewrittenSplit.split.development.observations--;
  rewrittenSplit.splitHash = fingerprint(rewrittenSplit.split);
  rewrittenSplit.hash = fingerprint({
    datasetId: rewrittenSplit.datasetId,
    version: rewrittenSplit.version,
    observationsHash: rewrittenSplit.observationsHash,
    splitHash: rewrittenSplit.splitHash,
    manifestHash: rewrittenSplit.manifestHash,
    attestationHash: rewrittenSplit.attestationHash,
  });
  assert.throws(
    () =>
      new IntelligenceGovernanceService({
        governance,
        experiments,
        trustedReviewers: new Map([["risk-reviewer", publicKey]]),
      }).recover({ datasets: [rewrittenSplit] }),
    /intelligence-governance-recovery-failed/,
  );

  const gateway = createGateway({ intelligenceGovernance: restored }),
    address = await gateway.listen(0),
    response = await fetch(
      `http://127.0.0.1:${address.port}/v1/governance/intelligence`,
    );
  try {
    assert.equal(response.status, 200);
    assert.equal((await response.json()).paperOnly, true);
  } finally {
    await gateway.close();
  }

  console.log("intelligence governance tests: ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
