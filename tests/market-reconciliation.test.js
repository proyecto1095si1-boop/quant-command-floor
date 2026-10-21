"use strict";

const assert = require("node:assert/strict"),
  {
    MarketReconciliation,
    median,
    tradeCoverage,
  } = require("../server/data/reconciliation.js");

(() => {
  assert.equal(median([103, 100, 101]), 101);
  assert.equal(median([100, 102]), 101);
  assert.deepEqual(tradeCoverage([{ tradeId: 10 }, { tradeId: 12 }]), {
    observed: 2,
    expected: 3,
    ratio: 2 / 3,
  });

  const now = Date.parse("2026-10-21T12:00:00.000Z"),
    monitor = new MarketReconciliation({
      clock: () => now,
      maxDivergenceBps: 25,
      quarantineAfter: 2,
      recoverAfter: 3,
    }),
    ticker = (source, price, receivedAt = now) => ({
      source,
      price,
      receivedAt: new Date(receivedAt).toISOString(),
    }),
    healthy = {
      tickers: [ticker("coinbase", 100), ticker("kraken", 100.1)],
      book: {
        bids: [{ price: 99.9, size: 2 }],
        asks: [{ price: 100.2, size: 2 }],
      },
      trades: [1, 2, 3].map((tradeId) => ({ tradeId })),
    };
  const first = monitor.evaluate("BTC-USD", healthy);
  assert.equal(first.status, "healthy");
  assert.equal(first.eligible, true);
  assert.equal(first.referencePrice, 100.05);
  assert.ok(first.maxSourceDeviationBps < 6);
  assert.ok(first.maxDivergenceBps > 9 && first.maxDivergenceBps < 11);

  const divergent = {
    ...healthy,
    tickers: [ticker("coinbase", 100), ticker("kraken", 102)],
    trades: [{ tradeId: 1 }, { tradeId: 3 }],
  };
  const failure = monitor.evaluate("BTC-USD", divergent);
  assert.equal(failure.status, "degraded");
  assert.equal(failure.eligible, false);
  assert.deepEqual(failure.reasons, [
    "source-divergence",
    "trade-sequence-coverage",
  ]);
  const quarantined = monitor.evaluate("BTC-USD", divergent);
  assert.equal(quarantined.status, "quarantined");
  assert.equal(quarantined.quarantined, true);

  assert.equal(monitor.evaluate("BTC-USD", healthy).quarantined, true);
  assert.equal(monitor.evaluate("BTC-USD", healthy).quarantined, true);
  const recovered = monitor.evaluate("BTC-USD", healthy);
  assert.equal(recovered.status, "healthy");
  assert.equal(recovered.quarantined, false);
  assert.equal(monitor.snapshot().metrics.recoveries, 1);

  const invalidBook = monitor.evaluate("ETH-USD", {
    tickers: [ticker("coinbase", 100, now - 20_000), ticker("kraken", 100)],
    book: {
      bids: [{ price: 101, size: 1 }],
      asks: [{ price: 100, size: 1 }],
    },
    trades: [],
  });
  assert.equal(invalidBook.eligible, false);
  assert.ok(invalidBook.reasons.includes("insufficient-sources"));
  assert.ok(invalidBook.reasons.includes("stale-source"));
  assert.ok(invalidBook.reasons.includes("crossed-book"));
  console.log("market reconciliation tests: ok");
})();
