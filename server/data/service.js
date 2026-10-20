"use strict";
const path = require("node:path"),
  N = require("./normalizers.js"),
  { CoinbaseConnector } = require("./coinbase.js"),
  { KrakenConnector } = require("./kraken.js"),
  { CoinbaseStream } = require("./coinbase-stream.js"),
  { OrderBook } = require("./order-book.js"),
  { CandleAggregator } = require("./candles.js"),
  { JsonlStore } = require("./jsonl-store.js"),
  { DataQualityMonitor } = require("./quality.js");
class MarketDataService {
  constructor({
    connector = new CoinbaseConnector(),
    secondary = new KrakenConnector(),
    store = new JsonlStore(
      process.env.DATA_DIR || path.resolve(process.cwd(), "var/data"),
    ),
    products = ["BTC-USD", "ETH-USD"],
    pollMs = 5000,
    publish = () => {},
    divergenceLimitBps = 25,
    quality = new DataQualityMonitor(),
    stream = null,
  } = {}) {
    this.connector = connector;
    this.secondary = secondary;
    this.store = store;
    this.products = products;
    this.pollMs = Math.max(1000, pollMs);
    this.publish = publish;
    this.divergenceLimitBps = divergenceLimitBps;
    this.quality = quality;
    this.books = new Map();
    this.candles = new CandleAggregator();
    this.tickers = new Map();
    this.secondaryTickers = new Map();
    this.divergence = new Map();
    this.seenTrades = new Map();
    this.timer = null;
    this.running = false;
    this.stream = stream;
    this.streamState = { status: stream ? "closed" : "disabled" };
    this.metrics = {
      cycles: 0,
      events: 0,
      errors: 0,
      lastCycleAt: 0,
      lastError: null,
    };
  }
  enableStream(options = {}) {
    if (this.stream) return this.stream;
    this.stream = new CoinbaseStream({
      products: this.products,
      onEvent: (x) => this.handleStream(x),
      onState: (x) => {
        this.streamState = x;
      },
      ...options,
    });
    return this.stream;
  }
  async handleStream(x) {
    try {
      const product = x.product_id;
      if (x.type === "ticker") {
        const event = N.coinbaseTicker(product, {
          ...x,
          bid: x.best_bid,
          ask: x.best_ask,
          size: x.last_size,
          volume: x.volume_24h,
        });
        this.tickers.set(product, event);
        this.quality.observe(event);
        await this.record(`ticker.${product}`, event);
        this.publish({ type: "market.ticker", data: event });
      } else if (x.type === "match" || x.type === "last_match") {
        const [event] = N.coinbaseTrades(product, [x]);
        await this.ingestTrade(event);
      } else if (x.type === "snapshot") {
        const event = N.coinbaseBook(product, { bids: x.bids, asks: x.asks });
        if (!this.books.has(product))
          this.books.set(product, new OrderBook(product, { depth: 100 }));
        this.books.get(product).load(event);
      } else if (x.type === "l2update") {
        const changes = (x.changes || []).map(([side, price, size]) => ({
          side: side === "buy" ? "bid" : "ask",
          price: Number(price),
          size: Number(size),
        }));
        this.books.get(product)?.apply(changes, { receivedAt: Date.now() });
      }
    } catch (error) {
      this.metrics.errors++;
      this.metrics.lastError = `stream:${error.message}`;
    }
  }
  async bootstrap(product) {
    const [book, trades] = await Promise.all([
        this.connector.book(product),
        this.connector.trades(product, 100),
      ]),
      ob = new OrderBook(product, { depth: 100 });
    ob.load(book);
    this.books.set(product, ob);
    await this.record(`book.${product}`, book);
    for (const trade of [...trades].reverse()) await this.ingestTrade(trade);
    return { book: ob.snapshot(20), trades: trades.length };
  }
  async recover() {
    const recovered = { trades: 0, products: [] };
    for (const product of this.products) {
      const trades = await this.store.tail(`trades.${product}`, 1000);
      if (!trades.length) continue;
      for (const trade of trades) this.candles.add(trade);
      this.seenTrades.set(product, trades.at(-1).tradeId);
      recovered.trades += trades.length;
      recovered.products.push(product);
    }
    this.metrics.recovered = recovered;
    return recovered;
  }
  async ingestTrade(trade) {
    const key = trade.symbol,
      last = this.seenTrades.get(key);
    if (last && BigInt(trade.tradeId) <= BigInt(last)) return false;
    this.seenTrades.set(key, trade.tradeId);
    const quality = this.quality.observe(trade);
    await this.record(`trades.${key}`, trade);
    for (const candle of this.candles.add(trade))
      await this.record(`candles.${key}.${candle.timeframeSec}`, candle);
    this.publish({ type: "market.trade", data: trade, quality });
    return true;
  }
  async record(stream, event) {
    this.metrics.events++;
    await this.store.append(stream, event);
  }
  async cycle() {
    const started = Date.now();
    try {
      for (const product of this.products) {
        const [ticker, book, trades, secondary] = await Promise.all([
          this.connector.ticker(product),
          this.connector.book(product),
          this.connector.trades(product, 100),
          this.secondary?.ticker(product).catch(() => null),
        ]);
        this.tickers.set(product, ticker);
        this.quality.observe(ticker);
        if (secondary) {
          this.secondaryTickers.set(product, secondary);
          this.quality.observe(secondary);
          const midpoint = (ticker.price + secondary.price) / 2,
            bps = midpoint
              ? (Math.abs(ticker.price - secondary.price) / midpoint) * 10000
              : Infinity;
          this.divergence.set(product, bps);
          await this.record(`ticker.kraken.${product}`, secondary);
        }
        if (!this.books.has(product))
          this.books.set(product, new OrderBook(product, { depth: 100 }));
        this.books.get(product).load(book);
        await Promise.all([
          this.record(`ticker.${product}`, ticker),
          this.record(`book.${product}`, book),
        ]);
        for (const trade of [...trades].reverse())
          await this.ingestTrade(trade);
        this.publish({
          type: "market.snapshot",
          symbol: product,
          ticker,
          secondary,
          divergenceBps: this.divergence.get(product),
          book: this.books.get(product).snapshot(10),
        });
      }
      this.metrics.cycles++;
      this.metrics.lastCycleAt = Date.now();
      this.metrics.lastCycleMs = Date.now() - started;
      this.metrics.lastError = null;
    } catch (e) {
      this.metrics.errors++;
      this.metrics.lastError = e.message;
      throw e;
    }
  }
  async start() {
    if (this.running) return;
    this.running = true;
    await this.recover();
    for (const p of this.products) await this.bootstrap(p);
    this.stream?.start();
    const tick = async () => {
      if (!this.running) return;
      try {
        await this.cycle();
      } catch (e) {
      } finally {
        if (this.running) this.timer = setTimeout(tick, this.pollMs);
      }
    };
    this.timer = setTimeout(tick, 0);
  }
  async stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.stream?.stop();
    await this.store.flush();
  }
  snapshot(product) {
    return {
      symbol: product,
      ticker: this.tickers.get(product) || null,
      secondaryTicker: this.secondaryTickers.get(product) || null,
      divergenceBps: this.divergence.get(product) ?? null,
      book: this.books.get(product)?.snapshot(50) || null,
      candles: this.candles.snapshots(product),
      health: this.health(),
    };
  }
  health() {
    const source = this.connector.health(),
      secondary = this.secondary?.health() || null,
      quality = this.quality.snapshot(),
      stream = this.stream?.health() || { status: "disabled" },
      cycleAge = this.metrics.lastCycleAt
        ? Date.now() - this.metrics.lastCycleAt
        : Infinity,
      maxDivergence = Math.max(0, ...this.divergence.values()),
      healthy =
        this.running &&
        source.status !== "down" &&
        cycleAge < this.pollMs * 3 &&
        maxDivergence <= this.divergenceLimitBps &&
        quality.status === "healthy";
    return {
      status: healthy ? "healthy" : this.running ? "degraded" : "stopped",
      running: this.running,
      products: this.products,
      cycleAgeMs: cycleAge,
      maxDivergenceBps: maxDivergence,
      divergenceLimitBps: this.divergenceLimitBps,
      source,
      secondary,
      stream,
      quality,
      metrics: { ...this.metrics },
    };
  }
  replay(stream, options) {
    return this.store.replay(stream, options);
  }
  storage() {
    return this.store.inventory();
  }
  async analysisContext(product) {
    const [candles, persisted] = await Promise.all([
        this.connector.candles(product, { granularity: 300 }),
        this.store.tail(`trades.${product}`, 1000),
      ]),
      trades =
        persisted.length >= 20
          ? persisted
          : await this.connector.trades(product, 200);
    return {
      candles,
      trades,
      book: this.books.get(product)?.snapshot(100) || null,
      quality: this.quality.snapshot(),
      ticker: this.tickers.get(product) || null,
    };
  }
}
module.exports = { MarketDataService };
