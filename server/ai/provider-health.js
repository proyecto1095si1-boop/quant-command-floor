"use strict";

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

class AiProviderHealth {
  constructor({
    configured = false,
    clock = () => Date.now(),
    policy = {},
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

  acquire() {
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
    }
    return { allowed: true, probe: this.state === STATES.HALF_OPEN };
  }

  push(ok, latencyMs) {
    this.samples.push({ ok, latencyMs });
    if (this.samples.length > this.policy.windowSize) this.samples.shift();
  }

  success(latencyMs) {
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
  }

  failure(error, latencyMs) {
    const latency = Math.max(0, Number(latencyMs) || 0);
    this.push(false, latency);
    this.lastFailureAt = this.clock();
    this.lastFailure = String(
      error?.message || error || "provider-failure",
    ).slice(0, 160);
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
  }

  status() {
    const failures = this.samples.filter((sample) => !sample.ok).length,
      latencies = this.samples
        .filter((sample) => sample.ok)
        .map((sample) => sample.latencyMs),
      p95LatencyMs = percentile(latencies, 0.95),
      observed = this.samples.length > 0,
      healthy =
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
    };
  }
}

module.exports = { AiProviderHealth, STATES, percentile };
