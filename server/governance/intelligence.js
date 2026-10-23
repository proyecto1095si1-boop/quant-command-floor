"use strict";

const crypto = require("node:crypto"),
  { fingerprint } = require("./service.js"),
  { verifyProvenance } = require("./provenance.js"),
  {
    calibrateIntelligence,
    metrics,
    normalizeObservations,
  } = require("../intelligence/calibration.js");

const SAFE_DESCRIPTION = /^[\p{L}\p{N} .,_():/@+-]{0,200}$/u,
  MAX_RUNS = 1000;

const calibrationFingerprint = (value) =>
  crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

function invalid(message, status = 422) {
  throw Object.assign(new Error(message), { status });
}

function integer(value, minimum, message) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum) invalid(message);
  return number;
}

function groundTruth(observations) {
  return fingerprint(
    observations.map(({ timestamp, outcomeAt, asset, outcome }) => ({
      timestamp,
      outcomeAt,
      asset,
      outcome,
    })),
  );
}

function splitDataset(observations, input, policy) {
  const holdoutObservations = integer(
      input.holdoutObservations,
      policy.minimumHoldoutObservations,
      "insufficient-intelligence-holdout",
    ),
    purgeObservations = integer(
      input.purgeObservations ?? 2,
      1,
      "invalid-intelligence-holdout-purge",
    ),
    developmentEnd =
      observations.length - holdoutObservations - purgeObservations;
  if (developmentEnd < policy.minimumDevelopmentObservations)
    invalid("insufficient-intelligence-development");
  const split = {
      development: {
        start: 0,
        end: developmentEnd - 1,
        observations: developmentEnd,
      },
      purge: {
        start: developmentEnd,
        end: developmentEnd + purgeObservations - 1,
        observations: purgeObservations,
      },
      holdout: {
        start: developmentEnd + purgeObservations,
        end: observations.length - 1,
        observations: holdoutObservations,
      },
    },
    lastDevelopmentOutcome = Date.parse(
      observations[split.development.end].outcomeAt,
    ),
    firstHoldoutSignal = Date.parse(
      observations[split.holdout.start].timestamp,
    );
  if (lastDevelopmentOutcome >= firstHoldoutSignal)
    invalid("intelligence-holdout-causal-overlap");
  return split;
}

function holdoutChecks(result, policy) {
  return {
    observations: result.observations >= policy.minimumHoldoutObservations,
    logLoss: result.logLoss <= policy.maximumLogLoss,
    brier: result.brier <= policy.maximumBrier,
    calibration: result.calibrationError <= policy.maximumCalibrationError,
    accuracy: result.directionalAccuracy >= policy.minimumDirectionalAccuracy,
  };
}

class IntelligenceGovernanceService {
  constructor({
    governance,
    experiments,
    record = async () => {},
    trustedReviewers = new Map(),
    policy = {},
  } = {}) {
    this.governance = governance;
    this.experiments = experiments;
    this.record = record;
    this.trustedReviewers = new Map(trustedReviewers);
    this.policy = {
      minimumDevelopmentObservations: 60,
      minimumHoldoutObservations: 20,
      maximumLogLoss: Math.log(2),
      maximumBrier: 0.25,
      maximumCalibrationError: 0.15,
      minimumDirectionalAccuracy: 0.55,
      maximumCanaryPercent: 5,
      ...policy,
    };
    this.datasets = new Map();
    this.runs = [];
    this.approvals = [];
    this.recoveryError = null;
  }

  ensureReady() {
    if (this.recoveryError)
      invalid("intelligence-governance-recovery-failed", 503);
  }

  dataset(datasetId, version) {
    const dataset = this.datasets.get(`${datasetId}@${version}`);
    if (!dataset) invalid("intelligence-dataset-not-found", 404);
    return dataset;
  }

  runById(runId) {
    const run = this.runs.find((item) => item.id === runId);
    if (!run) invalid("intelligence-run-not-found", 404);
    return run;
  }

  async registerDataset(input = {}, actor = "system") {
    this.ensureReady();
    const datasetId = String(input.datasetId || "").trim(),
      version = String(input.version || "").trim(),
      description = String(input.description || ""),
      key = `${datasetId}@${version}`,
      asOf = input.asOf ? Date.parse(input.asOf) : Date.now(),
      observations = normalizeObservations(input.observations, asOf),
      observationsHash = fingerprint(observations),
      provenance = verifyProvenance(
        input.manifest,
        input.attestation,
        this.trustedReviewers,
        { datasetId, version, casesHash: observationsHash },
      );
    if (!datasetId || !version || !SAFE_DESCRIPTION.test(description))
      invalid("invalid-intelligence-dataset");
    if (this.datasets.has(key)) invalid("intelligence-dataset-exists", 409);
    if (provenance.manifest.groundTruthHash !== groundTruth(observations))
      invalid("intelligence-ground-truth-mismatch");
    for (const parentHash of provenance.manifest.parentDatasetHashes)
      if (![...this.datasets.values()].some((item) => item.hash === parentHash))
        invalid("unknown-parent-dataset");
    const split = splitDataset(observations, input.split || {}, this.policy),
      splitHash = fingerprint(split),
      dataset = {
        datasetId,
        version,
        description,
        observations,
        observationsHash,
        split,
        splitHash,
        manifest: provenance.manifest,
        manifestHash: provenance.manifestHash,
        attestationHash: provenance.attestationHash,
        attestation: provenance.attestation,
        hash: fingerprint({
          datasetId,
          version,
          observationsHash,
          splitHash,
          manifestHash: provenance.manifestHash,
          attestationHash: provenance.attestationHash,
        }),
        holdoutState: "sealed",
        registeredAt: new Date().toISOString(),
        registeredBy: actor,
      };
    this.datasets.set(key, dataset);
    await this.record("governance.intelligence-datasets", dataset);
    return structuredClone(dataset);
  }

  async evaluate(input = {}, actor = "system") {
    this.ensureReady();
    const dataset = this.dataset(input.datasetId, input.datasetVersion);
    if (dataset.holdoutState !== "sealed")
      invalid("intelligence-holdout-already-consumed", 409);
    const development = dataset.observations.slice(
        dataset.split.development.start,
        dataset.split.development.end + 1,
      ),
      calibration = calibrateIntelligence({
        observations: development,
        folds: input.folds,
        grid: input.grid,
        asOf: dataset.observations.at(-1).outcomeAt,
      }),
      holdoutRows = dataset.observations.slice(dataset.split.holdout.start),
      candidate = {
        id: calibration.recommendation.candidateId,
        parameters: calibration.recommendation.parameters,
      },
      holdout = metrics(holdoutRows, candidate),
      checks = holdoutChecks(holdout, this.policy),
      run = {
        id: crypto.randomUUID(),
        paperOnly: true,
        source: "signed-intelligence-calibration-v1",
        datasetId: dataset.datasetId,
        datasetVersion: dataset.version,
        datasetHash: dataset.hash,
        manifestHash: dataset.manifestHash,
        splitHash: dataset.splitHash,
        developmentHash: fingerprint(development),
        holdoutHash: fingerprint(holdoutRows),
        calibration,
        holdout,
        checks,
        eligible: Object.values(checks).every(Boolean),
        state: "evaluated",
        createdAt: new Date().toISOString(),
        evaluatedBy: actor,
      };
    run.reproducibilityHash = fingerprint({
      source: run.source,
      datasetHash: run.datasetHash,
      manifestHash: run.manifestHash,
      splitHash: run.splitHash,
      developmentHash: run.developmentHash,
      holdoutHash: run.holdoutHash,
      calibrationHash: calibration.reproducibilityHash,
      candidateId: calibration.recommendation.candidateId,
      holdout,
      checks,
    });
    dataset.holdoutState = "consumed";
    dataset.holdoutConsumedBy = run.id;
    this.runs.push(run);
    if (this.runs.length > MAX_RUNS) this.runs.shift();
    await this.record("governance.intelligence-runs", run);
    return structuredClone(run);
  }

  async approveExperiment(input = {}, approvals = {}, actor = "system") {
    this.ensureReady();
    const run = this.runById(String(input.runId || "")),
      approvers = [
        String(approvals.primary || ""),
        String(approvals.secondary || ""),
      ],
      mode = String(input.mode || "shadow"),
      trafficPercent = Number(
        input.trafficPercent ?? (mode === "canary" ? 5 : 0),
      );
    if (
      approvers.some((value) => value.length < 3) ||
      approvers[0] === approvers[1]
    )
      invalid("independent-second-approval-required", 403);
    if (!run.eligible) invalid("intelligence-run-failed-gates", 409);
    if (run.state !== "evaluated")
      invalid("intelligence-run-already-approved", 409);
    if (!new Set(["shadow", "canary"]).has(mode))
      invalid("invalid-intelligence-experiment-mode");
    if (
      (mode === "shadow" && trafficPercent !== 0) ||
      (mode === "canary" &&
        (!(trafficPercent > 0) ||
          trafficPercent > this.policy.maximumCanaryPercent))
    )
      invalid("invalid-intelligence-canary-traffic");
    const model = this.governance.get(input.modelId, input.version);
    if (
      model.stage !== "challenger" ||
      model.kind !== "intelligence" ||
      model.artifactHash !== run.reproducibilityHash ||
      fingerprint(model.parameters) !==
        fingerprint(run.calibration.recommendation.parameters)
    )
      invalid("intelligence-challenger-mismatch");
    const experiment = await this.experiments.start(
        {
          modelId: model.modelId,
          challengerVersion: model.version,
          mode,
          trafficPercent,
        },
        actor,
      ),
      approval = {
        id: crypto.randomUUID(),
        paperOnly: true,
        runId: run.id,
        experimentId: experiment.id,
        modelId: model.modelId,
        version: model.version,
        mode,
        trafficPercent: experiment.trafficPercent,
        approvedBy: approvers,
        approvedAt: new Date().toISOString(),
        approvedByActor: actor,
      };
    run.state = "experiment-approved";
    run.approvalId = approval.id;
    this.approvals.push(approval);
    await this.record("governance.intelligence-approvals", approval);
    return { paperOnly: true, approval, experiment };
  }

  status() {
    return {
      paperOnly: true,
      ready: !this.recoveryError,
      policy: this.policy,
      datasets: this.datasets.size,
      sealedHoldouts: [...this.datasets.values()].filter(
        (dataset) => dataset.holdoutState === "sealed",
      ).length,
      runs: this.runs.length,
      approvals: this.approvals.length,
      lastRun: this.runs.at(-1) || null,
    };
  }

  recover({ datasets = [], runs = [], approvals = [] } = {}) {
    try {
      const recovered = new Map();
      for (const input of datasets) {
        const key = `${input.datasetId}@${input.version}`,
          observations = normalizeObservations(
            input.observations,
            Date.parse(input.observations.at(-1)?.outcomeAt),
          ),
          observationsHash = fingerprint(observations),
          provenance = verifyProvenance(
            input.manifest,
            input.attestation,
            this.trustedReviewers,
            {
              datasetId: input.datasetId,
              version: input.version,
              casesHash: observationsHash,
            },
          ),
          expectedSplit = splitDataset(
            observations,
            {
              holdoutObservations: input.split?.holdout?.observations,
              purgeObservations: input.split?.purge?.observations,
            },
            this.policy,
          ),
          expectedHash = fingerprint({
            datasetId: input.datasetId,
            version: input.version,
            observationsHash,
            splitHash: input.splitHash,
            manifestHash: input.manifestHash,
            attestationHash: input.attestationHash,
          });
        if (
          recovered.has(key) ||
          input.observationsHash !== observationsHash ||
          input.manifestHash !== provenance.manifestHash ||
          input.attestationHash !== provenance.attestationHash ||
          provenance.manifest.groundTruthHash !== groundTruth(observations) ||
          JSON.stringify(input.split) !== JSON.stringify(expectedSplit) ||
          input.splitHash !== fingerprint(expectedSplit) ||
          input.hash !== expectedHash
        )
          throw new Error("invalid-intelligence-dataset-event");
        recovered.set(key, {
          ...structuredClone(input),
          observations,
          holdoutState: "sealed",
        });
      }
      for (const dataset of recovered.values())
        for (const parentHash of dataset.manifest.parentDatasetHashes)
          if (![...recovered.values()].some((item) => item.hash === parentHash))
            throw new Error("unknown-parent-dataset");
      const used = new Set();
      for (const run of runs) {
        const dataset = recovered.get(`${run.datasetId}@${run.datasetVersion}`),
          holdoutRows = dataset?.observations.slice(
            dataset.split.holdout.start,
          ),
          candidate = {
            id: run.calibration?.recommendation?.candidateId,
            parameters: run.calibration?.recommendation?.parameters,
          },
          { reproducibilityHash: calibrationHash, ...calibrationBody } =
            run.calibration || {},
          holdout = dataset ? metrics(holdoutRows, candidate) : null,
          checks = holdout ? holdoutChecks(holdout, this.policy) : null,
          expectedHash = fingerprint({
            source: run.source,
            datasetHash: run.datasetHash,
            manifestHash: run.manifestHash,
            splitHash: run.splitHash,
            developmentHash: run.developmentHash,
            holdoutHash: run.holdoutHash,
            calibrationHash: run.calibration?.reproducibilityHash,
            candidateId: candidate.id,
            holdout: run.holdout,
            checks: run.checks,
          });
        if (
          !dataset ||
          used.has(dataset.hash) ||
          run.paperOnly !== true ||
          run.source !== "signed-intelligence-calibration-v1" ||
          run.datasetHash !== dataset.hash ||
          run.manifestHash !== dataset.manifestHash ||
          run.splitHash !== dataset.splitHash ||
          calibrationHash !== calibrationFingerprint(calibrationBody) ||
          run.calibration?.recommendation?.autoApply !== false ||
          run.developmentHash !==
            fingerprint(
              dataset.observations.slice(0, dataset.split.development.end + 1),
            ) ||
          run.holdoutHash !== fingerprint(holdoutRows) ||
          JSON.stringify(run.holdout) !== JSON.stringify(holdout) ||
          JSON.stringify(run.checks) !== JSON.stringify(checks) ||
          run.eligible !== Object.values(checks).every(Boolean) ||
          run.reproducibilityHash !== expectedHash
        )
          throw new Error("invalid-intelligence-run-event");
        used.add(dataset.hash);
        dataset.holdoutState = "consumed";
        dataset.holdoutConsumedBy = run.id;
      }
      const experimentMap = new Map(
          (this.experiments?.list().experiments || []).map((row) => [
            row.id,
            row,
          ]),
        ),
        approved = new Set();
      for (const approval of approvals) {
        const run = runs.find((row) => row.id === approval.runId),
          experiment = experimentMap.get(approval.experimentId),
          model = this.governance.get(approval.modelId, approval.version);
        if (
          approval.paperOnly !== true ||
          !run?.eligible ||
          approved.has(run.id) ||
          !experiment ||
          experiment.modelId !== approval.modelId ||
          experiment.challengerVersion !== approval.version ||
          experiment.mode !== approval.mode ||
          experiment.trafficPercent !== approval.trafficPercent ||
          !new Set(["shadow", "canary"]).has(approval.mode) ||
          (approval.mode === "shadow" && approval.trafficPercent !== 0) ||
          (approval.mode === "canary" &&
            (!(approval.trafficPercent > 0) ||
              approval.trafficPercent > this.policy.maximumCanaryPercent)) ||
          model.kind !== "intelligence" ||
          model.artifactHash !== run.reproducibilityHash ||
          fingerprint(model.parameters) !==
            fingerprint(run.calibration.recommendation.parameters) ||
          !Array.isArray(approval.approvedBy) ||
          approval.approvedBy.length !== 2 ||
          approval.approvedBy.some(
            (approver) => typeof approver !== "string" || approver.length < 3,
          ) ||
          approval.approvedBy[0] === approval.approvedBy[1]
        )
          throw new Error("invalid-intelligence-approval-event");
        run.state = "experiment-approved";
        run.approvalId = approval.id;
        approved.add(run.id);
      }
      this.datasets = recovered;
      this.runs = structuredClone(runs.slice(-MAX_RUNS));
      this.approvals = structuredClone(approvals);
      this.recoveryError = null;
      return {
        recovered: true,
        datasets: recovered.size,
        runs: runs.length,
        approvals: approvals.length,
      };
    } catch (error) {
      this.recoveryError = error.message;
      throw Object.assign(
        new Error("intelligence-governance-recovery-failed"),
        {
          cause: error,
        },
      );
    }
  }
}

module.exports = {
  IntelligenceGovernanceService,
  groundTruth,
  holdoutChecks,
  splitDataset,
};
