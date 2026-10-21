"use strict";

const crypto = require("node:crypto"),
  { fingerprint } = require("./service.js"),
  { verifyProvenance } = require("./provenance.js"),
  {
    calibrateConsensus,
    evaluateCandidate,
    normalizeObservations,
  } = require("../research/consensus-calibration.js"),
  { DEFAULT_CORRELATIONS } = require("../decision/consensus.js");

const SAFE_DESCRIPTION = /^[\p{L}\p{N} .,_():/@+-]{0,200}$/u,
  MAX_RUNS = 1000;

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
    observations.map(({ timestamp, asset, outcome }) => ({
      timestamp,
      asset,
      outcome,
    })),
  );
}

function splitDataset(observations, input, policy) {
  const holdoutObservations = integer(
      input.holdoutObservations,
      policy.minimumHoldoutObservations,
      "insufficient-calibration-holdout",
    ),
    purgeObservations = integer(
      input.purgeObservations ?? 2,
      1,
      "invalid-calibration-holdout-purge",
    ),
    developmentEnd =
      observations.length - holdoutObservations - purgeObservations;
  if (developmentEnd < policy.minimumDevelopmentObservations)
    invalid("insufficient-calibration-development");
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
    regimes = (range) =>
      new Set(
        observations.slice(range.start, range.end + 1).map((row) => row.regime),
      );
  if (
    regimes(split.development).size < policy.minimumRegimes ||
    regimes(split.holdout).size < policy.minimumRegimes
  )
    invalid("insufficient-calibration-regimes");
  return split;
}

function holdoutChecks(result, policy) {
  return {
    observations:
      result.overall.observations >= policy.minimumHoldoutObservations,
    regimes: Object.keys(result.regimes).length >= policy.minimumRegimes,
    logLoss: result.overall.logLoss <= policy.maximumLogLoss,
    brier: result.overall.brier <= policy.maximumBrier,
    calibration: result.overall.ece <= policy.maximumEce,
    coverage: result.overall.actionCoverage >= policy.minimumActionCoverage,
    accuracy:
      result.overall.directionalAccuracy >= policy.minimumDirectionalAccuracy,
    worstRegime:
      result.robustness.worstRegimeLogLoss <= policy.maximumWorstRegimeLogLoss,
  };
}

class CalibrationGovernanceService {
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
      minimumRegimes: 2,
      maximumLogLoss: Math.log(2),
      maximumBrier: 0.25,
      maximumEce: 0.15,
      minimumActionCoverage: 0.2,
      minimumDirectionalAccuracy: 0.55,
      maximumWorstRegimeLogLoss: 0.8,
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
      invalid("calibration-governance-recovery-failed", 503);
  }

  dataset(datasetId, version) {
    const dataset = this.datasets.get(`${datasetId}@${version}`);
    if (!dataset) invalid("calibration-dataset-not-found", 404);
    return dataset;
  }

  runById(runId) {
    const run = this.runs.find((item) => item.id === runId);
    if (!run) invalid("calibration-run-not-found", 404);
    return run;
  }

  async registerDataset(input = {}, actor = "system") {
    this.ensureReady();
    const datasetId = String(input.datasetId || "").trim(),
      version = String(input.version || "").trim(),
      description = String(input.description || ""),
      key = `${datasetId}@${version}`,
      observations = normalizeObservations(input.observations),
      observationsHash = fingerprint(observations),
      provenance = verifyProvenance(
        input.manifest,
        input.attestation,
        this.trustedReviewers,
        { datasetId, version, casesHash: observationsHash },
      );
    if (!datasetId || !version || !SAFE_DESCRIPTION.test(description))
      invalid("invalid-calibration-dataset");
    if (this.datasets.has(key)) invalid("calibration-dataset-exists", 409);
    if (provenance.manifest.groundTruthHash !== groundTruth(observations))
      invalid("calibration-ground-truth-mismatch");
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
    await this.record("governance.calibration-datasets", dataset);
    return structuredClone(dataset);
  }

  async evaluate(input = {}, actor = "system") {
    this.ensureReady();
    const dataset = this.dataset(input.datasetId, input.datasetVersion);
    if (dataset.holdoutState !== "sealed")
      invalid("calibration-holdout-already-consumed", 409);
    const development = dataset.observations.slice(
        dataset.split.development.start,
        dataset.split.development.end + 1,
      ),
      calibration = calibrateConsensus({
        observations: development,
        folds: input.folds,
        grid: input.grid,
        dependencePolicy: input.dependencePolicy,
        consensusPolicy: input.consensusPolicy,
        staticCorrelations: input.staticCorrelations,
      }),
      options = {
        dependencePolicy: {
          minimumObservations: 10,
          ...input.dependencePolicy,
        },
        consensusPolicy: input.consensusPolicy || {},
        staticCorrelations: input.staticCorrelations || DEFAULT_CORRELATIONS,
      },
      holdout = evaluateCandidate(
        dataset.observations,
        [
          {
            fold: 0,
            train: dataset.split.development,
            purge: dataset.split.purge,
            test: dataset.split.holdout,
            embargo: {
              start: dataset.observations.length,
              end: dataset.observations.length - 1,
              observations: 0,
            },
          },
        ],
        calibration.recommendation.parameters,
        options,
      ),
      checks = holdoutChecks(holdout, this.policy),
      run = {
        id: crypto.randomUUID(),
        paperOnly: true,
        source: "signed-consensus-calibration-v1",
        datasetId: dataset.datasetId,
        datasetVersion: dataset.version,
        datasetHash: dataset.hash,
        manifestHash: dataset.manifestHash,
        splitHash: dataset.splitHash,
        developmentHash: fingerprint(development),
        holdoutHash: fingerprint(
          dataset.observations.slice(dataset.split.holdout.start),
        ),
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
    await this.record("governance.calibration-runs", run);
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
      approvers.some((approver) => approver.length < 3) ||
      approvers[0] === approvers[1]
    )
      invalid("independent-second-approval-required", 403);
    if (!run.eligible) invalid("calibration-run-failed-gates", 409);
    if (run.state !== "evaluated")
      invalid("calibration-run-already-approved", 409);
    if (!new Set(["shadow", "canary"]).has(mode))
      invalid("invalid-calibration-experiment-mode");
    if (
      (mode === "shadow" && trafficPercent !== 0) ||
      (mode === "canary" &&
        (!(trafficPercent > 0) ||
          trafficPercent > this.policy.maximumCanaryPercent))
    )
      invalid("invalid-calibration-canary-traffic");
    const model = this.governance.get(input.modelId, input.version);
    if (
      model.stage !== "challenger" ||
      model.kind !== "consensus" ||
      model.artifactHash !== run.reproducibilityHash ||
      fingerprint(model.parameters) !==
        fingerprint(run.calibration.recommendation.parameters)
    )
      invalid("calibration-challenger-mismatch");
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
    await this.record("governance.calibration-approvals", approval);
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
          observations = normalizeObservations(input.observations),
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
          );
        if (
          recovered.has(key) ||
          input.observationsHash !== observationsHash ||
          input.manifestHash !== provenance.manifestHash ||
          input.attestationHash !== provenance.attestationHash ||
          provenance.manifest.groundTruthHash !== groundTruth(observations) ||
          input.splitHash !== fingerprint(input.split) ||
          input.hash !==
            fingerprint({
              datasetId: input.datasetId,
              version: input.version,
              observationsHash,
              splitHash: input.splitHash,
              manifestHash: input.manifestHash,
              attestationHash: input.attestationHash,
            })
        )
          throw new Error("invalid-calibration-dataset-event");
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
      const usedDatasets = new Set();
      for (const run of runs) {
        const dataset = recovered.get(`${run.datasetId}@${run.datasetVersion}`),
          expectedChecks = holdoutChecks(run.holdout, this.policy),
          expectedHash = fingerprint({
            source: run.source,
            datasetHash: run.datasetHash,
            manifestHash: run.manifestHash,
            splitHash: run.splitHash,
            developmentHash: run.developmentHash,
            holdoutHash: run.holdoutHash,
            calibrationHash: run.calibration?.reproducibilityHash,
            candidateId: run.calibration?.recommendation?.candidateId,
            holdout: run.holdout,
            checks: run.checks,
          });
        if (
          !dataset ||
          usedDatasets.has(dataset.hash) ||
          run.paperOnly !== true ||
          run.source !== "signed-consensus-calibration-v1" ||
          run.datasetHash !== dataset.hash ||
          run.manifestHash !== dataset.manifestHash ||
          run.splitHash !== dataset.splitHash ||
          run.developmentHash !==
            fingerprint(
              dataset.observations.slice(
                dataset.split.development.start,
                dataset.split.development.end + 1,
              ),
            ) ||
          run.holdoutHash !==
            fingerprint(
              dataset.observations.slice(dataset.split.holdout.start),
            ) ||
          JSON.stringify(run.checks) !== JSON.stringify(expectedChecks) ||
          run.eligible !== Object.values(expectedChecks).every(Boolean) ||
          run.reproducibilityHash !== expectedHash
        )
          throw new Error("invalid-calibration-run-event");
        usedDatasets.add(dataset.hash);
        dataset.holdoutState = "consumed";
        dataset.holdoutConsumedBy = run.id;
      }
      const runIds = new Set(runs.map((run) => run.id)),
        approvedRuns = new Set(),
        recoveredExperiments = new Map(
          (this.experiments?.list().experiments || []).map((experiment) => [
            experiment.id,
            experiment,
          ]),
        );
      for (const approval of approvals) {
        const run = runs.find((item) => item.id === approval.runId),
          experiment = recoveredExperiments.get(approval.experimentId),
          model = this.governance.get(approval.modelId, approval.version);
        if (
          approval.paperOnly !== true ||
          !runIds.has(approval.runId) ||
          approvedRuns.has(approval.runId) ||
          !run?.eligible ||
          !experiment ||
          experiment.modelId !== approval.modelId ||
          experiment.challengerVersion !== approval.version ||
          experiment.mode !== approval.mode ||
          experiment.trafficPercent !== approval.trafficPercent ||
          model.artifactHash !== run.reproducibilityHash ||
          fingerprint(model.parameters) !==
            fingerprint(run.calibration.recommendation.parameters) ||
          !Array.isArray(approval.approvedBy) ||
          approval.approvedBy.length !== 2 ||
          approval.approvedBy.some(
            (approver) =>
              !(typeof approver === "string" && approver.length >= 3),
          ) ||
          approval.approvedBy[0] === approval.approvedBy[1]
        )
          throw new Error("invalid-calibration-approval-event");
        run.state = "experiment-approved";
        run.approvalId = approval.id;
        approvedRuns.add(approval.runId);
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
      throw Object.assign(new Error("calibration-governance-recovery-failed"), {
        cause: error,
      });
    }
  }
}

module.exports = {
  CalibrationGovernanceService,
  groundTruth,
  holdoutChecks,
  splitDataset,
};
