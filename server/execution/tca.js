"use strict";

const { bookMetrics } = require("./microstructure.js");
const {
  digest,
  openCheckpoint,
  sealCheckpoint,
} = require("../config/checkpoint.js");

class ExecutionTca {
  constructor({
    clock = () => Date.now(),
    horizonsMs = [60_000, 300_000],
  } = {}) {
    this.clock = clock;
    this.horizonsMs = [...horizonsMs].sort((a, b) => a - b);
    this.records = [];
  }

  record(fill, { arrivalMid, book } = {}) {
    const reference = Number(
        arrivalMid || bookMetrics(book).midpoint || fill.mid,
      ),
      sign = fill.side === "sell" ? -1 : 1,
      priceShortfallBps =
        reference > 0
          ? (sign * (Number(fill.price) - reference) * 10_000) / reference
          : null,
      feeBps =
        Number(fill.notional) > 0
          ? (Number(fill.fee) / Number(fill.notional)) * 10_000
          : null,
      implementationShortfallBps =
        priceShortfallBps == null || feeBps == null
          ? null
          : priceShortfallBps + feeBps,
      record = {
        fillId: fill.id,
        symbol: fill.symbol,
        side: fill.side,
        qty: fill.qty,
        notional: fill.notional,
        arrivalMid: reference || null,
        fillPrice: fill.price,
        fee: fill.fee,
        priceShortfallBps,
        feeBps,
        implementationShortfallBps,
        effectiveSpreadBps:
          priceShortfallBps == null ? null : 2 * priceShortfallBps,
        microstructure: bookMetrics(book),
        filledAtMs: Date.parse(fill.filledAt || fill.at),
        markouts: {},
        paper: true,
      };
    this.records.push(record);
    return structuredClone(record);
  }

  observe(symbol, price, at = this.clock()) {
    const mark = Number(price),
      observedAt = Number(at);
    if (!(mark > 0) || !Number.isFinite(observedAt)) return 0;
    let resolved = 0;
    for (const record of this.records.filter((row) => row.symbol === symbol)) {
      const sign = record.side === "sell" ? -1 : 1;
      for (const horizon of this.horizonsMs) {
        if (
          record.markouts[horizon] == null &&
          observedAt >= record.filledAtMs + horizon
        ) {
          record.markouts[horizon] =
            (sign * (mark - record.fillPrice) * 10_000) / record.fillPrice;
          resolved++;
        }
      }
    }
    return resolved;
  }

  snapshot() {
    const weighted = (field) => {
      const rows = this.records.filter((row) => Number.isFinite(row[field])),
        denominator = rows.reduce((sum, row) => sum + row.notional, 0);
      return denominator
        ? rows.reduce((sum, row) => sum + row[field] * row.notional, 0) /
            denominator
        : null;
    };
    return {
      paperOnly: true,
      fills: this.records.length,
      weightedImplementationShortfallBps: weighted(
        "implementationShortfallBps",
      ),
      weightedEffectiveSpreadBps: weighted("effectiveSpreadBps"),
      pendingMarkouts: this.records.reduce(
        (sum, row) =>
          sum +
          this.horizonsMs.filter((horizon) => row.markouts[horizon] == null)
            .length,
        0,
      ),
      horizonsMs: [...this.horizonsMs],
      records: this.records.slice(-100).map((row) => structuredClone(row)),
    };
  }

  checkpoint() {
    return sealCheckpoint("execution-tca", {
      horizonsMs: this.horizonsMs,
      records: this.records,
    });
  }

  restore(checkpoint) {
    const payload = openCheckpoint(checkpoint, "execution-tca");
    if (digest(payload.horizonsMs) !== digest(this.horizonsMs))
      throw new Error("execution-tca-policy-mismatch");
    if (!Array.isArray(payload.records))
      throw new Error("invalid-execution-tca-state");
    const ids = new Set();
    for (const record of payload.records) {
      if (
        !record ||
        typeof record.fillId !== "string" ||
        ids.has(record.fillId) ||
        !Number.isFinite(record.filledAtMs)
      )
        throw new Error("invalid-execution-tca-state");
      ids.add(record.fillId);
    }
    this.records = structuredClone(payload.records);
    return this.snapshot();
  }
}

module.exports = { ExecutionTca };
