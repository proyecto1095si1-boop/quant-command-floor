"use strict";
class DataQualityMonitor {
  constructor({
    maxAgeMs = 15000,
    maxGapMs = 30000,
    zLimit = 4,
    window = 101,
  } = {}) {
    this.maxAgeMs = maxAgeMs;
    this.maxGapMs = maxGapMs;
    this.zLimit = zLimit;
    this.window = window;
    this.series = new Map();
    this.counters = { observations: 0, outliers: 0, gaps: 0 };
  }
  observe(event) {
    const key = `${event.source}:${event.symbol}:${event.type}`,
      at = Date.parse(event.exchangeAt || event.receivedAt),
      value = Number(event.price ?? event.close),
      row = this.series.get(key) || {
        lastAt: 0,
        values: [],
        lastReceivedAt: 0,
      };
    const gap =
      row.lastAt && at - row.lastAt > this.maxGapMs ? at - row.lastAt : 0;
    if (gap) {
      row.gapMs = gap;
      this.counters.gaps++;
    }
    let robustZ = 0,
      outlier = false;
    if (Number.isFinite(value) && row.values.length >= 7) {
      const sorted = [...row.values].sort((a, b) => a - b),
        median = sorted[Math.floor(sorted.length / 2)],
        dev = sorted.map((x) => Math.abs(x - median)).sort((a, b) => a - b),
        mad = dev[Math.floor(dev.length / 2)];
      robustZ = mad ? (0.6745 * (value - median)) / mad : 0;
      outlier = Math.abs(robustZ) > this.zLimit;
      if (outlier) this.counters.outliers++;
    }
    if (Number.isFinite(value)) {
      row.values.push(value);
      if (row.values.length > this.window) row.values.shift();
    }
    row.lastAt = Math.max(row.lastAt, at || 0);
    row.lastReceivedAt = Date.parse(event.receivedAt) || Date.now();
    row.robustZ = robustZ;
    row.outlier = outlier;
    this.series.set(key, row);
    this.counters.observations++;
    return { key, gapMs: gap, robustZ, outlier };
  }
  snapshot(now = Date.now()) {
    const streams = [...this.series].map(([key, x]) => ({
      key,
      ageMs: now - x.lastReceivedAt,
      gapMs: x.gapMs || 0,
      robustZ: x.robustZ || 0,
      outlier: !!x.outlier,
      status:
        now - x.lastReceivedAt > this.maxAgeMs
          ? "stale"
          : x.outlier
            ? "outlier"
            : x.gapMs > this.maxGapMs
              ? "gap"
              : "healthy",
    }));
    return {
      status: streams.some(
        (x) => x.status === "stale" || x.status === "outlier",
      )
        ? "degraded"
        : "healthy",
      streams,
      counters: { ...this.counters },
      limits: {
        maxAgeMs: this.maxAgeMs,
        maxGapMs: this.maxGapMs,
        zLimit: this.zLimit,
      },
    };
  }
}
module.exports = { DataQualityMonitor };
