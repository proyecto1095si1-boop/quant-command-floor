"use strict";

const assert = require("node:assert/strict"),
  crypto = require("node:crypto"),
  {
    ModelGovernanceService,
    fingerprint,
  } = require("../server/governance/service.js"),
  { ExperimentService } = require("../server/governance/experiments.js"),
  {
    CalibrationGovernanceService,
    groundTruth,
  } = require("../server/governance/calibration.js"),
  {
    normalizeObservations,
  } = require("../server/research/consensus-calibration.js");

function observations(length = 125) {
  return Array.from({ length }, (_, index) => {
    const outcome = index % 10 < 6 ? 1 : 0,
      direction = outcome ? 1 : -1,
      regime = index % 20 < 10 ? "risk_on_low_vol" : "risk_off_crisis";
    return {
      timestamp: new Date(Date.UTC(2025, 0, 1, 0, index)).toISOString(),
      asset: "BTC-USD",
      regime,
      regimeProbability: 0.95,
      outcome,
      signals: [
        { agent: "Technical", signal: direction * 0.9, confidence: 0.95 },
        {
          agent: "Market Structure",
          signal: direction * 0.85,
          confidence: 0.9,
        },
        { agent: "Whale", signal: direction * 0.7, confidence: 0.8 },
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
      sourceHashes: [fingerprint({ source: "paper-market-data" })],
      groundTruthHash: groundTruth(normalized),
      parentDatasetHashes: [],
    },
    casesHash = fingerprint(normalized),
    manifestHash = fingerprint(manifest),
    attestationHash = fingerprint({
      datasetId: "consensus-btc",
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
    datasetId: "consensus-btc",
    version: "1.0.0",
    description: "BTC paper consensus calibration",
    observations: rows,
    split: {
      holdoutObservations: 30,
      purgeObservations: 5,
    },
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
    record = async (stream, event) => events.push([stream, event]),
    governance = new ModelGovernanceService({ record }),
    experiments = new ExperimentService({ governance, record }),
    service = new CalibrationGovernanceService({
      governance,
      experiments,
      record,
      trustedReviewers: new Map([["risk-reviewer", publicKey]]),
    }),
    datasetInput = signedDataset(privateKey, observations()),
    dataset = await service.registerDataset(datasetInput, "researcher");
  assert.equal(dataset.holdoutState, "sealed");
  assert.equal(dataset.split.development.observations, 90);
  assert.equal(dataset.split.purge.observations, 5);
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
      grid: {
        decay: [0.9, 0.94],
        baseShrinkage: [0.1],
        minimumAbsoluteSignal: [0.1, 0.2],
        minimumDirectionalProbability: [0.55],
      },
      dependencePolicy: { minimumObservations: 8 },
      consensusPolicy: {
        minimumEffectiveAgents: 1,
        maximumWeightShare: 1,
        credibleZ: 0.1,
      },
    },
    "researcher",
  );
  assert.equal(run.paperOnly, true);
  assert.equal(run.eligible, true);
  assert.equal(run.holdout.overall.observations, 30);
  assert.ok(Object.values(run.checks).every(Boolean));
  assert.match(run.reproducibilityHash, /^[a-f0-9]{64}$/);
  assert.equal(service.status().sealedHoldouts, 0);
  await assert.rejects(
    () =>
      service.evaluate({
        datasetId: dataset.datasetId,
        datasetVersion: dataset.version,
      }),
    /calibration-holdout-already-consumed/,
  );

  await governance.register({
    modelId: "consensus-btc",
    version: "1.0.0",
    kind: "consensus",
    parameters: { baseline: true },
    artifactHash: fingerprint({ baseline: true }),
  });
  await governance.evaluate({
    modelId: "consensus-btc",
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
    { modelId: "consensus-btc", version: "1.0.0" },
    { primary: "risk-a", secondary: "risk-b" },
  );
  await governance.register({
    modelId: "consensus-btc",
    version: "2.0.0",
    kind: "consensus",
    parameters: run.calibration.recommendation.parameters,
    artifactHash: run.reproducibilityHash,
  });

  await assert.rejects(
    () =>
      service.approveExperiment(
        {
          runId: run.id,
          modelId: "consensus-btc",
          version: "2.0.0",
          mode: "canary",
          trafficPercent: 10,
        },
        { primary: "risk-a", secondary: "risk-b" },
      ),
    /invalid-calibration-canary-traffic/,
  );
  await assert.rejects(
    () =>
      service.approveExperiment(
        {
          runId: run.id,
          modelId: "consensus-btc",
          version: "2.0.0",
        },
        { primary: "same", secondary: "same" },
      ),
    /independent-second-approval-required/,
  );
  const approved = await service.approveExperiment(
    {
      runId: run.id,
      modelId: "consensus-btc",
      version: "2.0.0",
      mode: "shadow",
      trafficPercent: 0,
    },
    { primary: "risk-a", secondary: "risk-b" },
    "director",
  );
  assert.equal(approved.paperOnly, true);
  assert.equal(approved.experiment.mode, "shadow");
  assert.equal(approved.experiment.trafficPercent, 0);
  assert.equal(governance.get("consensus-btc", "2.0.0").stage, "challenger");
  assert.equal(service.status().approvals, 1);
  await assert.rejects(
    () =>
      service.approveExperiment(
        {
          runId: run.id,
          modelId: "consensus-btc",
          version: "2.0.0",
        },
        { primary: "risk-a", secondary: "risk-b" },
      ),
    /calibration-run-already-approved/,
  );

  const tampered = signedDataset(privateKey, observations());
  tampered.manifest.groundTruthHash = fingerprint({ wrong: true });
  await assert.rejects(
    () => service.registerDataset({ ...tampered, version: "1.0.1" }),
    /invalid-provenance-signature/,
  );
  assert.ok(
    events.some(([stream]) => stream === "governance.calibration-datasets"),
  );
  assert.ok(
    events.some(([stream]) => stream === "governance.calibration-runs"),
  );
  assert.ok(
    events.some(([stream]) => stream === "governance.calibration-approvals"),
  );
  const recovered = new CalibrationGovernanceService({
      governance,
      experiments,
      trustedReviewers: new Map([["risk-reviewer", publicKey]]),
    }),
    recovery = recovered.recover({
      datasets: events
        .filter(([stream]) => stream === "governance.calibration-datasets")
        .map(([, event]) => structuredClone(event)),
      runs: events
        .filter(([stream]) => stream === "governance.calibration-runs")
        .map(([, event]) => structuredClone(event)),
      approvals: events
        .filter(([stream]) => stream === "governance.calibration-approvals")
        .map(([, event]) => structuredClone(event)),
    });
  assert.deepEqual(recovery, {
    recovered: true,
    datasets: 1,
    runs: 1,
    approvals: 1,
  });
  assert.equal(recovered.status().sealedHoldouts, 0);
  const corruptedRuns = events
    .filter(([stream]) => stream === "governance.calibration-runs")
    .map(([, event]) => structuredClone(event));
  corruptedRuns[0].holdoutHash = fingerprint({ tampered: true });
  assert.throws(
    () =>
      new CalibrationGovernanceService({
        governance,
        experiments,
        trustedReviewers: new Map([["risk-reviewer", publicKey]]),
      }).recover({
        datasets: events
          .filter(([stream]) => stream === "governance.calibration-datasets")
          .map(([, event]) => structuredClone(event)),
        runs: corruptedRuns,
      }),
    /calibration-governance-recovery-failed/,
  );
  console.log("calibration governance tests: ok");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
