(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.QCFData = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  class DataPlane {
    constructor(opts = {}) {
      this.maxAgeMs = opts.maxAgeMs || 15000;
      this.maxGapMs = opts.maxGapMs || 60000;
      this.outlierPct = opts.outlierPct || 0.12;
      this.divergencePct = opts.divergencePct || 0.015;
      this.records = [];
      this.latest = new Map();
    }
    normalize(raw, source = "unknown") {
      if (!raw || !Number.isFinite(+raw.price))
        throw new Error("price required");
      return {
        source,
        symbol: String(raw.symbol || "BTCUSDT").toUpperCase(),
        price: +raw.price,
        volume: Math.max(0, +raw.volume || 0),
        timestamp: +raw.timestamp || Date.now(),
        kind: raw.kind || "tick",
      };
    }
    ingest(raw, source) {
      const r = this.normalize(raw, source),
        key = `${r.source}:${r.symbol}`,
        prev = this.latest.get(key);
      r.gap = !!(prev && r.timestamp - prev.timestamp > this.maxGapMs);
      r.outlier = !!(
        prev && Math.abs(r.price / prev.price - 1) > this.outlierPct
      );
      this.records.push(r);
      this.latest.set(key, r);
      return r;
    }
    health(symbol = "BTCUSDT", at = Date.now()) {
      const rows = [...this.latest.values()].filter((x) => x.symbol === symbol),
        stale = rows.filter((x) => at - x.timestamp > this.maxAgeMs),
        prices = rows
          .filter((x) => at - x.timestamp <= this.maxAgeMs)
          .map((x) => x.price),
        spread =
          prices.length > 1
            ? (Math.max(...prices) - Math.min(...prices)) /
              (prices.reduce((a, b) => a + b, 0) / prices.length)
            : 0;
      return {
        status:
          !rows.length || stale.length === rows.length
            ? "down"
            : spread > this.divergencePct
              ? "degraded"
              : "healthy",
        sources: rows.length,
        stale: stale.map((x) => x.source),
        divergence: spread,
        gaps: this.records.filter((x) => x.symbol === symbol && x.gap).length,
        outliers: this.records.filter((x) => x.symbol === symbol && x.outlier)
          .length,
      };
    }
    replay(handler, filter = {}) {
      return this.records
        .filter(
          (x) =>
            (!filter.symbol || x.symbol === filter.symbol) &&
            (!filter.source || x.source === filter.source),
        )
        .sort((a, b) => a.timestamp - b.timestamp)
        .map((x, i) => handler({ ...x, replayIndex: i }));
    }
    snapshot() {
      return this.records.map((x) => ({ ...x }));
    }
  }
  return { DataPlane };
});
