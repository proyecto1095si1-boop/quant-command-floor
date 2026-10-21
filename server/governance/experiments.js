"use strict";

const crypto = require("node:crypto"),
  { fingerprint } = require("./service.js");
const {
  cleanForecast,
  graduationEvidence,
  summarizeForecasts,
} = require("./sequential.js");

function percentile(values, probability) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b),
    index = (sorted.length - 1) * probability,
    low = Math.floor(index),
    high = Math.ceil(index);
  return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
}

function assignmentFraction(experimentId, requestId) {
  const bytes = crypto
      .createHash("sha256")
      .update(`${experimentId}:${requestId}`)
      .digest(),
    integer = bytes.readUInt32BE(0);
  return integer / 0x100000000;
}

function requestKey(requestId) {
  return crypto.createHash("sha256").update(String(requestId)).digest("hex");
}

function cleanOutcome(input = {}) {
  if (
    input.outputHash !== undefined &&
    !/^[a-f0-9]{64}$/i.test(String(input.outputHash))
  )
    throw Object.assign(new Error("invalid-experiment-output-hash"), {
      status: 422,
    });
  const outcome = {
    outputHash: input.outputHash ? String(input.outputHash) : null,
    value: input.value == null ? null : Number(input.value),
    label: input.label == null ? null : String(input.label),
    score: input.score == null ? null : Number(input.score),
    latencyMs: Number(input.latencyMs || 0),
    error: input.errorCode
      ? String(input.errorCode)
          .replace(/[^A-Za-z0-9_.:-]/g, "-")
          .slice(0, 80)
      : input.error
        ? "model-error"
        : null,
    schemaValid: input.schemaValid !== false,
    grounded: input.grounded !== false,
    policyViolation: input.policyViolation === true,
  };
  for (const field of ["value", "score", "latencyMs"])
    if (outcome[field] !== null && !Number.isFinite(outcome[field]))
      throw Object.assign(new Error("invalid-experiment-outcome"), {
        status: 422,
      });
  if (outcome.latencyMs < 0)
    throw Object.assign(new Error("invalid-experiment-latency"), {
      status: 422,
    });
  return outcome;
}

function summarize(observations) {
  const count = observations.length,
    championErrors = observations.filter((row) => row.champion.error).length,
    challengerErrors = observations.filter(
      (row) => row.challenger.error,
    ).length,
    comparableValues = observations.filter(
      (row) => row.champion.value !== null && row.challenger.value !== null,
    ),
    comparableLabels = observations.filter(
      (row) => row.champion.label !== null && row.challenger.label !== null,
    ),
    absoluteDifferences = comparableValues.map((row) =>
      Math.abs(row.challenger.value - row.champion.value),
    ),
    signDisagreements = comparableValues.filter(
      (row) =>
        Math.sign(row.challenger.value) !== Math.sign(row.champion.value),
    ).length,
    labelDisagreements = comparableLabels.filter(
      (row) => row.challenger.label !== row.champion.label,
    ).length,
    schemaFailures = observations.filter(
      (row) => !row.challenger.schemaValid,
    ).length,
    groundingFailures = observations.filter(
      (row) => !row.challenger.grounded,
    ).length,
    policyViolations = observations.filter(
      (row) => row.challenger.policyViolation,
    ).length,
    championLatencies = observations.map((row) => row.champion.latencyMs),
    challengerLatencies = observations.map((row) => row.challenger.latencyMs),
    championP95 = percentile(championLatencies, 0.95),
    challengerP95 = percentile(challengerLatencies, 0.95);
  return {
    observations: count,
    championErrorRate: count ? championErrors / count : 0,
    challengerErrorRate: count ? challengerErrors / count : 0,
    errorRateIncrease: count ? (challengerErrors - championErrors) / count : 0,
    comparableNumeric: comparableValues.length,
    meanAbsoluteDelta: absoluteDifferences.length
      ? absoluteDifferences.reduce((sum, value) => sum + value, 0) /
        absoluteDifferences.length
      : 0,
    signDisagreementRate: comparableValues.length
      ? signDisagreements / comparableValues.length
      : 0,
    comparableLabels: comparableLabels.length,
    labelDisagreementRate: comparableLabels.length
      ? labelDisagreements / comparableLabels.length
      : 0,
    schemaFailureRate: count ? schemaFailures / count : 0,
    groundingFailureRate: count ? groundingFailures / count : 0,
    policyViolationRate: count ? policyViolations / count : 0,
    championLatencyP95: championP95,
    challengerLatencyP95: challengerP95,
    latencyP95Ratio: championP95
      ? challengerP95 / championP95
      : challengerP95
        ? Number.MAX_VALUE
        : 1,
  };
}

class ExperimentService {
  constructor({ governance, record = async () => {}, policy = {} } = {}) {
    this.governance = governance;
    this.record = record;
    this.policy = {
      minimumObservations: 50,
      maxErrorRateIncrease: 0.02,
      maxPolicyViolationRate: 0,
      maxSchemaFailureRate: 0.02,
      maxGroundingFailureRate: 0.05,
      maxLatencyP95Ratio: 2,
      maxMeanAbsoluteDelta: null,
      ...policy,
    };
    this.sequentialPolicy = {
      alpha: 0.01,
      degradationMargin: 0,
      minimumObservations: 30,
      minimumRegimeObservations: 20,
      maximumRegimes: 8,
      probabilityFloor: 0.01,
      lossBound: -Math.log(0.01),
      bettingFraction: 0.5,
      nonInferiorityMargin: 0.02,
      targetImprovement: 1,
      graduationMinimumObservations: 100,
      graduationMinimumRegimes: 2,
      graduationMinimumRegimeObservations: 30,
      ...(policy.sequential || {}),
    };
    const sequential = this.sequentialPolicy;
    if (
      !Number.isFinite(sequential.alpha) ||
      sequential.alpha <= 0 ||
      sequential.alpha >= 1 ||
      !Number.isFinite(sequential.degradationMargin) ||
      sequential.degradationMargin < 0 ||
      !Number.isInteger(sequential.minimumObservations) ||
      sequential.minimumObservations < 2 ||
      !Number.isInteger(sequential.minimumRegimeObservations) ||
      sequential.minimumRegimeObservations < 2 ||
      !Number.isInteger(sequential.maximumRegimes) ||
      sequential.maximumRegimes < 1 ||
      !Number.isFinite(sequential.probabilityFloor) ||
      sequential.probabilityFloor <= 0 ||
      sequential.probabilityFloor >= 0.5 ||
      !Number.isFinite(sequential.lossBound) ||
      sequential.lossBound < -Math.log(sequential.probabilityFloor) ||
      !Number.isFinite(sequential.bettingFraction) ||
      sequential.bettingFraction <= 0 ||
      sequential.bettingFraction > 1
    )
      throw Object.assign(new Error("invalid-sequential-policy"), {
        status: 422,
      });
    for (const field of [
      "nonInferiorityMargin",
      "targetImprovement",
      "graduationMinimumObservations",
      "graduationMinimumRegimes",
      "graduationMinimumRegimeObservations",
    ])
      if (!Number.isFinite(sequential[field]) || sequential[field] <= 0)
        throw Object.assign(new Error("invalid-sequential-policy"), {
          status: 422,
        });
    this.experiments = new Map();
    this.recoveryError = null;
  }

  ensureReady() {
    if (this.recoveryError)
      throw Object.assign(new Error("experiment-recovery-failed"), {
        status: 503,
      });
  }

  get(id) {
    const experiment = this.experiments.get(id);
    if (!experiment)
      throw Object.assign(new Error("experiment-not-found"), { status: 404 });
    return experiment;
  }

  async start(input = {}, actor = "system") {
    this.ensureReady();
    const modelId = String(input.modelId || ""),
      champion = this.governance.champion(modelId),
      challenger = this.governance.get(modelId, input.challengerVersion),
      mode = String(input.mode || "shadow"),
      trafficPercent = Number(
        input.trafficPercent ?? (mode === "canary" ? 5 : 0),
      );
    if (!champion)
      throw Object.assign(new Error("experiment-champion-not-found"), {
        status: 422,
      });
    if (
      challenger.stage !== "challenger" ||
      challenger.version === champion.version
    )
      throw Object.assign(new Error("invalid-experiment-challenger"), {
        status: 422,
      });
    if (!new Set(["shadow", "canary"]).has(mode))
      throw Object.assign(new Error("invalid-experiment-mode"), {
        status: 422,
      });
    if (!(trafficPercent >= 0 && trafficPercent <= 25))
      throw Object.assign(new Error("invalid-canary-traffic"), { status: 422 });
    if (
      [...this.experiments.values()].some(
        (experiment) =>
          experiment.modelId === modelId && experiment.state === "running",
      )
    )
      throw Object.assign(new Error("model-experiment-already-running"), {
        status: 409,
      });
    const experiment = {
      id: crypto.randomUUID(),
      paperOnly: true,
      modelId,
      kind: champion.kind,
      championVersion: champion.version,
      challengerVersion: challenger.version,
      mode,
      trafficPercent: mode === "shadow" ? 0 : trafficPercent,
      state: "running",
      startedAt: new Date().toISOString(),
      startedBy: actor,
      observations: [],
      forecasts: [],
      summary: summarize([]),
      sequential: summarizeForecasts([], this.sequentialPolicy),
      graduation: null,
      rollback: null,
    };
    this.experiments.set(experiment.id, experiment);
    await this.record("governance.experiments", {
      action: "start",
      experiment: { ...experiment, observations: [] },
    });
    return structuredClone(experiment);
  }

  assign(id, requestId) {
    this.ensureReady();
    const experiment = this.get(id);
    if (!requestId)
      throw Object.assign(new Error("experiment-request-id-required"), {
        status: 422,
      });
    const fraction = assignmentFraction(id, requestId),
      challengerSelected =
        experiment.state === "running" &&
        experiment.mode === "canary" &&
        fraction < experiment.trafficPercent / 100;
    return {
      paperOnly: true,
      experimentId: id,
      requestKey: requestKey(requestId),
      fraction,
      selectedVersion: challengerSelected
        ? experiment.challengerVersion
        : experiment.championVersion,
      challengerSelected,
      shadowVersion:
        experiment.state === "running" ? experiment.challengerVersion : null,
    };
  }

  breaches(summary) {
    if (summary.observations < this.policy.minimumObservations) return [];
    return [
      [
        "error-rate",
        summary.errorRateIncrease > this.policy.maxErrorRateIncrease,
      ],
      [
        "policy-violation",
        summary.policyViolationRate > this.policy.maxPolicyViolationRate,
      ],
      ["schema", summary.schemaFailureRate > this.policy.maxSchemaFailureRate],
      [
        "grounding",
        summary.groundingFailureRate > this.policy.maxGroundingFailureRate,
      ],
      ["latency", summary.latencyP95Ratio > this.policy.maxLatencyP95Ratio],
      [
        "numeric-delta",
        Number.isFinite(this.policy.maxMeanAbsoluteDelta) &&
          summary.meanAbsoluteDelta > this.policy.maxMeanAbsoluteDelta,
      ],
    ]
      .filter(([, breached]) => breached)
      .map(([name]) => name);
  }

  async observe(id, input = {}) {
    this.ensureReady();
    const experiment = this.get(id);
    if (experiment.state !== "running")
      throw Object.assign(new Error("experiment-not-running"), { status: 409 });
    if (
      !input.champion ||
      typeof input.champion !== "object" ||
      !input.challenger ||
      typeof input.challenger !== "object"
    )
      throw Object.assign(new Error("experiment-outcomes-required"), {
        status: 422,
      });
    if (
      !input.requestId ||
      !/^[a-f0-9]{64}$/i.test(String(input.inputHash || ""))
    )
      throw Object.assign(new Error("invalid-experiment-observation"), {
        status: 422,
      });
    if (
      experiment.observations.some(
        (observation) => observation.requestKey === requestKey(input.requestId),
      )
    )
      throw Object.assign(new Error("duplicate-experiment-observation"), {
        status: 409,
      });
    const observation = {
      id: crypto.randomUUID(),
      requestKey: requestKey(input.requestId),
      inputHash: String(input.inputHash),
      at: new Date().toISOString(),
      champion: cleanOutcome(input.champion),
      challenger: cleanOutcome(input.challenger),
    };
    experiment.observations.push(observation);
    experiment.summary = summarize(experiment.observations);
    await this.record("governance.experiments", {
      action: "observe",
      experimentId: id,
      observation,
    });
    const breaches = this.breaches(experiment.summary);
    if (breaches.length)
      await this.rollback(experiment, breaches, "guardrails");
    return structuredClone(experiment);
  }

  async observeForecast(id, input = {}) {
    this.ensureReady();
    const experiment = this.get(id);
    if (experiment.state !== "running")
      throw Object.assign(new Error("experiment-not-running"), { status: 409 });
    if (!input.requestId)
      throw Object.assign(new Error("experiment-request-id-required"), {
        status: 422,
      });
    const key = requestKey(input.requestId);
    if (experiment.forecasts.some((row) => row.requestKey === key))
      throw Object.assign(new Error("duplicate-sequential-forecast"), {
        status: 409,
      });
    const forecast = {
      id: crypto.randomUUID(),
      requestKey: key,
      at: new Date().toISOString(),
      ...cleanForecast(input, this.sequentialPolicy),
    };
    const regimes = new Set([
      ...experiment.forecasts.map((row) => row.regime),
      forecast.regime,
    ]);
    if (regimes.size > this.sequentialPolicy.maximumRegimes)
      throw Object.assign(new Error("sequential-regime-limit-exceeded"), {
        status: 422,
      });
    experiment.forecasts.push(forecast);
    experiment.sequential = summarizeForecasts(
      experiment.forecasts,
      this.sequentialPolicy,
    );
    await this.record("governance.experiments", {
      action: "forecast",
      experimentId: id,
      forecast,
    });
    if (experiment.sequential.breaches.length)
      await this.rollback(
        experiment,
        experiment.sequential.breaches,
        "sequential-monitor",
      );
    return structuredClone(experiment);
  }

  async rollback(experiment, breaches, source) {
    experiment.state = "rolled-back";
    experiment.trafficPercent = 0;
    experiment.rollback = {
      at: new Date().toISOString(),
      automatic: true,
      source,
      breaches,
    };
    await this.record("governance.experiments", {
      action: "rollback",
      experimentId: experiment.id,
      rollback: experiment.rollback,
    });
  }

  async graduate(id, actor = "system", reason = "", approvals = {}) {
    this.ensureReady();
    const experiment = this.get(id);
    if (experiment.state !== "running")
      throw Object.assign(new Error("experiment-not-running"), { status: 409 });
    const approvedBy = [
      String(approvals.primary || ""),
      String(approvals.secondary || ""),
    ];
    if (
      approvedBy.some((approver) => approver.length < 3) ||
      approvedBy[0] === approvedBy[1]
    )
      throw Object.assign(new Error("independent-second-approval-required"), {
        status: 403,
      });
    const evidence = graduationEvidence(
        experiment.forecasts,
        this.sequentialPolicy,
      ),
      checks = {
        ...evidence.checks,
        operationalObservations:
          experiment.summary.observations >= this.policy.minimumObservations,
        operationalBreaches: this.breaches(experiment.summary).length === 0,
        noRollback: experiment.rollback === null,
      };
    if (!Object.values(checks).every(Boolean))
      throw Object.assign(new Error("experiment-not-eligible-for-graduation"), {
        status: 422,
        checks,
      });
    const content = {
        version: 1,
        paperOnly: true,
        experimentId: experiment.id,
        modelId: experiment.modelId,
        championVersion: experiment.championVersion,
        challengerVersion: experiment.challengerVersion,
        mode: experiment.mode,
        observations: experiment.summary.observations,
        forecasts: experiment.forecasts.length,
        summary: experiment.summary,
        evidence,
        checks,
        approvedBy,
      },
      artifact = {
        ...content,
        hash: fingerprint(content),
        graduatedAt: new Date().toISOString(),
        graduatedBy: actor,
        reason: String(reason),
      };
    experiment.state = "graduated";
    experiment.trafficPercent = 0;
    experiment.graduation = artifact;
    const accepted = await this.governance.acceptExperimentGraduation(
      artifact,
      actor,
    );
    await this.record("governance.experiments", {
      action: "graduate",
      experimentId: id,
      artifact,
    });
    return { paperOnly: true, artifact, governance: accepted };
  }

  async stop(id, actor = "system", reason = "manual") {
    this.ensureReady();
    const experiment = this.get(id);
    if (experiment.state !== "running")
      throw Object.assign(new Error("experiment-not-running"), { status: 409 });
    experiment.state = "stopped";
    experiment.trafficPercent = 0;
    experiment.stoppedAt = new Date().toISOString();
    experiment.stoppedBy = actor;
    experiment.stopReason = String(reason);
    await this.record("governance.experiments", {
      action: "stop",
      experimentId: id,
      stoppedAt: experiment.stoppedAt,
      stoppedBy: actor,
      reason: experiment.stopReason,
    });
    return structuredClone(experiment);
  }

  list() {
    return {
      paperOnly: true,
      ready: !this.recoveryError,
      policy: this.policy,
      sequentialPolicy: this.sequentialPolicy,
      experiments: [...this.experiments.values()].map((experiment) => ({
        ...structuredClone(experiment),
        observations: experiment.observations.length,
        forecasts: experiment.forecasts.length,
      })),
    };
  }

  recover(events = []) {
    try {
      const recovered = new Map();
      for (const event of events) {
        if (event.action === "start") {
          if (!event.experiment || recovered.has(event.experiment.id))
            throw new Error("invalid-experiment-start-event");
          recovered.set(event.experiment.id, {
            ...structuredClone(event.experiment),
            observations: [],
            forecasts: [],
            summary: summarize([]),
            sequential: summarizeForecasts([], this.sequentialPolicy),
            graduation: null,
          });
          continue;
        }
        const experiment = recovered.get(event.experimentId);
        if (!experiment) throw new Error("orphan-experiment-event");
        if (event.action === "observe") {
          if (
            experiment.state !== "running" ||
            !event.observation?.requestKey ||
            experiment.observations.some(
              (observation) =>
                observation.requestKey === event.observation.requestKey,
            )
          )
            throw new Error("invalid-experiment-observation-event");
          experiment.observations.push(structuredClone(event.observation));
          experiment.summary = summarize(experiment.observations);
        } else if (event.action === "forecast") {
          const recalculated = cleanForecast(
            event.forecast || {},
            this.sequentialPolicy,
          );
          if (
            experiment.state !== "running" ||
            !event.forecast?.requestKey ||
            experiment.forecasts.some(
              (forecast) => forecast.requestKey === event.forecast.requestKey,
            ) ||
            Object.entries(recalculated).some(
              ([field, value]) => event.forecast[field] !== value,
            )
          )
            throw new Error("invalid-experiment-forecast-event");
          experiment.forecasts.push(structuredClone(event.forecast));
          experiment.sequential = summarizeForecasts(
            experiment.forecasts,
            this.sequentialPolicy,
          );
        } else if (event.action === "rollback") {
          if (
            experiment.state !== "running" ||
            (event.rollback?.source === "sequential-monitor" &&
              JSON.stringify(event.rollback.breaches) !==
                JSON.stringify(experiment.sequential.breaches))
          )
            throw new Error("invalid-experiment-rollback-event");
          experiment.state = "rolled-back";
          experiment.trafficPercent = 0;
          experiment.rollback = structuredClone(event.rollback);
        } else if (event.action === "graduate") {
          const { graduatedAt, graduatedBy, reason, hash, ...content } =
              event.artifact || {},
            evidence = graduationEvidence(
              experiment.forecasts,
              this.sequentialPolicy,
            );
          if (
            experiment.state !== "running" ||
            hash !== fingerprint(content) ||
            content.experimentId !== experiment.id ||
            content.paperOnly !== true ||
            content.forecasts !== experiment.forecasts.length ||
            JSON.stringify(content.evidence) !== JSON.stringify(evidence) ||
            !Object.values(content.checks || {}).every(Boolean) ||
            !Array.isArray(content.approvedBy) ||
            content.approvedBy.length !== 2 ||
            content.approvedBy.some((approver) => approver.length < 3) ||
            content.approvedBy[0] === content.approvedBy[1]
          )
            throw new Error("invalid-experiment-graduation-event");
          experiment.state = "graduated";
          experiment.trafficPercent = 0;
          experiment.graduation = structuredClone(event.artifact);
        } else if (event.action === "stop") {
          if (experiment.state !== "running")
            throw new Error("invalid-experiment-stop-event");
          experiment.state = "stopped";
          experiment.trafficPercent = 0;
          experiment.stoppedAt = event.stoppedAt;
          experiment.stoppedBy = event.stoppedBy;
          experiment.stopReason = event.reason;
        } else throw new Error("invalid-experiment-event");
      }
      this.experiments = recovered;
      this.recoveryError = null;
      return { recovered: true, experiments: recovered.size };
    } catch (error) {
      this.recoveryError = error.message;
      throw Object.assign(new Error("experiment-recovery-failed"), {
        cause: error,
      });
    }
  }
}

module.exports = {
  ExperimentService,
  assignmentFraction,
  requestKey,
  cleanOutcome,
  summarize,
};
