"use strict";
const crypto = require("node:crypto"),
  { Sha256AuditChain } = require("../pipeline/audit.js");
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
  } = {}) {
    this.gatewayMetrics = gatewayMetrics;
    this.pipeline = pipeline;
    this.dataService = dataService;
    this.research = research;
    this.portfolio = portfolio;
    this.execution = execution;
    this.record = record;
    this.slos = {
      availability: 0.999,
      p95LatencyMs: 500,
      dataFreshnessMs: 15000,
      auditIntegrity: 1,
      ...slos,
    };
    this.incidents = [];
    this.journal = new Sha256AuditChain();
    this.backups = [];
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
      freshness = data.cycleAgeMs === Infinity ? null : data.cycleAgeMs,
      errorBudget = 1 - this.slos.availability,
      burnRate = errorBudget ? Math.max(0, 1 - availability) / errorBudget : 0;
    const checks = {
      availability: availability >= this.slos.availability,
      latency: p95 <= this.slos.p95LatencyMs,
      data: data.status === "healthy",
      freshness: freshness === null || freshness <= this.slos.dataFreshnessMs,
      audit: audit.valid,
      risk: !this.pipeline.risk.halted,
      stream: data.stream?.status !== "error",
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
        burnRate,
        errorBudgetRemaining: Math.max(0, 1 - burnRate),
        audit,
      },
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
}
module.exports = { SreService, percentile };
