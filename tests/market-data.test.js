const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const N = require("../server/data/normalizers.js"),
  { OrderBook } = require("../server/data/order-book.js"),
  { CandleAggregator } = require("../server/data/candles.js"),
  { JsonlStore } = require("../server/data/jsonl-store.js"),
  { CoinbaseConnector } = require("../server/data/coinbase.js"),
  { MarketDataService } = require("../server/data/service.js");
const { DataQualityMonitor } = require("../server/data/quality.js");
const { MarketReconciliation } = require("../server/data/reconciliation.js");
(async () => {
  const bookEvent = N.coinbaseBook(
    "BTC-USD",
    {
      sequence: 9,
      bids: [
        ["100", "2", 1],
        ["99", "1", 1],
      ],
      asks: [
        ["101", "3", 1],
        ["102", "1", 1],
      ],
    },
    0,
  );
  assert.equal(bookEvent.bids[0].price, 100);
  const book = new OrderBook("BTC-USD", { depth: 2 });
  const snap = book.load(bookEvent);
  assert.equal(snap.mid, 100.5);
  assert.equal(snap.spreadBps, (1 / 100.5) * 10000);
  assert.equal(
    book.apply(
      [
        { side: "bid", price: 100, size: 0 },
        { side: "bid", price: 100.5, size: 1 },
      ],
      { sequence: 10 },
    ).applied,
    true,
  );
  assert.equal(book.snapshot().bestBid, 100.5);
  assert.equal(book.apply([], { sequence: 12 }).reason, "sequence-gap");
  const candles = new CandleAggregator([60, 300]),
    trade = (time, price, size = 1) => ({
      symbol: "BTC-USD",
      source: "test",
      price,
      size,
      exchangeAt: new Date(time).toISOString(),
      receivedAt: new Date(time).toISOString(),
    });
  assert.equal(candles.add(trade(0, 100)).length, 0);
  candles.add(trade(30000, 110, 2));
  const closed = candles.add(trade(60000, 105));
  assert.equal(closed.find((x) => x.timeframeSec === 60).high, 110);
  assert.equal(closed.find((x) => x.timeframeSec === 60).volume, 3);
  const quality = new DataQualityMonitor({ maxAgeMs: 1000, zLimit: 3 });
  [100, 101, 99, 100, 101, 99, 100].forEach((price, i) =>
    quality.observe({
      type: "ticker",
      source: "x",
      symbol: "BTC",
      price,
      receivedAt: new Date(1000 + i).toISOString(),
    }),
  );
  assert.equal(
    quality.observe({
      type: "ticker",
      source: "x",
      symbol: "BTC",
      price: 500,
      receivedAt: new Date(1008).toISOString(),
    }).outlier,
    true,
  );
  assert.equal(quality.snapshot(100000).status, "degraded");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qcf-data-")),
    store = new JsonlStore(dir, {
      clock: () => new Date("2026-10-19T00:00:00Z"),
    });
  await store.append("trades.BTC-USD", {
    receivedAt: "2026-10-19T00:00:01Z",
    price: 100,
  });
  await store.append("trades.BTC-USD", {
    receivedAt: "2026-10-19T00:00:02Z",
    price: 101,
  });
  await store.flush();
  const replay = await store.replay("trades.BTC-USD");
  assert.deepEqual(
    replay.map((x) => x.price),
    [100, 101],
  );
  const inventory = await store.inventory();
  assert.equal(inventory.files, 1);
  assert.equal((await store.verify("trades.BTC-USD")).valid, true);
  const compacted = await store.compact({
    before: new Date("2026-10-20T00:00:00Z"),
  });
  assert.equal(compacted.compressed, 1);
  assert.equal((await store.replay("trades.BTC-USD")).length, 2);
  assert.deepEqual(
    (await store.tail("trades.BTC-USD", 1)).map((x) => x.price),
    [101],
  );
  const fixtures = {
    ticker: {
      price: "100",
      bid: "99",
      ask: "101",
      size: "1",
      volume: "20",
      time: "2026-10-19T00:00:00Z",
    },
    book: { sequence: 1, bids: [["99", "2", 1]], asks: [["101", "3", 1]] },
    trades: [
      {
        trade_id: 2,
        price: "100",
        size: "1",
        side: "buy",
        time: "2026-10-19T00:00:02Z",
      },
      {
        trade_id: 1,
        price: "99",
        size: "1",
        side: "sell",
        time: "2026-10-19T00:00:01Z",
      },
    ],
  };
  const fetcher = async (url) => ({
      ok: true,
      json: async () =>
        url.includes("/ticker")
          ? fixtures.ticker
          : url.includes("/book")
            ? fixtures.book
            : fixtures.trades,
    }),
    connector = new CoinbaseConnector({ fetcher, retries: 0 }),
    secondary = {
      ticker: async (product) => ({
        ...fixtures.ticker,
        type: "ticker",
        source: "kraken",
        symbol: product,
        price: 100.1,
        exchangeAt: null,
        receivedAt: new Date().toISOString(),
      }),
      health: () => ({ source: "kraken", status: "healthy" }),
    },
    events = [],
    serviceRoot = path.join(dir, "service"),
    service = new MarketDataService({
      connector,
      secondary,
      store: new JsonlStore(serviceRoot),
      products: ["BTC-USD"],
      pollMs: 999999,
      publish: (x) => events.push(x),
      reconciliation: new MarketReconciliation({
        clock: () => Date.now(),
        maxSpreadBps: 250,
      }),
    });
  await service.bootstrap("BTC-USD");
  await service.cycle();
  assert.equal(service.snapshot("BTC-USD").ticker.price, 100);
  assert.ok(service.snapshot("BTC-USD").divergenceBps > 0);
  assert.equal(service.health().secondary.source, "kraken");
  assert.equal(service.health().provenance.algorithm, "SHA-256");
  assert.equal(service.snapshot("BTC-USD").reconciliation.status, "healthy");
  assert.equal(service.health().reconciliation.status, "healthy");
  assert.ok(events.some((x) => x.type === "market.snapshot"));
  await service.stop();
  const restarted = new MarketDataService({
    connector,
    secondary,
    store: new JsonlStore(serviceRoot),
    products: ["BTC-USD"],
  });
  const recovered = await restarted.recover();
  assert.ok(recovered.trades >= 2);
  assert.equal(restarted.seenTrades.get("BTC-USD"), "2");
  const retention = await store.enforceRetention({
    days: 30,
    now: new Date("2027-01-01T00:00:00Z"),
  });
  assert.equal(retention.removed.length, 1);
  fs.rmSync(dir, { recursive: true });
  console.log("market data tests: ok");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
