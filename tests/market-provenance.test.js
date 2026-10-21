"use strict";

const assert = require("node:assert/strict"),
  { TrustedClock } = require("../server/data/trusted-clock.js"),
  { MarketDataProvenance } = require("../server/data/provenance.js");

(() => {
  let wall = 1_000,
    monotonic = 0n;
  const clock = new TrustedClock({
    wallClock: () => wall,
    monotonicClock: () => monotonic,
    maxDriftMs: 10,
  });
  assert.equal(clock.now().getTime(), 1_000);
  wall += 100;
  monotonic += 100_000_000n;
  assert.equal(clock.now().getTime(), 1_100);
  wall -= 1;
  assert.throws(() => clock.now(), /trusted-clock-unhealthy/);
  assert.equal(clock.status().backward, true);

  let at = Date.parse("2026-01-01T00:00:00.000Z");
  const stableClock = {
      now: () => new Date(at),
      status: () => ({ healthy: true }),
    },
    provenance = new MarketDataProvenance({ clock: stableClock }),
    trade = (tradeId, price) => ({
      type: "trade",
      source: "coinbase",
      symbol: "BTC-USD",
      tradeId: String(tradeId),
      price,
      size: 1,
      exchangeAt: new Date(at).toISOString(),
      receivedAt: new Date(at).toISOString(),
    }),
    first = provenance.seal("trades.BTC-USD", trade(1, 100));
  at += 1;
  const second = provenance.seal("trades.BTC-USD", trade(3, 101));
  assert.equal(first.provenance.sequence, 1);
  assert.equal(second.provenance.sequence, 2);
  assert.equal(second.provenance.previousHash, first.provenance.hash);
  assert.equal(second.provenance.sourceGap, true);
  assert.equal(provenance.verify("trades.BTC-USD", [first, second]).length, 2);

  const poisoned = structuredClone([first, second]);
  poisoned[1].price = 999;
  assert.throws(
    () => provenance.verify("trades.BTC-USD", poisoned),
    /invalid-market-provenance-chain/,
  );
  assert.throws(
    () =>
      provenance.verify("trades.BTC-USD", [
        first,
        { ...trade(4, 102), provenance: undefined },
      ]),
    /unsigned-market-event-after-trust-boundary/,
  );
  assert.throws(
    () => provenance.seal("trades.BTC-USD", trade(2, 102)),
    /market-source-sequence-regression/,
  );

  const restored = new MarketDataProvenance({ clock: stableClock });
  restored.verify("trades.BTC-USD", [first, second], { restore: true });
  at += 1;
  const third = restored.seal("trades.BTC-USD", trade(4, 102));
  assert.equal(third.provenance.sequence, 3);
  assert.equal(third.provenance.previousHash, second.provenance.hash);

  at = Date.parse("2026-01-02T00:00:00.000Z");
  const nextDay = restored.seal("trades.BTC-USD", trade(5, 103));
  assert.equal(nextDay.provenance.sequence, 1);
  assert.equal(nextDay.provenance.previousHash, null);
  assert.equal(restored.status().scope, "daily-local-chain");
  console.log("market provenance tests: ok");
})();
