"use strict";

const assert = require("node:assert/strict"),
  { PaperLedger } = require("../server/pipeline/paper-ledger.js"),
  ledger = () =>
    new PaperLedger({ feeRate: 0, baseSlippageBps: 0, impactBps: 0 }),
  fill = (book, id, side, qty, price) => {
    const result = book.execute(
      { id, symbol: "BTC-USD", side, qty },
      {
        mid: price,
        bids: [{ price, size: 100 }],
        asks: [{ price, size: 100 }],
      },
    );
    assert.equal(result.status, "filled");
    return result.fill;
  },
  check = (book, qty, price, equity) => {
    const snapshot = book.snapshot();
    assert.equal(snapshot.positions["BTC-USD"].qty, qty);
    assert.equal(snapshot.positions["BTC-USD"].avgPrice, price);
    assert.equal(snapshot.positions["BTC-USD"].mark, price);
    assert.equal(snapshot.marketValue, qty * price);
    assert.equal(snapshot.equity, equity);
    assert.equal(snapshot.accounting.balanced, true);
    assert.equal(snapshot.journal.valid, true);
    assert.equal(book.export().paperOnly, true);
  };

const original = new PaperLedger();
original.execute(
  { id: "regression", symbol: "BTC-USD", side: "buy", qty: 1 },
  {
    mid: 200,
    bids: [{ price: 199.98, size: 10 }],
    asks: [{ price: 200.02, size: 12 }],
  },
);
check(original, 1, 200.02, 99999.79998);
assert.equal(original.snapshot({ "BTC-USD": 200 }).equity, 99999.77998);

const book = ledger();
fill(book, "first", "buy", 2, 100);
fill(book, "second", "buy", 1, 175);
check(book, 3, 125, 100000);
fill(book, "reduce", "sell", 1, 150);
check(book, 2, 125, 100025);
fill(book, "reverse", "sell", 3, 150);
check(book, -1, 150, 100075);
fill(book, "add-short", "sell", 1, 200);
check(book, -2, 175, 100075);
fill(book, "cover-part", "buy", 1, 160);
check(book, -1, 175, 100090);
fill(book, "flat", "buy", 1, 170);
check(book, 0, 0, 100095);

const micro = ledger();
fill(micro, "micro", "buy", 0.00000001, 200);
check(micro, 0.00000001, 200, 100000);

const oldCheckpoint = original.export(),
  exactBefore = structuredClone(oldCheckpoint.monetaryAtoms);
// Simulate a checkpoint written before the fix: cost basis is intact, cached
// average price is scaled incorrectly. Recovery must not change the cash/fills.
oldCheckpoint.positions["BTC-USD"].avgPrice = 0.000002;
oldCheckpoint.monetaryAtoms.positions["BTC-USD"].avgPrice = "200";
const restored = new PaperLedger().restore(oldCheckpoint);
check(restored, 1, 200.02, 99999.79998);
assert.equal(restored.export().cash, original.cash);
assert.deepEqual(restored.export().fills, oldCheckpoint.fills);
assert.equal(
  restored.export().monetaryAtoms.positions["BTC-USD"].costBasis,
  exactBefore.positions["BTC-USD"].costBasis,
);
assert.equal(
  oldCheckpoint.monetaryAtoms.positions["BTC-USD"].avgPrice,
  "200",
  "restore must not mutate the supplied checkpoint",
);

const validLegacy = restored.export();
delete validLegacy.monetaryAtoms;
check(new PaperLedger().restore(validLegacy), 1, 200.02, 99999.79998);
console.log(
  "paper valuation: weighted averages, partial closes, reversals, micro qty, explicit marks and exact-checkpoint recovery OK; PAPER_ONLY",
);
