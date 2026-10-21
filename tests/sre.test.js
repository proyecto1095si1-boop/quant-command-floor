"use strict";
const assert = require("node:assert/strict"),
  { SreService, percentile } = require("../server/sre/service.js"),
  { Sha256AuditChain } = require("../server/pipeline/audit.js"),
  { RiskGate } = require("../server/pipeline/risk-gate.js"),
  { PaperLedger } = require("../server/pipeline/paper-ledger.js");
(async () => {
  assert.equal(percentile([1, 2, 3, 100], 0.95), 3);
  const chain = new Sha256AuditChain();
  chain.append("ok", {});
  const pipeline = {
      audit: chain,
      risk: new RiskGate(),
      ledger: new PaperLedger(),
      metrics: { runs: 1 },
      marks: () => ({}),
    },
    gatewayMetrics = {
      requests: 1000,
      statuses: { 200: 999, 500: 1 },
      latencies: [10, 20, 30, 40],
    },
    data = {
      health: () => ({
        status: "healthy",
        cycleAgeMs: 100,
        stream: { status: "open" },
      }),
    },
    written = [],
    sre = new SreService({
      gatewayMetrics,
      pipeline,
      dataService: data,
      research: { champion: null },
      portfolio: { plans: [] },
      execution: { metrics: {}, parents: [] },
      record: async (s, e) => written.push([s, e]),
    }),
    status = await sre.snapshot();
  assert.ok(status.slis.availability >= 0.999);
  assert.equal(status.journal.valid, true);
  pipeline.risk.halt("test");
  const degraded = await sre.snapshot();
  assert.equal(degraded.checks.risk, false);
  assert.equal(degraded.incidents[0].code, "RISK_HALTED");
  const ack = sre.acknowledge(degraded.incidents[0].id, "SRE Operator");
  assert.equal(ack.state, "acknowledged");
  gatewayMetrics.observations = [
    { at: Date.now(), status: 200, latencyMs: 10, weight: 98 },
    { at: Date.now(), status: 500, latencyMs: 10, weight: 2 },
  ];
  const burning = await sre.snapshot();
  assert.equal(burning.objectives.availability.alerts[0].firing, true);
  assert.equal(burning.slis.errorBudgetRemaining, 0);
  assert.ok(
    burning.incidents.some(
      (incident) => incident.code === "SLO_BURN_AVAILABILITY_FAST",
    ),
  );
  gatewayMetrics.observations = [
    { at: Date.now(), status: 200, latencyMs: 10, weight: 100 },
  ];
  const recovered = await sre.snapshot(),
    burnIncident = recovered.incidents.find(
      (incident) => incident.code === "SLO_BURN_AVAILABILITY_FAST",
    );
  assert.equal(burnIncident.state, "resolved");
  assert.ok(burnIncident.resolvedAt);
  const backup = await sre.backup("SRE Operator");
  assert.equal(backup.digest.length, 64);
  assert.ok(written.some(([stream]) => stream === "sre.slo-telemetry"));
  assert.ok(written.some(([stream]) => stream === "sre.backups"));
  sre.journal.rows[0].payload.message = "tampered";
  assert.equal(sre.journal.verify().valid, false);
  console.log("sre tests: ok");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
