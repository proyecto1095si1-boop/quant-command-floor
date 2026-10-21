"use strict";

const {
  digest,
  openCheckpoint,
  sealCheckpoint,
} = require("../config/checkpoint.js");

const STATES = Object.freeze({
  READY: "READY",
  DEGRADED: "DEGRADED",
  HALTED: "HALTED",
});

function check(id, domain, severity, passed, observed, expected, affects = []) {
  return {
    id,
    domain,
    severity,
    passed: !!passed,
    observed,
    expected,
    affects,
  };
}

function decide(checks) {
  const failed = checks.filter((item) => !item.passed),
    state = failed.some((item) => item.severity === "halt")
      ? STATES.HALTED
      : failed.length
        ? STATES.DEGRADED
        : STATES.READY;
  return { state, failed };
}

function decisionSignature({ state, policyHash, capabilities, reasons }) {
  return digest({
    state,
    policyHash,
    capabilities,
    reasons: reasons.map(({ id, domain, severity }) => ({
      id,
      domain,
      severity,
    })),
  });
}

function validDecisionBody(body, policyHash) {
  const capabilities = ["marketAnalysis", "paperExecution", "aiSignals"];
  if (
    body.version !== 1 ||
    body.policyHash !== policyHash ||
    body.paperOnly !== true ||
    body.liveTrading !== false ||
    !Array.isArray(body.checks) ||
    !Array.isArray(body.reasons) ||
    !body.capabilities ||
    !body.summary
  )
    return false;
  if (
    body.checks.some(
      (item) =>
        !item ||
        typeof item.id !== "string" ||
        typeof item.domain !== "string" ||
        !["halt", "degrade"].includes(item.severity) ||
        typeof item.passed !== "boolean" ||
        !Array.isArray(item.affects) ||
        item.affects.some((capability) => !capabilities.includes(capability)),
    ) ||
    new Set(body.checks.map((item) => item.id)).size !== body.checks.length
  )
    return false;
  const { state, failed } = decide(body.checks),
    derivedCapabilities = Object.fromEntries(
      capabilities.map((capability) => [
        capability,
        !failed.some((item) => item.affects.includes(capability)),
      ]),
    ),
    reasons = failed.map(({ id, domain, severity }) => ({
      id,
      domain,
      severity,
    }));
  return (
    body.state === state &&
    digest(body.capabilities) === digest(derivedCapabilities) &&
    digest(
      body.reasons.map(({ id, domain, severity }) => ({
        id,
        domain,
        severity,
      })),
    ) === digest(reasons) &&
    body.summary.total === body.checks.length &&
    body.summary.passed === body.checks.length - failed.length &&
    body.summary.failed === failed.length &&
    body.summary.haltFailures ===
      failed.filter((item) => item.severity === "halt").length &&
    body.summary.degradedFailures ===
      failed.filter((item) => item.severity === "degrade").length
  );
}

class ReadinessService {
  constructor({
    dataService,
    pipeline,
    execution,
    sre,
    governance,
    experiments,
    aiEvaluation,
    calibrationGovernance,
    aiProviderHealth,
    record = async () => {},
    clock = () => new Date(),
    policy = {},
    requireRecovery = false,
  } = {}) {
    this.dataService = dataService;
    this.pipeline = pipeline;
    this.execution = execution;
    this.sre = sre;
    this.governance = governance;
    this.experiments = experiments;
    this.aiEvaluation = aiEvaluation;
    this.calibrationGovernance = calibrationGovernance;
    this.aiProviderHealth = aiProviderHealth;
    this.record = record;
    this.clock = clock;
    if (
      typeof dataService?.health !== "function" ||
      typeof pipeline?.status !== "function" ||
      typeof execution?.status !== "function" ||
      typeof sre?.snapshot !== "function" ||
      typeof governance?.status !== "function" ||
      typeof experiments?.list !== "function" ||
      typeof aiEvaluation?.status !== "function" ||
      typeof calibrationGovernance?.status !== "function" ||
      typeof aiProviderHealth?.status !== "function"
    )
      throw new Error("invalid-readiness-dependencies");
    this.policy = {
      maxExecutionQueue: 100,
      maxRejectionRate: 0.2,
      minExecutionsForRate: 20,
      requireChampion: false,
      ...policy,
    };
    if (
      !Number.isInteger(this.policy.maxExecutionQueue) ||
      this.policy.maxExecutionQueue < 0 ||
      !(
        this.policy.maxRejectionRate >= 0 && this.policy.maxRejectionRate <= 1
      ) ||
      !Number.isInteger(this.policy.minExecutionsForRate) ||
      this.policy.minExecutionsForRate < 1 ||
      typeof this.policy.requireChampion !== "boolean"
    )
      throw new Error("invalid-readiness-policy");
    this.policyHash = digest(this.policy);
    this.lastState = null;
    this.lastSignature = null;
    this.lastDecision = null;
    this.lastTransitionId = null;
    this.recoveryReady = !requireRecovery;
    this.recovery = {
      recovered: !requireRecovery,
      transitions: 0,
      boundaryTruncated: false,
    };
  }

  async evaluate() {
    if (!this.recoveryReady)
      throw Object.assign(new Error("readiness-not-recovered"), {
        status: 503,
      });
    const data = this.dataService.health(),
      pipeline = this.pipeline.status(),
      execution = this.execution.status(),
      sre = await this.sre.snapshot(),
      governance = this.governance.status(),
      experiments = this.experiments.list(),
      aiEvaluation = this.aiEvaluation.status(),
      calibration = this.calibrationGovernance.status(),
      providerHealth = this.aiProviderHealth.status(),
      executions = execution.metrics.children || 0,
      rejectionRate = executions ? execution.metrics.rejected / executions : 0,
      enoughExecutions = executions >= this.policy.minExecutionsForRate,
      hasChampion = governance.champions.length > 0,
      fastBurn = (sre.burnAlerts || []).some((alert) => alert.name === "fast"),
      slowBurn = (sre.burnAlerts || []).some((alert) => alert.name === "slow"),
      telemetryHealthy =
        sre.telemetry.recovery.recovered &&
        sre.telemetry.gaps.length === 0 &&
        sre.telemetry.httpGaps.length === 0,
      checks = [
        check(
          "paper.pipeline",
          "mandate",
          "halt",
          pipeline.paperOnly === true,
          pipeline.paperOnly,
          true,
          ["marketAnalysis", "paperExecution", "aiSignals"],
        ),
        check(
          "paper.execution",
          "mandate",
          "halt",
          execution.paperOnly === true,
          execution.paperOnly,
          true,
          ["marketAnalysis", "paperExecution", "aiSignals"],
        ),
        check(
          "risk.gate",
          "risk",
          "halt",
          !pipeline.risk.halted,
          pipeline.risk.reason || "open",
          "open",
          ["paperExecution"],
        ),
        check(
          "audit.chain",
          "audit",
          "halt",
          pipeline.audit.valid,
          pipeline.audit,
          "valid",
          ["paperExecution"],
        ),
        check(
          "market.health",
          "data",
          "halt",
          data.status === "healthy",
          data.status,
          "healthy",
          ["marketAnalysis", "paperExecution"],
        ),
        check(
          "market.reconciliation",
          "data",
          "halt",
          data.reconciliation.status === "healthy",
          data.reconciliation.status,
          "healthy",
          ["marketAnalysis", "paperExecution"],
        ),
        check(
          "market.clock",
          "data",
          "halt",
          data.provenance.clock.healthy === true,
          data.provenance.clock,
          "healthy",
          ["marketAnalysis", "paperExecution"],
        ),
        check(
          "sre.telemetry",
          "sre",
          "halt",
          telemetryHealthy,
          sre.telemetry,
          "recovered-without-gaps",
          ["paperExecution"],
        ),
        check("sre.fast-burn", "sre", "halt", !fastBurn, fastBurn, false, [
          "paperExecution",
        ]),
        check("sre.slow-burn", "sre", "degrade", !slowBurn, slowBurn, false, [
          "paperExecution",
        ]),
        check(
          "execution.queue",
          "execution",
          "degrade",
          execution.queue <= this.policy.maxExecutionQueue,
          execution.queue,
          `<=${this.policy.maxExecutionQueue}`,
          ["paperExecution"],
        ),
        check(
          "execution.rejections",
          "execution",
          "degrade",
          !enoughExecutions || rejectionRate <= this.policy.maxRejectionRate,
          { executions, rejectionRate, enoughExecutions },
          `<=${this.policy.maxRejectionRate}`,
          ["paperExecution"],
        ),
        check(
          "governance.models",
          "ai",
          "degrade",
          governance.ready === true,
          governance.recoveryError || governance.ready,
          true,
          ["aiSignals"],
        ),
        check(
          "governance.experiments",
          "ai",
          "degrade",
          experiments.ready === true,
          experiments.ready,
          true,
          ["aiSignals"],
        ),
        check(
          "governance.evaluations",
          "ai",
          "degrade",
          aiEvaluation.ready === true,
          aiEvaluation.ready,
          true,
          ["aiSignals"],
        ),
        check(
          "governance.calibration",
          "ai",
          "degrade",
          calibration.ready === true,
          calibration.ready,
          true,
          ["aiSignals"],
        ),
        check(
          "ai.provider",
          "ai",
          "degrade",
          providerHealth.healthy,
          providerHealth,
          "configured-observed-closed-within-latency-policy",
          ["aiSignals"],
        ),
        check(
          "ai.champion",
          "ai",
          "degrade",
          !this.policy.requireChampion || hasChampion,
          hasChampion,
          this.policy.requireChampion ? true : "optional",
          ["aiSignals"],
        ),
      ],
      { state, failed } = decide(checks),
      blocks = (capability) =>
        failed.some((item) => item.affects.includes(capability)),
      body = {
        version: 1,
        at: this.clock().toISOString(),
        state,
        paperOnly: true,
        liveTrading: false,
        policyHash: this.policyHash,
        capabilities: {
          marketAnalysis: !blocks("marketAnalysis"),
          paperExecution: !blocks("paperExecution"),
          aiSignals: !blocks("aiSignals"),
        },
        summary: {
          total: checks.length,
          passed: checks.length - failed.length,
          failed: failed.length,
          haltFailures: failed.filter((item) => item.severity === "halt")
            .length,
          degradedFailures: failed.filter((item) => item.severity === "degrade")
            .length,
        },
        checks,
        reasons: failed.map((item) => ({
          id: item.id,
          domain: item.domain,
          severity: item.severity,
          observed: item.observed,
          expected: item.expected,
        })),
      },
      decision = { id: digest(body), ...body },
      signature = decisionSignature(body);
    if (signature !== this.lastSignature) {
      await this.record(
        "sre.readiness-transitions",
        sealCheckpoint("operational-readiness", {
          ...decision,
          previousState: this.lastState,
          previousId: this.lastTransitionId,
          signature,
        }),
      );
      this.lastState = state;
      this.lastSignature = signature;
      this.lastTransitionId = decision.id;
    }
    this.lastDecision = decision;
    return structuredClone(decision);
  }

  recover(checkpoints = []) {
    let previous = null;
    const seen = new Set();
    for (const checkpoint of checkpoints) {
      const payload = openCheckpoint(checkpoint, "operational-readiness"),
        { previousState, previousId = null, signature, id, ...body } = payload;
      if (
        !validDecisionBody(body, this.policyHash) ||
        digest(body) !== id ||
        decisionSignature(body) !== signature ||
        seen.has(id)
      )
        throw new Error("invalid-readiness-transition");
      const at = Date.parse(body.at);
      if (!Number.isFinite(at)) throw new Error("invalid-readiness-transition");
      if (
        previous &&
        (previousState !== previous.state ||
          (previousId !== null && previousId !== previous.id) ||
          at < previous.at)
      )
        throw new Error("readiness-transition-continuity");
      seen.add(id);
      previous = {
        id,
        state: body.state,
        signature,
        at,
        decision: { id, ...body },
      };
    }
    if (previous) {
      this.lastState = previous.state;
      this.lastSignature = previous.signature;
      this.lastDecision = previous.decision;
      this.lastTransitionId = previous.id;
    }
    this.recoveryReady = true;
    this.recovery = {
      recovered: true,
      transitions: checkpoints.length,
      boundaryTruncated:
        checkpoints.length > 0 &&
        openCheckpoint(checkpoints[0], "operational-readiness")
          .previousState !== null,
      lastId: previous?.id || null,
      lastState: previous?.state || null,
      policyHash: this.policyHash,
    };
    return structuredClone(this.recovery);
  }

  status() {
    return {
      ready: this.recoveryReady,
      policyHash: this.policyHash,
      recovery: structuredClone(this.recovery),
      lastDecision: structuredClone(this.lastDecision),
    };
  }
}

module.exports = {
  ReadinessService,
  STATES,
  check,
  decide,
  decisionSignature,
  validDecisionBody,
};
