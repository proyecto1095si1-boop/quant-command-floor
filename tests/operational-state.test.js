"use strict";

const assert = require("node:assert/strict"),
  { MarketReconciliation } = require("../server/data/reconciliation.js"),
  { ExecutionTca } = require("../server/execution/tca.js");

(() => {
  const now = Date.parse("2026-10-21T00:00:00Z"),
    policy = {
      clock: () => now,
      quarantineAfter: 1,
      recoverAfter: 2,
    },
    reconciliation = new MarketReconciliation(policy);
  reconciliation.evaluate("BTC-USD", {});
  assert.equal(reconciliation.product("BTC-USD").quarantined, true);
  const checkpoint = reconciliation.checkpoint(),
    restored = new MarketReconciliation(policy);
  restored.restore(JSON.parse(JSON.stringify(checkpoint)));
  assert.equal(restored.product("BTC-USD").quarantined, true);
  const tampered = structuredClone(checkpoint);
  tampered.payload.products[0][1].quarantined = false;
  assert.throws(
    () => new MarketReconciliation(policy).restore(tampered),
    /checkpoint-integrity/,
  );
  assert.throws(
    () =>
      new MarketReconciliation({ ...policy, recoverAfter: 3 }).restore(
        checkpoint,
      ),
    /policy-mismatch/,
  );

  const tca = new ExecutionTca({ horizonsMs: [1000] });
  tca.record({
    id: "f1",
    symbol: "BTC-USD",
    side: "buy",
    qty: 1,
    notional: 101,
    price: 101,
    mid: 100,
    fee: 0.1,
    filledAt: new Date(now).toISOString(),
  });
  const tcaCheckpoint = tca.checkpoint(),
    restoredTca = new ExecutionTca({ horizonsMs: [1000] });
  restoredTca.restore(JSON.parse(JSON.stringify(tcaCheckpoint)));
  assert.equal(restoredTca.snapshot().fills, 1);
  assert.equal(restoredTca.observe("BTC-USD", 102, now + 1000), 1);
  const duplicate = structuredClone(tcaCheckpoint);
  duplicate.payload.records.push(structuredClone(duplicate.payload.records[0]));
  const { digest } = require("../server/config/checkpoint.js"),
    { hash: ignored, ...body } = duplicate;
  void ignored;
  duplicate.hash = digest(body);
  assert.throws(
    () => new ExecutionTca({ horizonsMs: [1000] }).restore(duplicate),
    /invalid-execution-tca-state/,
  );
  assert.throws(
    () => new ExecutionTca({ horizonsMs: [2000] }).restore(tcaCheckpoint),
    /policy-mismatch/,
  );
  console.log("operational state tests: ok");
})();
