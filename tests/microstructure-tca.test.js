"use strict";

const assert = require("node:assert/strict"),
  {
    bookMetrics,
    tradeMetrics,
  } = require("../server/execution/microstructure.js"),
  { ExecutionTca } = require("../server/execution/tca.js");

(() => {
  const book = {
      bids: [
        { price: 99, size: 3 },
        { price: 98, size: 2 },
      ],
      asks: [
        { price: 101, size: 1 },
        { price: 102, size: 4 },
      ],
    },
    metrics = bookMetrics(book);
  assert.equal(metrics.midpoint, 100);
  assert.equal(metrics.microprice, 100.5);
  assert.equal(metrics.micropriceEdgeBps, 50);
  assert.equal(metrics.imbalance, 0);
  assert.equal(metrics.spreadBps, 200);

  const trades = tradeMetrics([
    { price: 100, size: 1, side: "buy" },
    { price: 101, size: 2, side: "buy" },
    { price: 100, size: 1, side: "sell" },
  ]);
  assert.equal(trades.observations, 3);
  assert.equal(trades.buyVolume, 3);
  assert.equal(trades.sellVolume, 1);
  assert.equal(trades.flowToxicity, 0.5);
  assert.ok(trades.amihud > 0);
  assert.ok(Number.isFinite(trades.kyleLambda));

  let now = Date.parse("2026-10-21T00:00:00Z");
  const tca = new ExecutionTca({ clock: () => now, horizonsMs: [1000, 5000] }),
    record = tca.record(
      {
        id: "fill-1",
        symbol: "BTC-USD",
        side: "buy",
        qty: 2,
        notional: 202,
        price: 101,
        mid: 100,
        fee: 0.2,
        filledAt: new Date(now).toISOString(),
      },
      { arrivalMid: 100, book },
    );
  assert.equal(record.priceShortfallBps, 100);
  assert.ok(record.implementationShortfallBps > 109.9);
  assert.equal(record.effectiveSpreadBps, 200);
  now += 999;
  assert.equal(tca.observe("BTC-USD", 102), 0);
  now += 1;
  assert.equal(tca.observe("BTC-USD", 102), 1);
  assert.ok(tca.snapshot().records[0].markouts[1000] > 99);
  now += 4000;
  assert.equal(tca.observe("BTC-USD", 99), 1);
  assert.equal(tca.snapshot().pendingMarkouts, 0);
  assert.equal(
    tca.snapshot().weightedImplementationShortfallBps,
    record.implementationShortfallBps,
  );
  console.log("microstructure + TCA tests: ok");
})();
