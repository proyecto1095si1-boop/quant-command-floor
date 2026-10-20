"use strict";
const finite = (x, name) => {
  const n = Number(x);
  if (!Number.isFinite(n)) throw new Error(`invalid-${name}`);
  return n;
};
const iso = (x) => new Date(x).toISOString();
function symbol(value) {
  return String(value)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "");
}
function coinbaseBook(product, raw, receivedAt = Date.now()) {
  const map = (rows, side) =>
    rows.map(([price, size, count]) => ({
      side,
      price: finite(price, "price"),
      size: finite(size, "size"),
      orders: Number(count) || 0,
    }));
  return {
    type: "book.snapshot",
    source: "coinbase",
    symbol: symbol(product),
    sequence: Number(raw.sequence) || null,
    bids: map(raw.bids || [], "bid").sort((a, b) => b.price - a.price),
    asks: map(raw.asks || [], "ask").sort((a, b) => a.price - b.price),
    exchangeAt: null,
    receivedAt: iso(receivedAt),
  };
}
function coinbaseTicker(product, raw, receivedAt = Date.now()) {
  return {
    type: "ticker",
    source: "coinbase",
    symbol: symbol(product),
    price: finite(raw.price, "price"),
    bid: finite(raw.bid, "bid"),
    ask: finite(raw.ask, "ask"),
    size: finite(raw.size || 0, "size"),
    volume24h: finite(raw.volume || 0, "volume"),
    exchangeAt: raw.time ? iso(raw.time) : null,
    receivedAt: iso(receivedAt),
  };
}
function coinbaseTrades(product, rows, receivedAt = Date.now()) {
  return (rows || []).map((x) => ({
    type: "trade",
    source: "coinbase",
    symbol: symbol(product),
    tradeId: String(x.trade_id),
    price: finite(x.price, "price"),
    size: finite(x.size, "size"),
    makerSide: x.side === "sell" ? "sell" : "buy",
    side: x.side === "sell" ? "buy" : "sell",
    exchangeAt: iso(x.time),
    receivedAt: iso(receivedAt),
  }));
}
function coinbaseCandles(product, rows, granularity, receivedAt = Date.now()) {
  return (rows || [])
    .map(([time, low, high, open, close, volume]) => ({
      type: "candle",
      source: "coinbase",
      symbol: symbol(product),
      timeframeSec: Number(granularity),
      openTime: iso(time * 1000),
      closeTime: iso((time + granularity) * 1000 - 1),
      open: finite(open, "open"),
      high: finite(high, "high"),
      low: finite(low, "low"),
      close: finite(close, "close"),
      volume: finite(volume, "volume"),
      complete: time + granularity <= Date.now() / 1000,
      receivedAt: iso(receivedAt),
    }))
    .sort((a, b) => a.openTime.localeCompare(b.openTime));
}
module.exports = {
  symbol,
  coinbaseBook,
  coinbaseTicker,
  coinbaseTrades,
  coinbaseCandles,
};
