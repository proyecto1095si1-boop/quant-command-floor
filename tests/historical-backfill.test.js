"use strict";

const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { openCheckpoint } = require("../server/config/checkpoint.js"),
  { JsonlStore } = require("../server/data/jsonl-store.js"),
  {
    HistoricalBackfill,
    detectGaps,
    validCandle,
  } = require("../server/data/backfill.js");

(async () => {
  const candle = (seconds) => ({
      type: "candle",
      source: "coinbase",
      symbol: "BTC-USD",
      timeframeSec: 60,
      openTime: new Date(seconds * 1000).toISOString(),
      closeTime: new Date((seconds + 60) * 1000 - 1).toISOString(),
      open: 100,
      high: 101,
      low: 99,
      close: 100,
      volume: 1,
      complete: true,
      receivedAt: "2026-10-21T00:00:00.000Z",
    }),
    gap = detectGaps([candle(0), candle(120)], {
      start: new Date(0).toISOString(),
      end: new Date(180000).toISOString(),
      granularity: 60,
    });
  assert.equal(gap.expected, 3);
  assert.equal(gap.missing, 1);
  assert.equal(validCandle(candle(60), "BTC-USD", 60), true);
  assert.equal(validCandle({ ...candle(60), high: 90 }, "BTC-USD", 60), false);
  assert.deepEqual(gap.ranges, [
    {
      start: "1970-01-01T00:01:00.000Z",
      end: "1970-01-01T00:02:00.000Z",
      candles: 1,
    },
  ]);

  const streams = new Map([["candles.BTC-USD.60", [candle(0), candle(120)]]]),
    store = {
      replay: async (stream) => structuredClone(streams.get(stream) || []),
    },
    append = async (stream, event) => {
      if (!streams.has(stream)) streams.set(stream, []);
      streams.get(stream).push(structuredClone(event));
    },
    connector = {
      candles: async () => [candle(60), candle(300)],
    },
    service = new HistoricalBackfill({
      connector,
      store,
      append,
      clock: () => new Date("2026-10-21T00:00:00Z"),
    }),
    plan = await service.plan({
      product: "BTC-USD",
      start: new Date(0).toISOString(),
      end: new Date(180000).toISOString(),
      granularity: 60,
    });
  assert.equal(plan.mode, "dry-run");
  assert.equal(plan.missing, 1);
  const manifest = await service.execute(plan, "Data Operator"),
    payload = openCheckpoint(manifest, "historical-backfill"),
    staged = streams.get("backfill.candles.BTC-USD.60");
  assert.equal(payload.state, "staged");
  assert.equal(payload.promoted, false);
  assert.equal(payload.rows, 1);
  assert.equal(staged[0].openTime, "1970-01-01T00:01:00.000Z");
  assert.equal(staged[0].staged, true);
  assert.equal(streams.get("candles.BTC-USD.60").length, 2);
  await assert.rejects(
    () => service.execute(plan, "Data Operator"),
    /target-not-empty/,
  );
  await assert.rejects(
    () => service.execute({ ...plan, missing: 2 }, "Data Operator"),
    /invalid-backfill-plan/,
  );
  await assert.rejects(() => service.execute(plan, "x"), /human-approval/);
  assert.throws(
    () =>
      detectGaps([], {
        start: "2026-01-01T00:00:01Z",
        end: "2026-01-01T00:01:00Z",
        granularity: 60,
      }),
    /invalid-backfill-window/,
  );
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "qcf-backfill-")),
    jsonl = new JsonlStore(root, {
      clock: () => new Date("2026-10-21T00:00:00Z"),
    });
  await jsonl.append("candles.TEST.60", candle(60));
  assert.equal(
    (
      await jsonl.replay("candles.TEST.60", {
        from: 60000,
        to: 119999,
        timeField: "openTime",
      })
    ).length,
    1,
  );
  fs.rmSync(root, { recursive: true });
  console.log("historical backfill tests: ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
