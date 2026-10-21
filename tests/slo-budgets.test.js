"use strict";

const assert = require("node:assert/strict"),
  { SloMonitor, windowReport } = require("../server/sre/slo.js");

(() => {
  const now = Date.parse("2026-10-21T12:00:00Z"),
    objective = { target: 0.999, windowMs: 30 * 86400000 },
    healthy = windowReport(
      [{ at: now, good: true, weight: 10000 }],
      objective,
      now,
    );
  assert.equal(healthy.compliance, 1);
  assert.equal(healthy.burnRate, 0);
  assert.equal(healthy.budgetRemaining, 1);

  const exhausted = windowReport(
    [
      { at: now, good: true, weight: 998 },
      { at: now, good: false, weight: 2 },
    ],
    objective,
    now,
  );
  assert.ok(Math.abs(exhausted.compliance - 0.998) < 1e-12);
  assert.ok(Math.abs(exhausted.burnRate - 2) < 1e-12);
  assert.ok(Math.abs(exhausted.allowedBad - 1) < 1e-12);
  assert.equal(exhausted.budgetRemaining, 0);

  const monitor = new SloMonitor({ clock: () => now }),
    events = [
      { at: now - 55 * 60000, good: true, weight: 940 },
      { at: now - 4 * 60000, good: true, weight: 40 },
      { at: now - 3 * 60000, good: false, weight: 20 },
    ],
    report = monitor.evaluate("availability", events);
  assert.equal(report.alerts[0].name, "fast");
  assert.equal(report.alerts[0].firing, true);
  assert.ok(report.alerts[0].long.burnRate > 14.4);
  assert.ok(report.alerts[0].short.burnRate > 14.4);

  const oldOnly = monitor.evaluate("availability", [
    { at: now - 10 * 60000, good: false, weight: 20 },
    { at: now - 2 * 60000, good: true, weight: 1000 },
  ]);
  assert.equal(oldOnly.alerts[0].long.burnRate > 14.4, true);
  assert.equal(oldOnly.alerts[0].short.burnRate, 0);
  assert.equal(oldOnly.alerts[0].firing, false);

  const perfect = new SloMonitor({ clock: () => now });
  perfect.observe("audit", true);
  assert.equal(perfect.evaluate("audit").period.burnRate, 0);
  perfect.observe("audit", false);
  assert.equal(perfect.evaluate("audit").period.burnRate, Infinity);
  assert.throws(
    () =>
      new SloMonitor({
        alerts: [{ name: "bad", longMs: 1, shortMs: 2, burn: 1 }],
      }),
    /invalid-slo-alert-policy/,
  );
  console.log("SLO budget tests: ok");
})();
