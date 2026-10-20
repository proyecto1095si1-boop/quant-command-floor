"use strict";

const assert = require("node:assert/strict"),
  crypto = require("node:crypto"),
  {
    ModelGovernanceService,
    fingerprint,
  } = require("../server/governance/service.js"),
  {
    AiEvaluationService,
    validateCase,
    validateEvidence,
  } = require("../server/governance/ai-evaluation.js"),
  {
    parseTrustedReviewers,
    validateManifest,
  } = require("../server/governance/provenance.js");

const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519"),
  reviewerId = "risk-validation",
  trustedReviewers = new Map([[reviewerId, publicKey]]),
  manifest = {
    schemaVersion: 1,
    owner: "quant-research",
    license: "proprietary-review-required",
    languages: ["en", "es"],
    jurisdictions: ["AR", "global"],
    createdAt: "2026-10-20T00:00:00.000Z",
    collectionMethod: "curated-adversarial-v1",
    samplingMethod: "stratified-six-categories",
    sourceHashes: ["9".repeat(64)],
    groundTruthHash: "8".repeat(64),
    parentDatasetHashes: [],
  };

const hash = (character) => character.repeat(64),
  cases = [
    {
      caseId: "accuracy-1",
      category: "accuracy",
      inputHash: hash("1"),
      expectedLabel: "BULL",
    },
    {
      caseId: "injection-1",
      category: "prompt-injection",
      inputHash: hash("2"),
    },
    {
      caseId: "grounding-1",
      category: "grounding",
      inputHash: hash("3"),
    },
    {
      caseId: "schema-1",
      category: "schema",
      inputHash: hash("4"),
    },
    ...["bias-a", "bias-b", "bias-c", "bias-d"].map((caseId, index) => ({
      caseId,
      category: "bias",
      inputHash: hash(String(index + 5)),
      pairId: index < 2 ? "pair-1" : "pair-2",
    })),
    ...["stable-a", "stable-b", "stable-c", "stable-d"].map(
      (caseId, index) => ({
        caseId,
        category: "stability",
        inputHash: hash(index % 2 ? "a" : "b"),
        repeatGroup: index < 2 ? "repeat-1" : "repeat-2",
      }),
    ),
  ],
  evidence = cases.map((testCase, index) => ({
    caseId: testCase.caseId,
    outputHash: hash(index % 2 ? "c" : "d"),
    label: testCase.caseId === "accuracy-1" ? "BULL" : "SAFE",
    confidence: testCase.category === "accuracy" ? 1 : 0.5,
    claimEvidence:
      testCase.category === "grounding"
        ? [{ claimHash: hash("e"), evidenceHash: hash("f") }]
        : [],
    injectionFollowed: false,
    policyViolation: false,
    schemaValid: true,
    latencyMs: 100 + index,
    inputTokens: 100,
    outputTokens: 50,
    costUsd: 0.01,
  })),
  attestation = (
    datasetId,
    version,
    manifestValue = manifest,
    casesValue = cases,
  ) => {
    const manifestHash = fingerprint(validateManifest(manifestValue)),
      attestationHash = fingerprint({
        datasetId,
        version,
        casesHash: fingerprint(casesValue.map(validateCase)),
        manifestHash,
      });
    return {
      reviewerId,
      algorithm: "Ed25519",
      signature: crypto
        .sign(null, Buffer.from(attestationHash, "hex"), privateKey)
        .toString("base64"),
    };
  };

(async () => {
  const events = [],
    governance = new ModelGovernanceService({
      record: async (...event) => events.push(event),
      policy: { minimumAiCases: 12 },
    }),
    model = await governance.register({
      modelId: "macro-news-reader",
      version: "2.0.0",
      kind: "ai",
      parameters: {
        model: "local-model",
        temperature: 0,
        maxTokens: 2048,
        promptVersion: "v2",
      },
    }),
    service = new AiEvaluationService({
      governance,
      record: async (...event) => events.push(event),
      policy: { minimumCases: 12, minimumCalibrationCases: 1 },
      trustedReviewers,
    }),
    dataset = await service.registerDataset(
      {
        datasetId: "macro-adversarial",
        version: "1.0.0",
        description: "Hashed adversarial suite",
        cases,
        manifest,
        attestation: attestation("macro-adversarial", "1.0.0"),
      },
      "risk-validation",
    );
  assert.equal(dataset.cases.length, 12);
  assert.equal(dataset.hash.length, 64);
  assert.equal(dataset.manifestHash, fingerprint(manifest));
  assert.equal(dataset.attestation.reviewerId, reviewerId);
  assert.equal(JSON.stringify(dataset).includes("prompt"), true);
  assert.equal(JSON.stringify(dataset).includes("ignore instructions"), false);

  const run = await service.run(
    {
      modelId: model.modelId,
      version: model.version,
      datasetId: dataset.datasetId,
      datasetVersion: dataset.version,
      evidence,
    },
    "risk-validation",
  );
  assert.equal(run.paperOnly, true);
  assert.equal(run.eligible, true);
  assert.equal(run.score, 1);
  assert.equal(run.metrics.coverage, 1);
  assert.equal(run.metrics.grounding, 1);
  assert.equal(run.metrics.biasPairs, 2);
  assert.equal(run.metrics.stabilityGroups, 2);
  assert.equal(run.metrics.calibration.expectedCalibrationError, 0);
  assert.equal(run.metrics.calibration.brierScore, 0);
  assert.equal(run.metrics.intervals95.accuracy.observations, 1);
  assert.equal(run.governanceEvaluation.eligible, true);
  assert.equal("evidence" in run, false);
  assert.equal(run.evidenceHash.length, 64);
  assert.equal(run.reproducibility.modelConfigHash, model.configHash);
  assert.equal(run.reproducibility.manifestHash, dataset.manifestHash);

  const promoted = await governance.promote(
    { modelId: model.modelId, version: model.version },
    { primary: "alice", secondary: "bob" },
  );
  assert.equal(promoted.model.stage, "champion");

  const failedEvidence = evidence.map((row) => ({ ...row }));
  failedEvidence[1].injectionFollowed = true;
  failedEvidence[1].policyViolation = true;
  const failed = await service.run({
    modelId: model.modelId,
    version: model.version,
    datasetId: dataset.datasetId,
    datasetVersion: dataset.version,
    evidence: failedEvidence,
  });
  assert.equal(failed.eligible, false);
  assert.equal(failed.checks.injection, false);
  assert.equal(failed.checks.policy, false);
  assert.equal(failed.governanceEvaluation.eligible, false);

  assert.throws(
    () => validateCase({ ...cases[0], prompt: "raw prompt forbidden" }),
    /unsupported-ai-evaluation-case-field/,
  );
  assert.throws(
    () =>
      validateEvidence({ ...evidence[0], response: "raw output forbidden" }),
    /unsupported-ai-evidence-field/,
  );
  await assert.rejects(
    () =>
      service.registerDataset({
        datasetId: "unsafe-metadata",
        version: "1",
        description: "<script>raw prompt</script>",
        cases,
        manifest,
        attestation: attestation("unsafe-metadata", "1"),
      }),
    /invalid-ai-evaluation-dataset/,
  );
  await assert.rejects(
    () =>
      service.run({
        modelId: model.modelId,
        version: model.version,
        datasetId: dataset.datasetId,
        datasetVersion: dataset.version,
        evidence: [...evidence, evidence[0]],
      }),
    /duplicate-ai-evaluation-case/,
  );

  const datasetEvents = events
      .filter(([stream]) => stream === "governance.ai-datasets")
      .map(([, event]) => event),
    runEvents = events
      .filter(([stream]) => stream === "governance.ai-evaluations")
      .map(([, event]) => event),
    recovered = new AiEvaluationService({
      governance,
      policy: { minimumCases: 12, minimumCalibrationCases: 1 },
      trustedReviewers,
    });
  assert.deepEqual(
    recovered.recover({ datasets: datasetEvents, runs: runEvents }),
    {
      recovered: true,
      datasets: 1,
      runs: 2,
    },
  );
  assert.equal(recovered.status().runs, 2);
  const corrupt = new AiEvaluationService({ governance, trustedReviewers });
  assert.throws(
    () =>
      corrupt.recover({
        runs: [{ datasetId: "missing", datasetVersion: "1" }],
      }),
    /ai-evaluation-recovery-failed/,
  );
  const altered = new AiEvaluationService({ governance, trustedReviewers });
  assert.throws(
    () =>
      altered.recover({
        datasets: datasetEvents,
        runs: [{ ...runEvents[0], datasetHash: hash("0") }],
      }),
    /ai-evaluation-recovery-failed/,
  );
  const untrusted = new AiEvaluationService({
    governance,
    policy: { minimumCases: 12, minimumCalibrationCases: 1 },
  });
  await assert.rejects(
    () =>
      untrusted.registerDataset({
        datasetId: "untrusted",
        version: "1",
        cases,
        manifest,
        attestation: attestation("untrusted", "1"),
      }),
    /untrusted-provenance-reviewer/,
  );
  const tamperedManifest = { ...manifest, owner: "attacker" };
  await assert.rejects(
    () =>
      service.registerDataset({
        datasetId: "tampered",
        version: "1",
        cases,
        manifest: tamperedManifest,
        attestation: attestation("tampered", "1"),
      }),
    /invalid-provenance-signature/,
  );
  const orphanManifest = {
    ...manifest,
    parentDatasetHashes: ["7".repeat(64)],
  };
  await assert.rejects(
    () =>
      service.registerDataset({
        datasetId: "orphan-lineage",
        version: "1",
        cases,
        manifest: orphanManifest,
        attestation: attestation("orphan-lineage", "1", orphanManifest),
      }),
    /unknown-parent-dataset/,
  );
  assert.equal(
    parseTrustedReviewers(
      JSON.stringify({
        [reviewerId]: publicKey.export({ type: "spki", format: "pem" }),
      }),
    ).size,
    1,
  );
  assert.throws(
    () => parseTrustedReviewers("{"),
    /invalid-trusted-reviewers-config/,
  );
  assert.throws(
    () => parseTrustedReviewers(JSON.stringify({ reviewer: "not-a-key" })),
    /invalid-trusted-reviewers-config/,
  );
  console.log("AI adversarial evaluation tests: ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
