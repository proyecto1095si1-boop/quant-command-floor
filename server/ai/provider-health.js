"use strict";

const {
  digest,
  openCheckpoint,
  sealCheckpoint,
} = require("../config/checkpoint.js");

const STATES = Object.freeze({
  CLOSED: "CLOSED",
  OPEN: "OPEN",
  HALF_OPEN: "HALF_OPEN",
});

function percentile(values, probability) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b),
    index = Math.ceil(probability * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function failureCode(error) {
  const message = String(error?.message || error || "");
  if (error?.name === "AbortError") return "provider-timeout";
  if (/^llm-http-\d{3}$/.test(message)) return message;
  if (error instanceof SyntaxError) return "provider-invalid-response";
  return "provider-request-failed";
}

function validTransition(from, to) {
  return (
    from === null ||
    from === to ||
    (from === STATES.CLOSED && to === STATES.OPEN) ||
    (from === STATES.OPEN && to === STATES.HALF_OPEN) ||
    (from === STATES.HALF_OPEN && [STATES.CLOSED, STATES.OPEN].includes(to))
  );
}

class AiProviderHealth {
  constructor({
    configured = false,
    clock = () => Date.now(),
    policy = {},
    record = async () => {},
    requireRecovery = false,
  } = {}) {
    this.configured = !!configured;
    this.clock = clock;
    this.policy = {
      windowSize: 20,
      minSamples: 5,
      failureRate: 0.5,
      consecutiveFailures: 3,
      latencyP95Ms: 5000,
      cooldownMs: 30000,
      ...policy,
    };
    this.policyHash = digest(this.policy);
    this.record = record;
    if (
      !Number.isInteger(this.policy.windowSize) ||
      this.policy.windowSize < 1 ||
      !Number.isInteger(this.policy.minSamples) ||
      this.policy.minSamples < 1 ||
      this.policy.minSamples > this.policy.windowSize ||
      !(this.policy.failureRate > 0 && this.policy.failureRate <= 1) ||
      !Number.isInteger(this.policy.consecutiveFailures) ||
      this.policy.consecutiveFailures < 1 ||
      !Number.isFinite(this.policy.latencyP95Ms) ||
      this.policy.latencyP95Ms <= 0 ||
      !Number.isFinite(this.policy.cooldownMs) ||
      this.policy.cooldownMs < 1
    )
      throw new Error("invalid-ai-provider-health-policy");
    this.state = STATES.CLOSED;
    this.samples = [];
    this.consecutiveFailureCount = 0;
    this.openedAt = null;
    this.lastSuccessAt = null;
    this.lastFailureAt = null;
    this.lastFailure = null;
    this.halfOpenProbe = false;
    this.transitions = 0;
    this.openReason = null;
    this.revision = 0;
    this.lastCheckpointId = null;
    this.recoveryReady = !requireRecovery;
    this.recovery = {
      recovered: !requireRecovery,
      checkpoints: 0,
      boundaryTruncated: false,
    };
  }

  transition(state, reason = null) {
    if (this.state !== state) {
      this.state = state;
      this.transitions++;
    }
    if (state === STATES.OPEN) {
      this.openedAt = this.clock();
      this.openReason = reason || this.openReason || "policy-threshold";
    } else if (state === STATES.CLOSED) this.openReason = null;
    if (state !== STATES.HALF_OPEN) this.halfOpenProbe = false;
  }

  async acquire() {
    if (!this.recoveryReady)
      return { allowed: false, reason: "provider-health-not-recovered" };
    if (!this.configured)
      return { allowed: false, reason: "provider-not-configured" };
    if (
      this.state === STATES.OPEN &&
      this.clock() - this.openedAt >= this.policy.cooldownMs
    )
      this.transition(STATES.HALF_OPEN);
    if (this.state === STATES.OPEN)
      return { allowed: false, reason: "circuit-open" };
    if (this.state === STATES.HALF_OPEN) {
      if (this.halfOpenProbe)
        return { allowed: false, reason: "half-open-probe-in-flight" };
      this.halfOpenProbe = true;
      try {
        await this.persist();
      } catch {
        return { allowed: false, reason: "provider-health-persistence-failed" };
      }
    }
    return { allowed: true, probe: this.state === STATES.HALF_OPEN };
  }

  push(ok, latencyMs) {
    this.samples.push({ ok, latencyMs });
    if (this.samples.length > this.policy.windowSize) this.samples.shift();
  }

  async success(latencyMs) {
    const latency = Math.max(0, Number(latencyMs) || 0);
    this.push(true, latency);
    this.lastSuccessAt = this.clock();
    this.consecutiveFailureCount = 0;
    const p95 = percentile(
        this.samples
          .filter((sample) => sample.ok)
          .map((sample) => sample.latencyMs),
        0.95,
      ),
      latencyBreached =
        this.samples.length >= this.policy.minSamples &&
        p95 > this.policy.latencyP95Ms;
    if (latencyBreached) this.transition(STATES.OPEN, "latency-p95");
    else if (this.state === STATES.HALF_OPEN) this.transition(STATES.CLOSED);
    this.halfOpenProbe = false;
    await this.persist();
  }

  async failure(error, latencyMs) {
    const latency = Math.max(0, Number(latencyMs) || 0);
    this.push(false, latency);
    this.lastFailureAt = this.clock();
    this.lastFailure = failureCode(error);
    this.consecutiveFailureCount++;
    const failures = this.samples.filter((sample) => !sample.ok).length,
      rate = failures / this.samples.length,
      shouldOpen =
        this.state === STATES.HALF_OPEN ||
        this.consecutiveFailureCount >= this.policy.consecutiveFailures ||
        (this.samples.length >= this.policy.minSamples &&
          rate >= this.policy.failureRate);
    if (shouldOpen) this.transition(STATES.OPEN, "failure-threshold");
    this.halfOpenProbe = false;
    await this.persist();
  }

  checkpointBody() {
    return {
      version: 1,
      at: this.clock(),
      policyHash: this.policyHash,
      configured: this.configured,
      revision: this.revision + 1,
      previousId: this.lastCheckpointId,
      state: this.state,
      samples: structuredClone(this.samples),
      consecutiveFailures: this.consecutiveFailureCount,
      openedAt: this.openedAt,
      lastSuccessAt: this.lastSuccessAt,
      lastFailureAt: this.lastFailureAt,
      lastFailure: this.lastFailure,
      openReason: this.openReason,
      transitions: this.transitions,
    };
  }

  async persist() {
    const body = this.checkpointBody(),
      payload = { id: digest(body), ...body };
    try {
      await this.record(
        "sre.ai-provider-health",
        sealCheckpoint("ai-provider-health", payload),
      );
    } catch (error) {
      this.recoveryReady = false;
      this.recovery = {
        recovered: false,
        checkpoints: this.revision,
        boundaryTruncated: false,
        error: "persistence-failed",
      };
      throw Object.assign(new Error("provider-health-persistence-failed"), {
        cause: error,
        providerHealthPersistence: true,
      });
    }
    this.revision = body.revision;
    this.lastCheckpointId = payload.id;
    this.recovery = {
      ...this.recovery,
      recovered: true,
      checkpoints: (this.recovery.checkpoints || 0) + 1,
      lastId: payload.id,
      revision: body.revision,
      policyHash: this.policyHash,
    };
  }

  recover(checkpoints = []) {
    let previous = null;
    for (const checkpoint of checkpoints) {
      const payload = openCheckpoint(checkpoint, "ai-provider-health"),
        { id, ...body } = payload,
        trailingFailures = [...(body.samples || [])]
          .reverse()
          .findIndex((sample) => sample.ok),
        expectedConsecutive =
          trailingFailures === -1
            ? (body.samples || []).length
            : trailingFailures;
      if (
        body.version !== 1 ||
        body.policyHash !== this.policyHash ||
        body.configured !== this.configured ||
        digest(body) !== id ||
        !Object.values(STATES).includes(body.state) ||
        !Number.isInteger(body.revision) ||
        body.revision < 1 ||
        !Number.isFinite(body.at) ||
        !Array.isArray(body.samples) ||
        body.samples.length > this.policy.windowSize ||
        body.samples.some(
          (sample) =>
            typeof sample?.ok !== "boolean" ||
            !Number.isFinite(sample.latencyMs) ||
            sample.latencyMs < 0,
        ) ||
        !Number.isInteger(body.consecutiveFailures) ||
        body.consecutiveFailures < 0 ||
        body.consecutiveFailures > body.samples.length ||
        body.consecutiveFailures !== expectedConsecutive ||
        !Number.isInteger(body.transitions) ||
        body.transitions < 0 ||
        ![
          null,
          "failure-threshold",
          "latency-p95",
          "policy-threshold",
        ].includes(body.openReason) ||
        ![body.openedAt, body.lastSuccessAt, body.lastFailureAt].every(
          (value) => value === null || Number.isFinite(value),
        ) ||
        !(body.lastFailure === null || typeof body.lastFailure === "string") ||
        !(body.previousId === null || typeof body.previousId === "string") ||
        (body.state === STATES.OPEN && body.openedAt === null) ||
        (body.state === STATES.CLOSED && body.openReason !== null) ||
        !validTransition(previous?.state || null, body.state) ||
        (previous &&
          (body.revision !== previous.revision + 1 ||
            body.previousId !== previous.id ||
            body.at < previous.at ||
            body.transitions < previous.transitions ||
            body.transitions > previous.transitions + 1))
      )
        throw new Error("invalid-ai-provider-health-checkpoint");
      previous = { id, ...body };
    }
    if (previous) {
      this.state = previous.state;
      this.samples = structuredClone(previous.samples);
      this.consecutiveFailureCount = previous.consecutiveFailures;
      this.openedAt = previous.openedAt;
      this.lastSuccessAt = previous.lastSuccessAt;
      this.lastFailureAt = previous.lastFailureAt;
      this.lastFailure = previous.lastFailure;
      this.openReason = previous.openReason;
      this.transitions = previous.transitions;
      this.revision = previous.revision;
      this.lastCheckpointId = previous.id;
      this.halfOpenProbe = false;
    }
    this.recoveryReady = true;
    this.recovery = {
      recovered: true,
      checkpoints: checkpoints.length,
      boundaryTruncated:
        checkpoints.length > 0 &&
        openCheckpoint(checkpoints[0], "ai-provider-health").revision > 1,
      lastId: previous?.id || null,
      revision: previous?.revision || 0,
      policyHash: this.policyHash,
    };
    return structuredClone(this.recovery);
  }

  status() {
    const failures = this.samples.filter((sample) => !sample.ok).length,
      latencies = this.samples
        .filter((sample) => sample.ok)
        .map((sample) => sample.latencyMs),
      p95LatencyMs = percentile(latencies, 0.95),
      observed = this.samples.length > 0,
      healthy =
        this.recoveryReady &&
        this.configured &&
        observed &&
        this.state === STATES.CLOSED &&
        (p95LatencyMs === null || p95LatencyMs <= this.policy.latencyP95Ms);
    return {
      configured: this.configured,
      state: this.state,
      healthy,
      observed,
      samples: this.samples.length,
      successes: this.samples.length - failures,
      failures,
      failureRate: this.samples.length ? failures / this.samples.length : 0,
      consecutiveFailures: this.consecutiveFailureCount,
      p95LatencyMs,
      lastSuccessAt: this.lastSuccessAt,
      lastFailureAt: this.lastFailureAt,
      lastFailure: this.lastFailure,
      openedAt: this.openedAt,
      openReason: this.openReason,
      cooldownRemainingMs:
        this.state === STATES.OPEN
          ? Math.max(0, this.policy.cooldownMs - (this.clock() - this.openedAt))
          : 0,
      transitions: this.transitions,
      policy: { ...this.policy },
      policyHash: this.policyHash,
      recovery: structuredClone(this.recovery),
    };
  }
}

module.exports = {
  AiProviderHealth,
  STATES,
  failureCode,
  percentile,
  validTransition,
};
