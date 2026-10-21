"use strict";

class TrustedClock {
  constructor({
    wallClock = () => Date.now(),
    monotonicClock = () => process.hrtime.bigint(),
    maxDriftMs = 2_000,
  } = {}) {
    if (!Number.isFinite(maxDriftMs) || maxDriftMs < 0)
      throw new Error("invalid-clock-drift-policy");
    this.wallClock = wallClock;
    this.monotonicClock = monotonicClock;
    this.maxDriftMs = maxDriftMs;
    this.originWallMs = Number(wallClock());
    this.originMonotonicNs = BigInt(monotonicClock());
    this.lastWallMs = this.originWallMs;
    this.last = null;
    if (!Number.isFinite(this.originWallMs))
      throw new Error("invalid-wall-clock");
  }

  sample() {
    const wallMs = Number(this.wallClock()),
      monotonicNs = BigInt(this.monotonicClock()),
      elapsedMs = Number(monotonicNs - this.originMonotonicNs) / 1e6,
      expectedWallMs = this.originWallMs + elapsedMs,
      driftMs = wallMs - expectedWallMs,
      backward = wallMs < this.lastWallMs,
      healthy =
        Number.isFinite(wallMs) &&
        monotonicNs >= this.originMonotonicNs &&
        !backward &&
        Math.abs(driftMs) <= this.maxDriftMs;
    this.lastWallMs = Math.max(this.lastWallMs, wallMs);
    this.last = {
      healthy,
      wallMs,
      expectedWallMs,
      driftMs,
      backward,
      sampledAt: Number.isFinite(wallMs)
        ? new Date(wallMs).toISOString()
        : null,
    };
    return { ...this.last };
  }

  now() {
    const sample = this.sample();
    if (!sample.healthy)
      throw Object.assign(new Error("trusted-clock-unhealthy"), {
        status: 503,
        clock: sample,
      });
    return new Date(sample.wallMs);
  }

  status() {
    return this.last
      ? { ...this.last, maxDriftMs: this.maxDriftMs }
      : { healthy: true, maxDriftMs: this.maxDriftMs, sampledAt: null };
  }
}

module.exports = { TrustedClock };
