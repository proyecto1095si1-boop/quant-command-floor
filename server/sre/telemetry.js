"use strict";

const {
  digest,
  openCheckpoint,
  sealCheckpoint,
} = require("../config/checkpoint.js");

const OBJECTIVES = new Set(["availability", "latency", "freshness", "audit"]);

class SloTelemetry {
  constructor({
    record = async () => {},
    clock = Date.now,
    bucketMs = 60000,
    retentionMs = 30 * 86400000,
    policy = {},
  } = {}) {
    if (
      !Number.isInteger(bucketMs) ||
      bucketMs < 1000 ||
      !Number.isFinite(retentionMs) ||
      retentionMs < bucketMs
    )
      throw new Error("invalid-slo-telemetry-policy");
    this.record = record;
    this.clock = clock;
    this.bucketMs = bucketMs;
    this.retentionMs = retentionMs;
    this.policyHash = digest({ bucketMs, retentionMs, policy });
    this.buckets = new Map();
    this.dirty = new Set();
    this.lastHttpSequence = 0;
    this.httpGaps = [];
    this.recovery = { recovered: false, buckets: 0, gaps: [] };
  }

  key(objective, start) {
    return `${objective}:${start}`;
  }

  observe(objective, good, at = this.clock(), weight = 1) {
    if (!OBJECTIVES.has(objective)) throw new Error("unknown-slo-objective");
    if (
      !Number.isFinite(at) ||
      !Number.isFinite(weight) ||
      weight <= 0 ||
      at > this.clock()
    )
      throw new Error("invalid-slo-observation");
    const start = Math.floor(at / this.bucketMs) * this.bucketMs,
      key = this.key(objective, start),
      bucket = this.buckets.get(key) || {
        objective,
        start,
        end: start + this.bucketMs,
        total: 0,
        good: 0,
        revision: 0,
      };
    bucket.total += weight;
    if (good) bucket.good += weight;
    bucket.revision++;
    this.buckets.set(key, bucket);
    this.dirty.add(key);
    this.prune();
    return bucket;
  }

  ingestHttp(observations, latencyMs) {
    let ingested = 0;
    for (const event of observations || []) {
      if (!Number.isInteger(event.seq) || event.seq <= this.lastHttpSequence)
        continue;
      if (event.seq > this.lastHttpSequence + 1)
        this.httpGaps.push({
          after: this.lastHttpSequence,
          before: event.seq,
          missing: event.seq - this.lastHttpSequence - 1,
          detectedAt: this.clock(),
        });
      this.observe("availability", Number(event.status) < 500, event.at);
      this.observe("latency", Number(event.latencyMs) <= latencyMs, event.at);
      this.lastHttpSequence = event.seq;
      ingested++;
    }
    this.httpGaps = this.httpGaps.slice(-100);
    return ingested;
  }

  prune() {
    const cutoff = this.clock() - this.retentionMs;
    for (const [key, bucket] of this.buckets)
      if (bucket.end <= cutoff) {
        this.buckets.delete(key);
        this.dirty.delete(key);
      }
  }

  events(objective) {
    return [...this.buckets.values()]
      .filter((bucket) => bucket.objective === objective)
      .sort((a, b) => a.start - b.start)
      .flatMap((bucket) => {
        const bad = bucket.total - bucket.good,
          events = [];
        if (bucket.good)
          events.push({ at: bucket.start, good: true, weight: bucket.good });
        if (bad) events.push({ at: bucket.start, good: false, weight: bad });
        return events;
      });
  }

  async flush() {
    const keys = [...this.dirty].sort(),
      persistedAt = new Date(this.clock()).toISOString();
    for (const key of keys) {
      const bucket = this.buckets.get(key);
      if (!bucket) continue;
      await this.record(
        "sre.slo-telemetry",
        sealCheckpoint("slo-telemetry", {
          ...bucket,
          policyHash: this.policyHash,
          persistedAt,
          paperOnly: true,
        }),
      );
      this.dirty.delete(key);
    }
    return { persisted: keys.length, persistedAt };
  }

  recover(checkpoints = []) {
    const restored = new Map();
    for (const checkpoint of checkpoints) {
      const bucket = openCheckpoint(checkpoint, "slo-telemetry");
      if (bucket.policyHash !== this.policyHash)
        throw new Error("slo-telemetry-policy-mismatch");
      if (
        !OBJECTIVES.has(bucket.objective) ||
        !Number.isFinite(bucket.start) ||
        bucket.start % this.bucketMs !== 0 ||
        bucket.end !== bucket.start + this.bucketMs ||
        !Number.isFinite(bucket.total) ||
        !Number.isFinite(bucket.good) ||
        bucket.total < 0 ||
        bucket.good < 0 ||
        bucket.good > bucket.total ||
        !Number.isInteger(bucket.revision) ||
        bucket.revision < 1 ||
        bucket.paperOnly !== true
      )
        throw new Error("invalid-slo-telemetry-bucket");
      const key = this.key(bucket.objective, bucket.start),
        previous = restored.get(key);
      if (previous && bucket.revision <= previous.revision)
        throw new Error("slo-telemetry-revision-regression");
      restored.set(key, bucket);
    }
    this.buckets = restored;
    this.dirty.clear();
    this.prune();
    const gaps = this.detectGaps(["freshness", "audit"]);
    this.recovery = {
      recovered: true,
      buckets: this.buckets.size,
      gaps,
      policyHash: this.policyHash,
    };
    return { ...this.recovery };
  }

  detectGaps(objectives = [...OBJECTIVES]) {
    const gaps = [];
    for (const objective of objectives) {
      const starts = [...this.buckets.values()]
        .filter((bucket) => bucket.objective === objective)
        .map((bucket) => bucket.start)
        .sort((a, b) => a - b);
      for (let index = 1; index < starts.length; index++)
        if (starts[index] - starts[index - 1] > this.bucketMs)
          gaps.push({
            objective,
            start: starts[index - 1] + this.bucketMs,
            end: starts[index],
            missingBuckets:
              (starts[index] - starts[index - 1]) / this.bucketMs - 1,
          });
    }
    return gaps;
  }

  status() {
    return {
      bucketMs: this.bucketMs,
      retentionMs: this.retentionMs,
      policyHash: this.policyHash,
      buckets: this.buckets.size,
      dirty: this.dirty.size,
      gaps: this.detectGaps(["freshness", "audit"]),
      httpGaps: this.httpGaps.slice(),
      recovery: this.recovery,
    };
  }
}

module.exports = { OBJECTIVES, SloTelemetry };
