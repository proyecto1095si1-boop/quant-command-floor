"use strict";

const assert = require("node:assert/strict"),
  { PaperLedger } = require("../server/pipeline/paper-ledger.js"),
  { TradingPipeline } = require("../server/pipeline/orchestrator.js");

function ledger() {
  return new PaperLedger({
    cash: 1000,
    feeRate: 0.001,
    baseSlippageBps: 0,
    impactBps: 0,
  });
}

function execute(book, id, side, qty, price) {
  const result = book.execute(
    { id, symbol: "BTC-USD", side, qty, type: "market" },
    { mid: price, spreadBps: 0, depthNotional: 1e9 },
  );
  assert.equal(result.status, "filled");
  return result.fill;
}

function checkpoint() {
  const book = ledger();
  execute(book, "buy", "buy", 2, 100);
  execute(book, "partial-close", "sell", 1, 110);
  execute(book, "flip-short", "sell", 2, 90);
  execute(book, "cover", "buy", 1, 80);
  return book.export();
}

const empty = ledger().snapshot();
assert.equal(empty.journal.valid, true);
assert.equal(empty.journal.totalFills, 0);
assert.equal(empty.journal.balancesVerified, true);
assert.notEqual(empty.journal.head, "0".repeat(64));

const source = checkpoint(),
  restored = new PaperLedger().restore(JSON.parse(JSON.stringify(source))),
  verified = restored.verifyJournal();
assert.equal(verified.valid, true);
assert.equal(verified.count, 4);
assert.equal(verified.totalFills, 4);
assert.equal(verified.balancesVerified, true);
assert.equal(source.journal.rows.length, source.fills.length);
assert.deepEqual(
  source.journal.rows.map((row) => row.seq),
  [1, 2, 3, 4],
);
for (let i = 0; i < source.journal.rows.length; i++) {
  const row = source.journal.rows[i],
    debit = row.postings.reduce((sum, item) => sum + BigInt(item.debit), 0n),
    credit = row.postings.reduce((sum, item) => sum + BigInt(item.credit), 0n);
  assert.equal(debit, credit);
  assert.equal(row.fillId, source.fills[i].id);
  assert.equal(source.fills[i].journal.seq, row.seq);
  assert.equal(source.fills[i].journal.hash, row.hash);
  if (i > 0) assert.equal(row.prev, source.journal.rows[i - 1].hash);
}

const first = source.journal.rows[0];
assert.deepEqual(first.postings, [
  { account: "cash", debit: "0", credit: "20020000000" },
  { account: "inventory:BTC-USD", debit: "20000000000", credit: "0" },
  { account: "realized-pnl", debit: "0", credit: "0" },
  { account: "fees", debit: "20000000", credit: "0" },
]);

function rejectsMutation(mutator, pattern) {
  const value = JSON.parse(JSON.stringify(source));
  mutator(value);
  assert.throws(() => new PaperLedger().restore(value), pattern);
}

rejectsMutation((value) => {
  value.journal.rows[0].postings[0].credit = "1";
}, /journal-corrupt:hash-chain/);
rejectsMutation((value) => {
  value.journal.rows[1].seq = 99;
}, /journal-corrupt:sequence/);
rejectsMutation((value) => {
  value.fills[0].price = 999;
}, /journal-corrupt:fill-link/);
rejectsMutation((value) => {
  value.journal.rows.pop();
}, /journal-corrupt:unjournaled-fill/);
rejectsMutation((value) => {
  value.fills[1].journal.hash = "f".repeat(64);
}, /journal-corrupt:fill-reference/);
rejectsMutation((value) => {
  value.monetaryAtoms.cash = String(BigInt(value.monetaryAtoms.cash) + 1n);
}, /journal-state-corrupt:state-balance:cash/);
rejectsMutation((value) => {
  value.monetaryAtoms.initialCash = "100100000000";
  value.initialCash = 1001;
}, /journal-state-corrupt:initial-cash/);
rejectsMutation((value) => {
  value.monetaryAtoms.positions["BTC-USD"].costBasis = "123";
}, /journal-state-corrupt:state-balance:inventory:BTC-USD/);

const legacy = JSON.parse(JSON.stringify(source));
delete legacy.journal;
for (const fill of legacy.fills) delete fill.journal;
const migrated = new PaperLedger().restore(legacy);
assert.equal(migrated.journal.legacyAnchor.type, "legacy-checkpoint-anchor");
assert.equal(migrated.verifyJournal().valid, true);
execute(migrated, "after-migration", "buy", 0.5, 70);
const migratedCheckpoint = migrated.export();
assert.equal(migratedCheckpoint.journal.rows.length, 1);
assert.equal(
  new PaperLedger().restore(migratedCheckpoint).verifyJournal().valid,
  true,
);
const changedLegacyFill = JSON.parse(JSON.stringify(migratedCheckpoint));
changedLegacyFill.fills[0].fee = 123;
assert.throws(
  () => new PaperLedger().restore(changedLegacyFill),
  /journal-corrupt:legacy-anchor/,
);

const mutable = new PaperLedger().restore(JSON.parse(JSON.stringify(source)));
mutable.fills[0].price = 777;
assert.throws(() => mutable.export(), /journal-integrity-failed:fill-link/);

const atomicFailure = ledger();
execute(atomicFailure, "atomic-seed", "buy", 1, 100);
const beforeFailure = atomicFailure.export(),
  originalAppend = atomicFailure.journal.append;
atomicFailure.journal.append = () => {
  throw new Error("journal-offline");
};
assert.throws(
  () => execute(atomicFailure, "must-not-commit", "sell", 0.5, 101),
  /journal-offline/,
);
atomicFailure.journal.append = originalAppend;
assert.deepEqual(atomicFailure.export(), beforeFailure);

const corruptForRecovery = JSON.parse(JSON.stringify(source));
corruptForRecovery.fills[0].symbol = "ETH-USD";
const pipeline = new TradingPipeline({
  dataService: {
    store: { tail: async () => [{ ledger: corruptForRecovery, audit: [] }] },
  },
});
assert
  .rejects(() => pipeline.recover(), /journal-corrupt:fill-link/)
  .then(() => {
    assert.equal(pipeline.risk.halted, true);
    assert.equal(pipeline.risk.reason, "recovery-integrity-failed");
    console.log("journal integrity tests: ok");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
