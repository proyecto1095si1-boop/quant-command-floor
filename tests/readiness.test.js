"use strict";

const assert = require("node:assert/strict"),
  {
    digest,
    openCheckpoint,
    sealCheckpoint,
  } = require("../server/config/checkpoint.js"),
  { createGateway } = require("../server/gateway.js"),
  {
    ReadinessService,
    STATES,
    decide,
    decisionSignature,
  } = require("../server/sre/readiness.js");

(async () => {
  const dataState = {
      status: "healthy",
      reconciliation: { status: "healthy" },
      provenance: { clock: { healthy: true } },
    },
    pipelineState = {
      paperOnly: true,
      risk: { halted: false, reason: null },
      audit: { valid: true },
    },
    executionState = {
      paperOnly: true,
      queue: 0,
      metrics: { children: 25, rejected: 1 },
    },
    sreState = {
      telemetry: {
        recovery: { recovered: true },
        gaps: [],
        httpGaps: [],
      },
      burnAlerts: [],
    },
    governanceState = { ready: true, recoveryError: null, champions: [] },
    readyState = { ready: true },
    written = [],
    build = (overrides = {}) =>
      new ReadinessService({
        dataService: { health: () => structuredClone(dataState) },
        pipeline: { status: () => structuredClone(pipelineState) },
        execution: { status: () => structuredClone(executionState) },
        sre: { snapshot: async () => structuredClone(sreState) },
        governance: { status: () => structuredClone(governanceState) },
        experiments: { list: () => structuredClone(readyState) },
        aiEvaluation: { status: () => structuredClone(readyState) },
        calibrationGovernance: {
          status: () => structuredClone(readyState),
        },
        llmConfigured: true,
        clock: () => new Date("2026-10-21T12:00:00Z"),
        record: async (stream, event) => written.push([stream, event]),
        ...overrides,
      });

  const service = build(),
    ready = await service.evaluate();
  assert.equal(ready.state, STATES.READY);
  assert.equal(ready.capabilities.paperExecution, true);
  assert.equal(ready.liveTrading, false);
  assert.equal(written.length, 1);
  assert.equal(written[0][0], "sre.readiness-transitions");
  assert.equal(
    openCheckpoint(written[0][1], "operational-readiness").state,
    STATES.READY,
  );
  await service.evaluate();
  assert.equal(written.length, 1);

  executionState.queue = 101;
  await service.evaluate();
  assert.equal(written.length, 2);
  executionState.queue = 0;
  governanceState.ready = false;
  await service.evaluate();
  assert.equal(written.length, 3);
  const history = written.slice(0, 3).map(([, event]) => event),
    recoveredWrites = [],
    recoveredService = build({
      requireRecovery: true,
      record: async (stream, event) => recoveredWrites.push([stream, event]),
    });
  await assert.rejects(() => recoveredService.evaluate(), /not-recovered/);
  const recovery = recoveredService.recover(history);
  assert.equal(recovery.transitions, 3);
  assert.equal(recovery.lastState, STATES.DEGRADED);
  assert.equal(recovery.boundaryTruncated, false);
  assert.equal(recoveredService.status().ready, true);
  await recoveredService.evaluate();
  assert.equal(recoveredWrites.length, 0);
  const truncated = build({ requireRecovery: true }).recover(history.slice(1));
  assert.equal(truncated.boundaryTruncated, true);

  const brokenPayload = openCheckpoint(history[1], "operational-readiness");
  brokenPayload.previousState = STATES.HALTED;
  assert.throws(
    () =>
      build({ requireRecovery: true }).recover([
        history[0],
        sealCheckpoint("operational-readiness", brokenPayload),
      ]),
    /continuity/,
  );
  const invalidDecision = openCheckpoint(history[0], "operational-readiness");
  invalidDecision.capabilities.paperExecution = false;
  const {
    id: ignoredId,
    signature: ignoredSignature,
    previousState: ignoredPreviousState,
    previousId: ignoredPreviousId,
    ...invalidBody
  } = invalidDecision;
  void ignoredId;
  void ignoredSignature;
  void ignoredPreviousState;
  void ignoredPreviousId;
  invalidDecision.id = digest(invalidBody);
  invalidDecision.signature = decisionSignature(invalidBody);
  assert.throws(
    () =>
      build({ requireRecovery: true }).recover([
        sealCheckpoint("operational-readiness", invalidDecision),
      ]),
    /invalid-readiness-transition/,
  );
  assert.throws(
    () =>
      build({
        requireRecovery: true,
        policy: { maxExecutionQueue: 99 },
      }).recover(history),
    /invalid-readiness-transition/,
  );
  governanceState.ready = true;

  const withoutAi = await build({ llmConfigured: false }).evaluate();
  assert.equal(withoutAi.state, STATES.DEGRADED);
  assert.equal(withoutAi.capabilities.aiSignals, false);
  assert.equal(withoutAi.capabilities.paperExecution, true);

  dataState.status = "degraded";
  const halted = await build().evaluate();
  assert.equal(halted.state, STATES.HALTED);
  assert.equal(halted.capabilities.marketAnalysis, false);
  assert.equal(halted.capabilities.paperExecution, false);
  assert.ok(halted.reasons.some((reason) => reason.id === "market.health"));
  dataState.status = "healthy";

  executionState.queue = 101;
  const overloaded = await build().evaluate();
  assert.equal(overloaded.state, STATES.DEGRADED);
  assert.equal(overloaded.capabilities.paperExecution, false);
  executionState.queue = 0;

  sreState.burnAlerts = [{ name: "fast" }];
  assert.equal((await build().evaluate()).state, STATES.HALTED);
  sreState.burnAlerts = [];

  assert.equal(decide([]).state, STATES.READY);
  assert.throws(
    () => build({ policy: { maxRejectionRate: 2 } }),
    /invalid-readiness-policy/,
  );
  assert.throws(() => new ReadinessService(), /invalid-readiness-dependencies/);

  let submitted = 0;
  const blockedDecision = {
      state: "HALTED",
      capabilities: { paperExecution: false },
    },
    gateway = createGateway(),
    address = await gateway.listen(0),
    base = `http://127.0.0.1:${address.port}`;
  gateway.setReadiness({ evaluate: async () => blockedDecision });
  gateway.setExecution({
    submit: async () => {
      submitted++;
      return {};
    },
    drain: async () => {
      submitted++;
      return {};
    },
  });
  const status = await fetch(base + "/v1/readiness");
  assert.equal(status.status, 503);
  assert.equal((await status.json()).state, "HALTED");
  const submit = await fetch(base + "/v1/execution/submit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(submit.status, 409);
  assert.equal((await submit.json()).error, "operational-readiness-blocked");
  const drain = await fetch(base + "/v1/execution/drain", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(drain.status, 409);
  assert.equal(submitted, 0);
  await gateway.close();
  console.log("operational readiness tests: ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
