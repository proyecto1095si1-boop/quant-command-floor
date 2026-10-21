"use strict";

const { digest, sealCheckpoint } = require("../config/checkpoint.js");

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
    llmConfigured = false,
    record = async () => {},
    clock = () => new Date(),
    policy = {},
  } = {}) {
    this.dataService = dataService;
    this.pipeline = pipeline;
    this.execution = execution;
    this.sre = sre;
    this.governance = governance;
    this.experiments = experiments;
    this.aiEvaluation = aiEvaluation;
    this.calibrationGovernance = calibrationGovernance;
    this.llmConfigured = !!llmConfigured;
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
      typeof calibrationGovernance?.status !== "function"
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
  }

  async evaluate() {
    const data = this.dataService.health(),
      pipeline = this.pipeline.status(),
      execution = this.execution.status(),
      sre = await this.sre.snapshot(),
      governance = this.governance.status(),
      experiments = this.experiments.list(),
      aiEvaluation = this.aiEvaluation.status(),
      calibration = this.calibrationGovernance.status(),
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
          this.llmConfigured,
          this.llmConfigured ? "configured" : "missing",
          "configured",
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
      signature = digest({
        state,
        policyHash: this.policyHash,
        capabilities: body.capabilities,
        reasons: body.reasons.map(({ id, domain, severity }) => ({
          id,
          domain,
          severity,
        })),
      });
    if (signature !== this.lastSignature) {
      await this.record(
        "sre.readiness-transitions",
        sealCheckpoint("operational-readiness", {
          ...decision,
          previousState: this.lastState,
          signature,
        }),
      );
      this.lastState = state;
      this.lastSignature = signature;
    }
    this.lastDecision = decision;
    return structuredClone(decision);
  }
}

module.exports = { ReadinessService, STATES, check, decide };
