"use strict";

const assert = require("node:assert/strict"),
  { createIntelligenceRefresh } = require("../server/intelligence/refresh.js");

(async () => {
  let configured = false,
    scheduled,
    cancelled = false,
    release;
  const calls = [],
    timers = [],
    service = { status: () => ({ providers: { finnhub: { configured } } }) },
    refresher = createIntelligenceRefresh({
      service,
      dag: {
        refresh: async (asset) => {
          calls.push(asset);
          if (asset === "SOL") throw new Error("provider-unavailable");
          await new Promise((resolve) => {
            release = resolve;
          });
        },
      },
      assets: ["BTC", "SOL"],
      setTimer: (fn, delay) => {
        scheduled = fn;
        timers.push(delay);
        return 1;
      },
      clearTimer: () => {
        cancelled = true;
      },
    });
  assert.deepEqual(await refresher.refresh(), {
    status: "not-configured",
    refreshed: 0,
  });
  assert.equal(calls.length, 0, "missing keys must not trigger requests");
  configured = true;
  const pending = refresher.refresh();
  assert.equal(
    refresher.refresh(),
    pending,
    "only one refresh can be in flight",
  );
  release();
  assert.equal(
    (await pending).refreshed,
    1,
    "one failed asset must not abort the others",
  );
  refresher.start();
  refresher.start();
  assert.equal(calls.length, 4, "start is idempotent");
  release();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(timers, [300000]);
  configured = false;
  scheduled();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 4);
  await refresher.stop();
  assert.equal(cancelled, true);
  assert.throws(
    () => createIntelligenceRefresh({ intervalMs: 10 }),
    /invalid-intelligence-refresh/,
  );
  console.log("intelligence refresh tests: ok");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
