"use strict";

const assert = require("node:assert/strict"),
  { openCheckpoint } = require("../server/config/checkpoint.js"),
  { SloTelemetry } = require("../server/sre/telemetry.js"),
  { SreService } = require("../server/sre/service.js");

(async () => {
  let now = Date.parse("2026-10-21T12:00:30Z");
  const written = [],
    options = {
      clock: () => now,
      bucketMs: 60000,
      retentionMs: 10 * 60000,
      policy: { availability: 0.999 },
    },
    telemetry = new SloTelemetry({
      ...options,
      record: async (stream, event) => written.push([stream, event]),
    });
  telemetry.observe("availability", true, now, 99);
  telemetry.observe("availability", false, now);
  assert.equal((await telemetry.flush()).persisted, 1);
  assert.equal((await telemetry.flush()).persisted, 0);
  assert.equal(written[0][0], "sre.slo-telemetry");
  const first = openCheckpoint(written[0][1], "slo-telemetry");
  assert.equal(first.total, 100);
  assert.equal(first.good, 99);
  assert.equal(first.paperOnly, true);

  telemetry.observe("availability", true, now);
  await telemetry.flush();
  assert.equal(written.length, 2);
  assert.equal(
    openCheckpoint(written[1][1], "slo-telemetry").revision,
    first.revision + 1,
  );

  telemetry.observe("freshness", true, now);
  now += 2 * 60000;
  telemetry.observe("freshness", false, now);
  await telemetry.flush();
  assert.equal(telemetry.detectGaps().at(-1).missingBuckets, 1);

  const restored = new SloTelemetry(options),
    recovery = restored.recover(written.map((row) => row[1]));
  assert.equal(recovery.recovered, true);
  assert.equal(recovery.buckets, 3);
  assert.equal(restored.events("availability")[0].weight, 100);
  assert.equal(restored.events("availability")[1].weight, 1);

  const sequenced = new SloTelemetry(options);
  assert.equal(
    sequenced.ingestHttp(
      [
        { seq: 1, at: now, status: 200, latencyMs: 10 },
        { seq: 3, at: now, status: 500, latencyMs: 1000 },
      ],
      500,
    ),
    2,
  );
  assert.equal(sequenced.ingestHttp([{ seq: 3 }], 500), 0);
  assert.equal(sequenced.status().httpGaps[0].missing, 1);
  const pruning = new SloTelemetry(options);
  pruning.observe("audit", true, now - 11 * 60000);
  assert.equal(pruning.status().buckets, 0);

  const tampered = structuredClone(written[0][1]);
  tampered.payload.total++;
  assert.throws(
    () => new SloTelemetry(options).recover([tampered]),
    /integrity/,
  );
  assert.throws(
    () =>
      new SloTelemetry({ ...options, bucketMs: 120000 }).recover([
        written[0][1],
      ]),
    /policy-mismatch/,
  );
  assert.throws(
    () => new SloTelemetry(options).recover([written[1][1], written[0][1]]),
    /revision-regression/,
  );
  assert.throws(
    () => new SloTelemetry({ bucketMs: 0 }),
    /invalid-slo-telemetry-policy/,
  );
  const guarded = new SreService({
    gatewayMetrics: {},
    pipeline: {
      audit: { verify: () => ({ valid: true }) },
      risk: { halted: false },
    },
    dataService: { health: () => ({ status: "healthy", cycleAgeMs: 0 }) },
    requireTelemetryRecovery: true,
  });
  await assert.rejects(() => guarded.snapshot(), /not-recovered/);
  guarded.recoverTelemetry([]);
  assert.equal((await guarded.snapshot()).telemetry.recovery.recovered, true);
  console.log("SLO telemetry tests: ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
