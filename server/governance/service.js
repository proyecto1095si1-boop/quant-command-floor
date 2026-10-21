"use strict";

const crypto = require("node:crypto"),
  { driftReport } = require("./math.js");

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}

function fingerprint(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

function key(modelId, version) {
  return `${modelId}@${version}`;
}

function optionalNumber(value) {
  return value === undefined || value === null ? null : Number(value);
}

function validateParameters(kind, parameters) {
  const inspect = (value, path = []) => {
    if (!value || typeof value !== "object") return;
    for (const [name, child] of Object.entries(value)) {
      if (
        /^(api[-_]?key|secret|password|credential|access[-_]?token)$/i.test(
          name,
        )
      )
        throw Object.assign(new Error("model-parameters-contain-secret"), {
          status: 422,
          field: [...path, name].join("."),
        });
      inspect(child, [...path, name]);
    }
  };
  inspect(parameters);
  if (kind !== "ai") return;
  const required = ["model", "temperature", "maxTokens", "promptVersion"];
  if (required.some((name) => parameters[name] === undefined))
    throw Object.assign(new Error("incomplete-ai-model-parameters"), {
      status: 422,
    });
  if (!(parameters.temperature >= 0 && parameters.temperature <= 2))
    throw Object.assign(new Error("invalid-ai-temperature"), { status: 422 });
  if (
    !Number.isInteger(parameters.maxTokens) ||
    parameters.maxTokens < 1 ||
    parameters.maxTokens > 200000
  )
    throw Object.assign(new Error("invalid-ai-max-tokens"), { status: 422 });
  if (
    !String(parameters.model).trim() ||
    !String(parameters.promptVersion).trim()
  )
    throw Object.assign(new Error("invalid-ai-model-parameters"), {
      status: 422,
    });
}

class ModelGovernanceService {
  constructor({ record = async () => {}, policy = {} } = {}) {
    this.record = record;
    this.policy = {
      minimumObservations: 250,
      maxPsi: 0.1,
      minKsPValue: 0.05,
      maxStandardizedMeanShift: 0.5,
      minCoveragePValue: 0.05,
      minIndependencePValue: 0.05,
      championTolerance: 0,
      minimumAiCases: 20,
      requiredGraduationKinds: ["consensus"],
      ...policy,
    };
    this.models = new Map();
    this.evaluations = [];
    this.promotions = [];
    this.graduations = [];
    this.recoveryError = null;
  }

  ensureReady() {
    if (this.recoveryError)
      throw Object.assign(new Error("model-governance-recovery-failed"), {
        status: 503,
      });
  }

  async register(input = {}, actor = "system") {
    this.ensureReady();
    const modelId = String(input.modelId || "").trim(),
      version = String(input.version || "").trim(),
      kind = String(input.kind || "").trim();
    if (!modelId || !version || !kind)
      throw Object.assign(new Error("invalid-model-identity"), { status: 422 });
    const id = key(modelId, version);
    if (this.models.has(id))
      throw Object.assign(new Error("model-version-exists"), { status: 409 });
    if (input.artifactHash && !/^[a-f0-9]{64}$/i.test(input.artifactHash))
      throw Object.assign(new Error("invalid-model-artifact-hash"), {
        status: 422,
      });
    validateParameters(kind, input.parameters || {});
    const registeredAt = new Date().toISOString(),
      model = {
        modelId,
        version,
        kind,
        owner: String(input.owner || actor),
        description: String(input.description || ""),
        parameters: canonical(input.parameters || {}),
        artifactHash: input.artifactHash || null,
        configHash: fingerprint({
          modelId,
          version,
          kind,
          parameters: input.parameters || {},
        }),
        stage: "challenger",
        registeredAt,
        registeredBy: actor,
        evaluationIds: [],
      };
    this.models.set(id, model);
    await this.record("governance.models", { action: "register", model });
    return structuredClone(model);
  }

  get(modelId, version) {
    const model = this.models.get(key(modelId, version));
    if (!model)
      throw Object.assign(new Error("model-version-not-found"), {
        status: 404,
      });
    return model;
  }

  list() {
    return {
      paperOnly: true,
      policy: this.policy,
      models: [...this.models.values()].map((model) => structuredClone(model)),
      evaluations: this.evaluations.length,
      promotions: this.promotions.length,
      graduations: this.graduations.length,
    };
  }

  async evaluate(input = {}, actor = "system") {
    this.ensureReady();
    const model = this.get(input.modelId, input.version),
      reference = input.reference || [],
      current = input.current || [],
      availableObservations = Math.min(reference.length, current.length),
      declaredObservations = Number(
        input.metrics?.observations ?? availableObservations,
      ),
      observations = Math.min(availableObservations, declaredObservations),
      drift = driftReport(reference, current, this.policy),
      metrics = {
        observations,
        score: optionalNumber(input.metrics?.score),
        coveragePValue: optionalNumber(input.metrics?.coveragePValue),
        independencePValue: optionalNumber(input.metrics?.independencePValue),
        criticalFailures: Number(input.metrics?.criticalFailures ?? 0),
      },
      checks = {
        observations: observations >= this.policy.minimumObservations,
        score:
          Number.isFinite(metrics.score) &&
          metrics.score >= 0 &&
          metrics.score <= 1,
        coverage:
          Number.isFinite(metrics.coveragePValue) &&
          metrics.coveragePValue <= 1 &&
          metrics.coveragePValue >= this.policy.minCoveragePValue,
        independence:
          Number.isFinite(metrics.independencePValue) &&
          metrics.independencePValue <= 1 &&
          metrics.independencePValue >= this.policy.minIndependencePValue,
        criticalFailures:
          Number.isInteger(metrics.criticalFailures) &&
          metrics.criticalFailures === 0,
        drift: !drift.drifted,
      },
      evaluation = {
        id: crypto.randomUUID(),
        modelId: model.modelId,
        version: model.version,
        at: new Date().toISOString(),
        evaluatedBy: actor,
        datasetHash: fingerprint({
          reference,
          current,
        }),
        metrics,
        drift,
        checks,
        eligible: Object.values(checks).every(Boolean),
      };
    this.evaluations.push(evaluation);
    model.evaluationIds.push(evaluation.id);
    await this.record("governance.evaluations", evaluation);
    return structuredClone(evaluation);
  }

  latestEvaluation(model) {
    const id = model.evaluationIds.at(-1);
    return this.evaluations.find((evaluation) => evaluation.id === id) || null;
  }

  async acceptExternalEvaluation(input = {}, actor = "system") {
    this.ensureReady();
    const model = this.get(input.modelId, input.version);
    if (model.kind !== "ai")
      throw Object.assign(
        new Error("external-ai-evaluation-requires-ai-model"),
        {
          status: 422,
        },
      );
    if (
      input.source !== "ai-adversarial-v1" ||
      !/^[a-f0-9]{64}$/i.test(String(input.datasetHash || ""))
    )
      throw Object.assign(new Error("invalid-external-ai-evaluation"), {
        status: 422,
      });
    const observations = Number(input.observations),
      score = Number(input.score),
      checks = Object.fromEntries(
        Object.entries(input.checks || {}).map(([name, passed]) => [
          name,
          passed === true,
        ]),
      ),
      eligible =
        observations >= this.policy.minimumAiCases &&
        score >= 0 &&
        score <= 1 &&
        Object.keys(checks).length > 0 &&
        Object.values(checks).every(Boolean),
      evaluation = {
        id: crypto.randomUUID(),
        modelId: model.modelId,
        version: model.version,
        at: new Date().toISOString(),
        evaluatedBy: actor,
        source: input.source,
        datasetHash: input.datasetHash,
        runId: input.runId,
        metrics: { observations, score },
        checks: {
          ...checks,
          observations: observations >= this.policy.minimumAiCases,
        },
        eligible,
      };
    this.evaluations.push(evaluation);
    model.evaluationIds.push(evaluation.id);
    await this.record("governance.evaluations", evaluation);
    return structuredClone(evaluation);
  }

  champion(modelId) {
    return [...this.models.values()].find(
      (model) => model.modelId === modelId && model.stage === "champion",
    );
  }

  async acceptExperimentGraduation(input = {}, actor = "system") {
    this.ensureReady();
    const model = this.get(input.modelId, input.challengerVersion),
      { graduatedAt, graduatedBy, reason, hash, ...content } = input;
    if (
      input.paperOnly !== true ||
      input.version !== 1 ||
      model.stage !== "challenger" ||
      model.version !== input.challengerVersion ||
      hash !== fingerprint(content) ||
      !input.experimentId ||
      !Object.values(input.checks || {}).every(Boolean) ||
      !input.evidence?.eligible ||
      this.graduations.some(
        (graduation) => graduation.experimentId === input.experimentId,
      )
    )
      throw Object.assign(new Error("invalid-experiment-graduation"), {
        status: 422,
      });
    const graduation = {
      ...structuredClone(input),
      acceptedAt: new Date().toISOString(),
      acceptedBy: actor,
    };
    this.graduations.push(graduation);
    await this.record("governance.graduations", graduation);
    return structuredClone(graduation);
  }

  async promote(input = {}, approvals = {}) {
    this.ensureReady();
    const model = this.get(input.modelId, input.version),
      evaluation = this.latestEvaluation(model),
      approvers = [
        String(approvals.primary || ""),
        String(approvals.secondary || ""),
      ];
    if (
      approvers.some((approver) => approver.length < 3) ||
      approvers[0] === approvers[1]
    )
      throw Object.assign(new Error("independent-second-approval-required"), {
        status: 403,
      });
    if (!evaluation?.eligible)
      throw Object.assign(new Error("model-not-eligible-for-promotion"), {
        status: 422,
      });
    if (model.stage !== "challenger")
      throw Object.assign(new Error("model-is-not-a-challenger"), {
        status: 409,
      });
    const previous = this.champion(model.modelId),
      previousEvaluation = previous ? this.latestEvaluation(previous) : null,
      graduation = this.graduations
        .filter(
          (item) =>
            item.modelId === model.modelId &&
            item.challengerVersion === model.version,
        )
        .at(-1);
    if (
      previous &&
      this.policy.requiredGraduationKinds.includes(model.kind) &&
      !graduation
    )
      throw Object.assign(new Error("experiment-graduation-required"), {
        status: 422,
      });
    if (
      previousEvaluation &&
      evaluation.metrics.score + this.policy.championTolerance <
        previousEvaluation.metrics.score
    )
      throw Object.assign(new Error("challenger-underperforms-champion"), {
        status: 422,
      });
    if (previous) previous.stage = "retired";
    model.stage = "champion";
    const promotion = {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      modelId: model.modelId,
      version: model.version,
      previousVersion: previous?.version || null,
      evaluationId: evaluation.id,
      graduationId: graduation?.hash || null,
      approvedBy: approvers,
      reason: String(input.reason || ""),
    };
    this.promotions.push(promotion);
    await this.record("governance.promotions", promotion);
    return { paperOnly: true, model: structuredClone(model), promotion };
  }

  status() {
    const champions = [...this.models.values()]
      .filter((model) => model.stage === "champion")
      .map((model) => ({ modelId: model.modelId, version: model.version }));
    return {
      paperOnly: true,
      ready: !this.recoveryError,
      recoveryError: this.recoveryError,
      models: this.models.size,
      evaluations: this.evaluations.length,
      promotions: this.promotions.length,
      graduations: this.graduations.length,
      champions,
      lastPromotion: this.promotions.at(-1) || null,
    };
  }

  recover({
    models = [],
    evaluations = [],
    graduations = [],
    promotions = [],
  } = {}) {
    try {
      const recoveredModels = new Map();
      for (const event of models) {
        if (event.action !== "register" || !event.model)
          throw new Error("invalid-model-event");
        const model = structuredClone(event.model),
          id = key(model.modelId, model.version);
        if (recoveredModels.has(id)) throw new Error("duplicate-model-event");
        model.stage = "challenger";
        model.evaluationIds = [];
        recoveredModels.set(id, model);
      }
      for (const evaluation of evaluations) {
        const model = recoveredModels.get(
          key(evaluation.modelId, evaluation.version),
        );
        if (!model || !evaluation.id)
          throw new Error("orphan-evaluation-event");
        model.evaluationIds.push(evaluation.id);
      }
      const recoveredGraduations = [];
      for (const input of graduations) {
        const model = recoveredModels.get(
            key(input.modelId, input.challengerVersion),
          ),
          {
            acceptedAt,
            acceptedBy,
            graduatedAt,
            graduatedBy,
            reason,
            hash,
            ...content
          } = input;
        if (
          !model ||
          input.paperOnly !== true ||
          hash !== fingerprint(content) ||
          !Object.values(input.checks || {}).every(Boolean) ||
          !input.evidence?.eligible ||
          recoveredGraduations.some(
            (item) => item.experimentId === input.experimentId,
          )
        )
          throw new Error("invalid-graduation-event");
        recoveredGraduations.push(structuredClone(input));
      }
      for (const promotion of promotions) {
        const model = recoveredModels.get(
          key(promotion.modelId, promotion.version),
        );
        const previous = [...recoveredModels.values()].find(
            (candidate) =>
              candidate.modelId === model?.modelId &&
              candidate.stage === "champion",
          ),
          graduation = recoveredGraduations.find(
            (item) => item.hash === promotion.graduationId,
          );
        if (
          !model ||
          !evaluations.some(
            (evaluation) => evaluation.id === promotion.evaluationId,
          ) ||
          (previous &&
            this.policy.requiredGraduationKinds.includes(model.kind) &&
            (!graduation || graduation.challengerVersion !== model.version))
        )
          throw new Error("orphan-promotion-event");
        for (const candidate of recoveredModels.values())
          if (
            candidate.modelId === model.modelId &&
            candidate.stage === "champion"
          )
            candidate.stage = "retired";
        model.stage = "champion";
      }
      this.models = recoveredModels;
      this.evaluations = structuredClone(evaluations);
      this.promotions = structuredClone(promotions);
      this.graduations = recoveredGraduations;
      this.recoveryError = null;
      return {
        recovered: true,
        models: this.models.size,
        evaluations: this.evaluations.length,
        promotions: this.promotions.length,
        graduations: this.graduations.length,
      };
    } catch (error) {
      this.recoveryError = error.message;
      throw Object.assign(new Error("model-governance-recovery-failed"), {
        cause: error,
      });
    }
  }
}

module.exports = {
  ModelGovernanceService,
  fingerprint,
  canonical,
  validateParameters,
};
