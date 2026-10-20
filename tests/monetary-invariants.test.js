"use strict";

const assert = require("node:assert/strict"),
  {
    decimalString,
    fromAtoms,
    multiplyAtoms,
    toAtoms,
  } = require("../server/math/fixed-decimal.js"),
  { walkBook } = require("../server/execution/book.js"),
  { PaperLedger } = require("../server/pipeline/paper-ledger.js");

assert.equal(toAtoms("0.001"), 100000n);
assert.equal(toAtoms("1e-8"), 1n);
assert.equal(toAtoms("1.234567895"), 123456790n);
assert.equal(toAtoms("-1.234567895"), -123456790n);
assert.equal(fromAtoms(toAtoms("900719.92547409")), 900719.92547409);
assert.equal(decimalString(toAtoms("0.1")), "0.10000000");
assert.equal(
  decimalString(multiplyAtoms(toAtoms("100.05"), toAtoms("2"))),
  "200.10000000",
);
assert.throws(() => toAtoms("not-a-number"), /invalid-decimal/);
assert.throws(() => toAtoms("1e1000000"), /decimal-out-of-range/);

const sharedLiquidity = new Map(),
  decimalBook = [[100, 0.3]];
assert.equal(walkBook(decimalBook, 0.1, null, sharedLiquidity).filledQty, 0.1);
assert.equal(walkBook(decimalBook, 0.2, null, sharedLiquidity).filledQty, 0.2);
assert.equal(walkBook(decimalBook, 0.1, null, sharedLiquidity).filledQty, 0);

function execute(ledger, id, side, qty, price) {
  const result = ledger.execute(
    { id, symbol: "BTC-USD", side, qty, type: "market" },
    { mid: price, spreadBps: 0, depthNotional: 1e12 },
  );
  assert.equal(result.status, "filled");
  return result.fill;
}

const repeated = new PaperLedger({
  cash: 1000,
  feeRate: 0.001,
  baseSlippageBps: 0,
  impactBps: 0,
});
assert.deepEqual(
  repeated.execute(
    { id: "underflow", symbol: "BTC-USD", side: "buy", qty: "0.000000001" },
    { mid: 1 },
  ),
  { status: "rejected", reason: "invalid-quantity" },
);
for (let i = 0; i < 1000; i++) execute(repeated, `buy-${i}`, "buy", 0.1, 0.1);
execute(repeated, "close", "sell", 100, 0.1);
const repeatedSnapshot = repeated.snapshot({ "BTC-USD": 0.1 });
assert.equal(repeatedSnapshot.positions["BTC-USD"].qty, 0);
assert.equal(repeatedSnapshot.cash, 999.98);
assert.equal(repeatedSnapshot.equity, 999.98);
assert.equal(repeatedSnapshot.fees, 0.02);
assert.equal(repeatedSnapshot.realizedPnl, 0);
assert.deepEqual(repeatedSnapshot.accounting, {
  scale: 8,
  balanced: true,
  residual: 0,
  residualExact: "0.00000000",
  cashExact: "999.98000000",
  equityExact: "999.98000000",
  marketValueExact: "0.00000000",
  realizedPnlExact: "0.00000000",
  unrealizedPnlExact: "0.00000000",
  feesExact: "0.02000000",
});

const lifecycle = new PaperLedger({
  cash: 100000,
  feeRate: "0.001",
  baseSlippageBps: 0,
  impactBps: 0,
});
execute(lifecycle, "long-a", "buy", "0.33333333", "30000.12345678");
execute(lifecycle, "long-b", "buy", "0.11111111", "31000.87654321");
execute(lifecycle, "partial-close", "sell", "0.12345678", "32000.33333333");
let snapshot = lifecycle.snapshot({ "BTC-USD": "31500.7654321" });
assert.equal(snapshot.accounting.balanced, true);
assert.equal(snapshot.accounting.residualExact, "0.00000000");

execute(lifecycle, "flip", "sell", "0.5", "30500.55555555");
snapshot = lifecycle.snapshot({ "BTC-USD": "30200.22222222" });
assert.ok(snapshot.positions["BTC-USD"].qty < 0);
assert.equal(snapshot.accounting.balanced, true);

execute(
  lifecycle,
  "cover",
  "buy",
  Math.abs(snapshot.positions["BTC-USD"].qty),
  "30000.11111111",
);
snapshot = lifecycle.snapshot({ "BTC-USD": "30000.11111111" });
assert.equal(snapshot.positions["BTC-USD"].qty, 0);
assert.equal(snapshot.accounting.balanced, true);

const checkpoint = JSON.parse(JSON.stringify(lifecycle.export())),
  restored = new PaperLedger().restore(checkpoint);
assert.deepEqual(restored.export().monetaryAtoms, checkpoint.monetaryAtoms);
assert.deepEqual(restored.snapshot(), lifecycle.snapshot());

const legacy = structuredClone(checkpoint);
delete legacy.monetaryAtoms;
const migrated = new PaperLedger().restore(legacy);
assert.equal(migrated.snapshot().accounting.balanced, true);
assert.equal(migrated.export().paperOnly, true);

const stress = new PaperLedger({
  cash: 1000000,
  feeRate: "0.00123456",
  baseSlippageBps: 0,
  impactBps: 0,
});
for (let i = 0; i < 250; i++) {
  const side = i % 7 < 4 ? "buy" : "sell",
    qty = (((i * 7919) % 9000) + 1) / 100000,
    price = 10000 + ((i * 104729) % 2000000) / 100;
  execute(stress, `stress-${i}`, side, qty, price);
  const current = stress.snapshot({ "BTC-USD": price });
  assert.equal(current.accounting.balanced, true, `unbalanced at fill ${i}`);
  assert.equal(current.accounting.residualExact, "0.00000000");
}

console.log("monetary invariant tests: ok");
