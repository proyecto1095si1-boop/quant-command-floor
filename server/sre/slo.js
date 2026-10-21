"use strict";

const DAY_MS = 86400000;

const DEFAULT_OBJECTIVES = Object.freeze({
  availability: { target: 0.999, windowMs: 30 * DAY_MS },
  latency: { target: 0.95, windowMs: 30 * DAY_MS, thresholdMs: 500 },
  freshness: { target: 0.99, windowMs: 30 * DAY_MS, thresholdMs: 15000 },
  audit: { target: 1, windowMs: 30 * DAY_MS },
});

const DEFAULT_ALERTS = Object.freeze([
  { name: "fast", longMs: 60 * 60 * 1000, shortMs: 5 * 60 * 1000, burn: 14.4 },
  {
    name: "slow",
    longMs: 6 * 60 * 60 * 1000,
    shortMs: 30 * 60 * 1000,
    burn: 6,
  },
]);

function validateObjective(name, objective) {
  if (
    !objective ||
    !(objective.target > 0 && objective.target <= 1) ||
    !Number.isFinite(objective.windowMs) ||
    objective.windowMs <= 0
  )
    throw new Error(`invalid-slo-objective:${name}`);
  return { ...objective };
}

function windowReport(events, { target, windowMs }, now) {
  const start = now - windowMs;
  let total = 0,
    good = 0,
    firstAt = null,
    lastAt = null;
  for (const event of events || []) {
    const at = Number(event.at),
      weight = Number(event.weight ?? 1);
    if (at < start || at > now || !Number.isFinite(weight) || weight <= 0)
      continue;
    total += weight;
    if (event.good) good += weight;
    firstAt = firstAt === null ? at : Math.min(firstAt, at);
    lastAt = lastAt === null ? at : Math.max(lastAt, at);
  }
  const bad = total - good,
    compliance = total ? good / total : null,
    allowedRate = 1 - target,
    burnRate = total
      ? allowedRate
        ? bad / total / allowedRate
        : bad
          ? Infinity
          : 0
      : null,
    allowedBad = total * allowedRate,
    budgetRemaining = total
      ? allowedBad
        ? Math.max(0, 1 - bad / allowedBad)
        : bad
          ? 0
          : 1
      : null;
  return {
    windowMs,
    target,
    total,
    good,
    bad,
    compliance,
    burnRate,
    allowedBad,
    budgetRemaining,
    firstAt,
    lastAt,
    observedSpanMs: firstAt === null ? 0 : lastAt - firstAt,
    completeWindow: firstAt !== null && firstAt <= start,
  };
}

class SloMonitor {
  constructor({
    objectives = {},
    alerts = DEFAULT_ALERTS,
    clock = Date.now,
  } = {}) {
    this.clock = clock;
    this.objectives = Object.fromEntries(
      Object.entries({ ...DEFAULT_OBJECTIVES, ...objectives }).map(
        ([name, objective]) => [name, validateObjective(name, objective)],
      ),
    );
    this.alerts = alerts.map((alert) => {
      if (
        !alert?.name ||
        !Number.isFinite(alert.longMs) ||
        !Number.isFinite(alert.shortMs) ||
        !Number.isFinite(alert.burn) ||
        alert.shortMs <= 0 ||
        alert.longMs < alert.shortMs ||
        alert.burn <= 0
      )
        throw new Error("invalid-slo-alert-policy");
      return { ...alert };
    });
    this.samples = { freshness: [], audit: [] };
  }

  observe(name, good, value = null) {
    if (!this.samples[name]) this.samples[name] = [];
    this.samples[name].push({ at: this.clock(), good: !!good, value });
    const longest = Math.max(
        this.objectives[name]?.windowMs || 0,
        ...this.alerts.map((alert) => alert.longMs),
      ),
      cutoff = this.clock() - longest;
    this.samples[name] = this.samples[name].filter(
      (event) => event.at >= cutoff,
    );
  }

  evaluate(name, events = this.samples[name] || []) {
    const objective = this.objectives[name];
    if (!objective) throw new Error(`unknown-slo:${name}`);
    const now = this.clock(),
      period = windowReport(events, objective, now),
      alerts = this.alerts.map((policy) => {
        const long = windowReport(
            events,
            { ...objective, windowMs: policy.longMs },
            now,
          ),
          short = windowReport(
            events,
            { ...objective, windowMs: policy.shortMs },
            now,
          ),
          firing =
            long.total > 0 &&
            short.total > 0 &&
            long.burnRate >= policy.burn &&
            short.burnRate >= policy.burn;
        return { ...policy, long, short, firing };
      });
    return { name, ...objective, period, alerts };
  }
}

module.exports = {
  DAY_MS,
  DEFAULT_ALERTS,
  DEFAULT_OBJECTIVES,
  SloMonitor,
  windowReport,
};
