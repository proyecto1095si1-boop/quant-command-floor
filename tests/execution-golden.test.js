"use strict";

const assert = require("node:assert/strict"),
  cases = require("./golden/execution-cases.json"),
  { PAPER_ONLY } = require("../server/config/trading-mode.js"),
  { walkBook } = require("../server/execution/book.js"),
  { PaperLedger } = require("../server/pipeline/paper-ledger.js");

assert.equal(PAPER_ONLY, true);

const TOLERANCE = 1e-9,
  close = (actual, expected, field) =>
    assert.ok(
      Math.abs(actual - expected) < TOLERANCE,
      `${field}: ${actual} !== ${expected}`,
    ),
  run = (entry, options = {}) =>
    new PaperLedger({ cash: 1000000, ...options }).execute(
      entry.order,
      entry.book,
    );

for (const name of ["marketBuy", "marketPartial", "limitBuy", "stopSell"]) {
  const entry = cases[name],
    result = run(entry);
  assert.equal(result.status, entry.expected.status, name);
  close(result.fill.qty, entry.expected.qty, `${name}.qty`);
  close(result.fill.price, entry.expected.price, `${name}.price`);
  if (entry.expected.fee != null)
    close(result.fill.fee, entry.expected.fee, `${name}.fee`);
  if (entry.expected.liquidityRole)
    assert.equal(result.fill.liquidityRole, entry.expected.liquidityRole, name);
  assert.equal(result.fill.fillModel, "l2", name);
  assert.equal(result.fill.paper, true, name);
}

{
  const entry = cases.reusedLiquidity,
    ledger = new PaperLedger({ cash: 1000000 }),
    results = entry.orders.map((order) => ledger.execute(order, entry.book));
  assert.deepEqual(
    results.map((x) => x.status),
    entry.expected,
  );
  assert.equal(results[1].reason, "insufficient-liquidity");
}

{
  const entry = cases.constraints,
    ledger = new PaperLedger({ cash: 1000000 }),
    results = entry.orders.map((order) => ledger.execute(order, entry.book));
  assert.deepEqual(
    results.map((x) => x.reason),
    entry.expectedReasons,
  );
}

{
  const ledger = new PaperLedger({
      cash: 1000000,
      makerFeeRate: 0.0002,
      takerFeeRate: 0.0008,
      latencyMs: 75,
    }),
    result = ledger.execute(
      { id: "impact", symbol: "BTC-USD", side: "buy", qty: 1 },
      { mid: 100, spreadBps: 2, depthNotional: 10000 },
    );
  assert.equal(result.status, "filled");
  assert.equal(result.fill.fillModel, "impact");
  assert.equal(result.fill.feeRate, 0.0008);
  assert.equal(result.fill.latencyMs, 75);
  const maker = ledger.execute(
    {
      id: "maker-fee",
      symbol: "ETH-USD",
      side: "buy",
      type: "limit",
      qty: 1,
      limitPrice: 10,
    },
    { snapshotId: "maker-book", asks: [[9, 1]], bids: [[8, 1]] },
  );
  assert.equal(maker.fill.feeRate, 0.0002);
}

assert.deepEqual(
  new PaperLedger().execute(
    { id: "empty-ask", symbol: "BTC-USD", side: "buy", qty: 1 },
    { snapshotId: "empty-side", asks: [], bids: [[99, 1]], mid: 99.5 },
  ),
  { status: "rejected", reason: "insufficient-liquidity" },
);

{
  const used = new Map(),
    first = walkBook([{ price: 100, size: 1, side: "ask" }], 1, null, used),
    second = walkBook([{ price: 100, size: 1, side: "ask" }], 1, null, used);
  assert.equal(first.filledQty, 1);
  assert.equal(second.filledQty, 0);
}

console.log("golden execution tests: ok");
