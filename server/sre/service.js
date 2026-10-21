"use strict";
const crypto = require("node:crypto"),
  { Sha256AuditChain } = require("../pipeline/audit.js"),
  { SloMonitor } = require("./slo.js"),
  { SloTelemetry } = require("./telemetry.js");
function percentile(xs, p) {
  if (!xs.length) return 0;
  const a = [...xs].sort((x, y) => x - y),
    i = Math.floor((a.length - 1) * p);
  return a[i];
}
class SreService {
  constructor({
    gatewayMetrics,
    pipeline,
    dataService,
    research,
    portfolio,
    execution,
    record = async () => {},
    slos = {},
    clock = Date.now,
    sloWindowMs = 30 * 86400000,
    alertPolicies,
    telemetry = null,
    telemetryBucketMs = 60000,
    requireTelemetryRecovery = false,
  } = {}) {
    this.gatewayMetrics = gatewayMetrics;
    this.pipeline = pipeline;
    this.dataService = dataService;
    this.research = research;
    this.portfolio = portfolio;
    this.execution = execution;
    this.record = record;
    this.clock = clock;
    this.slos = {
      availability: 0.999,
      latencyTarget: 0.95,
      p95LatencyMs: 500,
      freshnessTarget: 0.99,
      dataFreshnessMs: 15000,
      auditIntegrity: 1,
      ...slos,
    };
    this.incidents = [];
    this.journal = new Sha256AuditChain();
    this.backups = [];
    this.sloMonitor = new SloMonitor({
      clock,
      ...(alertPolicies ? { alerts: alertPolicies } : {}),
      objectives: {
        availability: {
          target: this.slos.availability,
          windowMs: sloWindowMs,
        },
        latency: {
          target: this.slos.latencyTarget,
          thresholdMs: this.slos.p95LatencyMs,
          windowMs: sloWindowMs,
        },
        freshness: {
          target: this.slos.freshnessTarget,
          thresholdMs: this.slos.dataFreshnessMs,
          windowMs: sloWindowMs,
        },
        audit: { target: this.slos.auditIntegrity, windowMs: sloWindowMs },
      },
    });
    this.telemetry =
      telemetry ||
      new SloTelemetry({
        record,
        clock,
        bucketMs: telemetryBucketMs,
        retentionMs: sloWindowMs,
        policy: {
          objectives: this.sloMonitor.objectives,
          alerts: this.sloMonitor.alerts,
        },
      });
    this.telemetryReady = !requireTelemetryRecovery;
  }
  open(code, severity, message) {
    const existing = this.incidents.find(
      (x) => x.code === code && x.state !== "resolved",
    );
    if (existing) {
      existing.lastSeenAt = new Date().toISOString();
      existing.occurrences++;
      return existing;
    }
    const incident = {
      id: crypto.randomUUID(),
      code,
      severity,
      message,
      state: "open",
      openedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      occurrences: 1,
    };
    this.incidents.push(incident);
    this.journal.append("incident.opened", incident);
    return incident;
  }
  acknowledge(id, actor) {
    const x = this.incidents.find((i) => i.id === id);
    if (!x)
      throw Object.assign(new Error("incident-not-found"), { status: 404 });
    if (typeof actor !== "string" || actor.trim().length < 3)
      throw Object.assign(new Error("actor-required"), { status: 422 });
    x.state = "acknowledged";
    x.acknowledgedBy = actor.trim();
    x.acknowledgedAt = new Date().toISOString();
    this.journal.append("incident.acknowledged", {
      id: x.id,
      actor: x.acknowledgedBy,
    });
    return x;
  }
  async snapshot() {
    if (!this.telemetryReady)
      throw Object.assign(new Error("slo-telemetry-not-recovered"), {
        status: 503,
      });
    const data = this.dataService.health(),
      audit = this.pipeline.audit.verify(),
      m = this.gatewayMetrics,
      total = m.requests || 0,
      serverErrors = Object.entries(m.statuses || {})
        .filter(([s]) => Number(s) >= 500)
        .reduce((a, [, n]) => a + n, 0),
      availability = total ? 1 - serverErrors / total : 1,
      latencies = m.latencies || [],
      p95 = percentile(latencies, 0.95),
      freshness = data.cycleAgeMs === Infinity ? null : data.cycleAgeMs;
    const now = this.clock(),
      observations = m.observations?.length
        ? m.observations
        : Object.entries(m.statuses || {}).map(([status, weight]) => ({
            at: now,
            good: Number(status) < 500,
            weight,
          })),
      availabilityEvents = observations.map((event) => ({
        ...event,
        good: event.good ?? Number(event.status) < 500,
      })),
      latencyEvents = m.observations?.length
        ? m.observations.map((event) => ({
            ...event,
            good: event.latencyMs <= this.slos.p95LatencyMs,
          }))
        : latencies.map((latencyMs) => ({
            at: now,
            good: latencyMs <= this.slos.p95LatencyMs,
          }));
    this.telemetry.ingestHttp(m.observations, this.slos.p95LatencyMs);
    this.telemetry.observe(
      "freshness",
      freshness === null || freshness <= this.slos.dataFreshnessMs,
      now,
    );
    this.telemetry.observe("audit", audit.valid, now);
    await this.telemetry.flush();
    const hasSequencedHttp = (m.observations || []).some((event) =>
        Number.isInteger(event.seq),
      ),
      objectiveEvents = {
        availability: hasSequencedHttp
          ? this.telemetry.events("availability")
          : availabilityEvents,
        latency: hasSequencedHttp
          ? this.telemetry.events("latency")
          : latencyEvents,
        freshness: this.telemetry.events("freshness"),
        audit: this.telemetry.events("audit"),
      };
    const objectives = {
        availability: this.sloMonitor.evaluate(
          "availability",
          objectiveEvents.availability,
        ),
        latency: this.sloMonitor.evaluate("latency", objectiveEvents.latency),
        freshness: this.sloMonitor.evaluate(
          "freshness",
          objectiveEvents.freshness,
        ),
        audit: this.sloMonitor.evaluate("audit", objectiveEvents.audit),
      },
      firing = Object.values(objectives).flatMap((objective) =>
        objective.alerts
          .filter((alert) => alert.firing)
          .map((alert) => ({ objective: objective.name, ...alert })),
      );
    for (const alert of firing)
      this.open(
        `SLO_BURN_${alert.objective.toUpperCase()}_${alert.name.toUpperCase()}`,
        alert.name === "fast" ? "critical" : "warning",
        `${alert.objective} burn ${alert.long.burnRate.toFixed(2)}x/${alert.short.burnRate.toFixed(2)}x`,
      );
    const firingCodes = new Set(
      firing.map(
        (alert) =>
          `SLO_BURN_${alert.objective.toUpperCase()}_${alert.name.toUpperCase()}`,
      ),
    );
    for (const incident of this.incidents)
      if (
        incident.code.startsWith("SLO_BURN_") &&
        incident.state !== "resolved" &&
        !firingCodes.has(incident.code)
      ) {
        incident.state = "resolved";
        incident.resolvedAt = new Date(this.clock()).toISOString();
        this.journal.append("incident.resolved", {
          id: incident.id,
          code: incident.code,
        });
      }
    const telemetryStatus = this.telemetry.status(),
      checks = {
        availability: availability >= this.slos.availability,
        latency: p95 <= this.slos.p95LatencyMs,
        data: data.status === "healthy",
        freshness: freshness === null || freshness <= this.slos.dataFreshnessMs,
        audit: audit.valid,
        risk: !this.pipeline.risk.halted,
        stream: data.stream?.status !== "error",
        telemetry:
          telemetryStatus.gaps.length === 0 &&
          telemetryStatus.httpGaps.length === 0,
      };
    if (!checks.availability)
      this.open(
        "SLO_AVAILABILITY",
        "critical",
        `Availability ${(availability * 100).toFixed(3)}%`,
      );
    if (!checks.latency) this.open("SLO_LATENCY", "warning", `p95 ${p95}ms`);
    if (!checks.data)
      this.open("DATA_PLANE", "critical", `Data Plane ${data.status}`);
    if (!checks.freshness)
      this.open("DATA_STALE", "critical", `Feed age ${freshness}ms`);
    if (!checks.audit)
      this.open(
        "AUDIT_BROKEN",
        "critical",
        `Chain broken at ${audit.brokenAt}`,
      );
    if (!checks.risk)
      this.open(
        "RISK_HALTED",
        "critical",
        this.pipeline.risk.reason || "Risk halt",
      );
    if (!checks.telemetry)
      this.open(
        "SLO_TELEMETRY_GAP",
        "critical",
        `${telemetryStatus.gaps.length} probe gaps; ${telemetryStatus.httpGaps.length} HTTP gaps`,
      );
    const passed = Object.values(checks).filter(Boolean).length,
      status =
        passed === Object.keys(checks).length
          ? "healthy"
          : passed >= 4
            ? "degraded"
            : "critical";
    return {
      at: new Date().toISOString(),
      status,
      slos: this.slos,
      slis: {
        availability,
        p95LatencyMs: p95,
        dataFreshnessMs: freshness,
        burnRate: objectives.availability.period.burnRate,
        errorBudgetRemaining: objectives.availability.period.budgetRemaining,
        audit,
      },
      objectives,
      burnAlerts: firing,
      telemetry: telemetryStatus,
      checks,
      services: {
        data: data.status,
        pipeline: this.pipeline.risk.halted ? "halted" : "ready",
        research: this.research ? "ready" : "disabled",
        portfolio: this.portfolio ? "ready" : "disabled",
        execution: this.execution ? "ready" : "disabled",
      },
      incidents: this.incidents.slice(-30).reverse(),
      journal: this.journal.verify(),
      backups: this.backups.slice(-10).reverse(),
    };
  }
  async backup(actor = "system") {
    const payload = {
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        actor,
        pipeline: {
          ledger: this.pipeline.ledger.export(),
          audit: this.pipeline.audit.export(),
          metrics: this.pipeline.metrics,
          risk: this.pipeline.risk.status(),
        },
        research: { champion: this.research?.champion || null },
        portfolio: { lastPlan: this.portfolio?.plans.at(-1) || null },
        execution: {
          metrics: this.execution?.metrics || null,
          parents: this.execution?.parents || [],
        },
      },
      digest = crypto
        .createHash("sha256")
        .update(JSON.stringify(payload))
        .digest("hex"),
      backup = { ...payload, digest };
    this.backups.push(backup);
    this.journal.append("backup.created", { id: backup.id, digest, actor });
    await this.record("sre.backups", backup);
    return {
      id: backup.id,
      at: backup.at,
      digest,
      actor,
      journal: this.journal.verify(),
    };
  }
  recoverTelemetry(checkpoints) {
    const recovered = this.telemetry.recover(checkpoints);
    this.telemetryReady = true;
    return recovered;
  }
}
module.exports = { SreService, percentile };
