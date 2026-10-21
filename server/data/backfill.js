"use strict";

const { digest, sealCheckpoint } = require("../config/checkpoint.js");

const ALLOWED_GRANULARITIES = new Set([60, 300, 900, 3600, 21600, 86400]);

function candleTime(candle) {
  return Date.parse(candle.openTime || candle.exchangeAt || "");
}

function validCandle(candle, product, granularity) {
  const open = Number(candle.open),
    high = Number(candle.high),
    low = Number(candle.low),
    close = Number(candle.close),
    volume = Number(candle.volume);
  return (
    candle.symbol === product &&
    Number(candle.timeframeSec) === granularity &&
    [open, high, low, close, volume].every(Number.isFinite) &&
    open > 0 &&
    close > 0 &&
    high >= Math.max(open, close) &&
    low <= Math.min(open, close) &&
    low > 0 &&
    volume >= 0 &&
    candle.complete === true
  );
}

function detectGaps(candles, { start, end, granularity }) {
  const stepMs = Number(granularity) * 1000,
    startMs = Date.parse(start),
    endMs = Date.parse(end);
  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    !(endMs > startMs) ||
    !ALLOWED_GRANULARITIES.has(Number(granularity)) ||
    startMs % stepMs !== 0 ||
    endMs % stepMs !== 0
  )
    throw new Error("invalid-backfill-window");
  const present = new Set(
      (candles || [])
        .map(candleTime)
        .filter((at) => at >= startMs && at < endMs && at % stepMs === 0),
    ),
    missing = [];
  for (let at = startMs; at < endMs; at += stepMs)
    if (!present.has(at)) missing.push(at);
  const ranges = [];
  for (const at of missing) {
    const last = ranges.at(-1);
    if (last && last.endMs === at) last.endMs += stepMs;
    else ranges.push({ startMs: at, endMs: at + stepMs });
  }
  return {
    expected: (endMs - startMs) / stepMs,
    present: present.size,
    missing: missing.length,
    missingTimes: missing,
    ranges: ranges.map((range) => ({
      start: new Date(range.startMs).toISOString(),
      end: new Date(range.endMs).toISOString(),
      candles: (range.endMs - range.startMs) / stepMs,
    })),
  };
}

class HistoricalBackfill {
  constructor({
    connector,
    store,
    append,
    clock = () => new Date(),
    maxRangeMs = 7 * 86400000,
    maxCandles = 10000,
  } = {}) {
    this.connector = connector;
    this.store = store;
    this.append = append;
    this.clock = clock;
    if (
      !Number.isFinite(maxRangeMs) ||
      maxRangeMs <= 0 ||
      !Number.isInteger(maxCandles) ||
      maxCandles < 1
    )
      throw new Error("invalid-backfill-policy");
    this.policy = { maxRangeMs, maxCandles, chunkCandles: 300 };
  }

  async plan({ product, start, end, granularity = 60 } = {}) {
    const symbol = String(product || "").toUpperCase(),
      startMs = Date.parse(start),
      endMs = Date.parse(end),
      step = Number(granularity),
      stepMs = step * 1000;
    if (!/^[A-Z0-9]+-[A-Z0-9]+$/.test(symbol))
      throw new Error("invalid-backfill-product");
    if (
      !Number.isFinite(startMs) ||
      !Number.isFinite(endMs) ||
      endMs - startMs > this.policy.maxRangeMs ||
      endMs > Math.floor(this.clock().getTime() / stepMs) * stepMs
    )
      throw new Error("backfill-range-exceeded");
    const stream = `candles.${symbol}.${step}`,
      existing = await this.store.replay(stream, {
        from: startMs,
        to: endMs - 1,
        limit: this.policy.maxCandles + 1,
        timeField: "openTime",
      }),
      gaps = detectGaps(existing, { start, end, granularity: step });
    if (gaps.expected > this.policy.maxCandles)
      throw new Error("backfill-candle-limit-exceeded");
    const body = {
        version: 1,
        product: symbol,
        granularity: step,
        start: new Date(startMs).toISOString(),
        end: new Date(endMs).toISOString(),
        sourceStream: stream,
        targetStream: `backfill.candles.${symbol}.${step}`,
        expected: gaps.expected,
        present: gaps.present,
        missing: gaps.missing,
        missingTimes: gaps.missingTimes.map((at) => new Date(at).toISOString()),
        ranges: gaps.ranges,
        policy: { ...this.policy },
        mode: "dry-run",
        paperOnly: true,
      },
      id = digest(body);
    return { id, ...body };
  }

  async execute(plan, approvedBy) {
    if (typeof approvedBy !== "string" || approvedBy.trim().length < 3)
      throw new Error("human-approval-required");
    const { id, ...body } = plan || {};
    if (id !== digest(body) || body.mode !== "dry-run" || !body.paperOnly)
      throw new Error("invalid-backfill-plan");
    if (digest(body.policy) !== digest(this.policy))
      throw new Error("backfill-policy-mismatch");
    const current = await this.plan(body);
    if (current.id !== id) throw new Error("backfill-plan-stale");
    const wanted = new Set(body.missingTimes || []),
      staged = await this.store.replay(body.targetStream, {
        from: Date.parse(body.start),
        to: Date.parse(body.end) - 1,
        limit: this.policy.maxCandles + 1,
        timeField: "openTime",
      });
    if (!wanted.size) throw new Error("backfill-no-gaps");
    if (staged.some((candle) => wanted.has(candle.openTime)))
      throw new Error("backfill-target-not-empty");
    const received = [];
    for (const range of body.ranges || []) {
      const stepMs = body.granularity * 1000;
      for (
        let chunkStart = Date.parse(range.start);
        chunkStart < Date.parse(range.end);
        chunkStart += this.policy.chunkCandles * stepMs
      ) {
        const chunkEnd = Math.min(
          Date.parse(range.end),
          chunkStart + this.policy.chunkCandles * stepMs,
        );
        const candles = await this.connector.candles(body.product, {
          granularity: body.granularity,
          start: chunkStart,
          end: chunkEnd,
        });
        for (const candle of candles)
          if (
            wanted.has(candle.openTime) &&
            validCandle(candle, body.product, body.granularity)
          )
            received.push(candle);
      }
    }
    const unique = new Map(received.map((candle) => [candle.openTime, candle]));
    if (unique.size !== wanted.size)
      throw new Error("backfill-source-incomplete");
    const retrievedAt = this.clock().toISOString(),
      rows = [...unique.values()]
        .sort((a, b) => candleTime(a) - candleTime(b))
        .map((candle) => ({
          ...candle,
          backfill: { planId: id, approvedBy: approvedBy.trim(), retrievedAt },
          staged: true,
          paper: true,
        }));
    for (const row of rows) await this.append(body.targetStream, row);
    const manifest = sealCheckpoint("historical-backfill", {
      planId: id,
      product: body.product,
      granularity: body.granularity,
      source: String(rows[0]?.source || "unknown"),
      targetStream: body.targetStream,
      rows: rows.length,
      datasetHash: digest(rows),
      approvedBy: approvedBy.trim(),
      retrievedAt,
      state: "staged",
      promoted: false,
      paperOnly: true,
    });
    await this.append("backfill.manifests", manifest);
    return manifest;
  }
}

module.exports = {
  ALLOWED_GRANULARITIES,
  HistoricalBackfill,
  detectGaps,
  validCandle,
};
