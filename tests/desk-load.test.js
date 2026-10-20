const assert = require("node:assert/strict"),
  { DeskRegistry } = require("../server/desks/registry.js");
(() => {
  const registry = new DeskRegistry(),
    candles = Array.from({ length: 300 }, (_, i) => {
      const open = 100 + i * 0.03,
        close = open + Math.sin(i / 5);
      return {
        open,
        close,
        high: Math.max(open, close) + 0.2,
        low: Math.min(open, close) - 0.2,
        volume: 100 + (i % 30),
      };
    }),
    trades = Array.from({ length: 1000 }, (_, i) => ({
      tradeId: String(i),
      price: 100 + i * 0.001,
      size: 0.01 + (i % 40) / 10,
      side: i % 2 ? "buy" : "sell",
    })),
    book = {
      bids: Array.from({ length: 100 }, (_, i) => ({
        price: 100 - i * 0.01,
        size: 1 + i / 100,
      })),
      asks: Array.from({ length: 100 }, (_, i) => ({
        price: 101 + i * 0.01,
        size: 1,
      })),
      spreadBps: 2,
    },
    started = Date.now();
  for (let i = 0; i < 1000; i++) {
    const asset = ["BTC", "ETH", "SOL", "BNB"][i % 4],
      report = registry.analyze(asset, {
        candles,
        trades,
        book,
        quality: { status: "healthy" },
      });
    assert.equal(report.status, "ok");
  }
  assert.ok(Date.now() - started < 5000);
  console.log(`desk load tests: ok (${Date.now() - started}ms)`);
})();
