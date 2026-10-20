"use strict";
const M = require("./math.js");
function technical(candles) {
  const closes = candles.map((x) => x.close),
    fast = M.ema(closes.slice(-60), 12),
    slow = M.ema(closes.slice(-100), 26),
    rsi = M.rsi(closes),
    atr = M.atr(candles),
    trend = atr ? (fast - slow) / atr : 0,
    momentum = (rsi - 50) / 25,
    signal = Math.tanh(0.7 * trend + 0.3 * momentum),
    confidence = Math.min(0.95, 0.5 + Math.abs(signal) * 0.4);
  return M.result(
    "Technical",
    signal,
    confidence,
    [
      `EMA12=${fast.toFixed(4)}`,
      `EMA26=${slow.toFixed(4)}`,
      `RSI14=${rsi.toFixed(2)}`,
      `ATR14=${atr.toFixed(4)}`,
    ],
    { fast, slow, rsi, atr },
  );
}
function volume(candles) {
  const volumes = candles.map((x) => x.volume),
    current = volumes.at(-1) || 0,
    z = M.zscore(current, volumes.slice(-21, -1)),
    obv = candles
      .slice(-21)
      .reduce(
        (a, x, i, arr) =>
          i ? a + (x.close >= arr[i - 1].close ? x.volume : -x.volume) : 0,
        0,
      ),
    normalizer = volumes.slice(-21).reduce((a, b) => a + b, 0) || 1,
    flow = obv / normalizer,
    signal =
      Math.tanh(z / 3) * Math.sign(flow || 1) * 0.6 + M.clamp(flow) * 0.4;
  return M.result(
    "Volume",
    signal,
    Math.min(0.93, 0.5 + Math.abs(z) / 8),
    [`volume-z=${z.toFixed(3)}`, `OBV-flow=${flow.toFixed(3)}`],
    { z, flow },
  );
}
function whale(trades) {
  const rows = trades.map((x) => ({ ...x, notional: x.price * x.size })),
    threshold = M.quantile(
      rows.map((x) => x.notional),
      0.95,
    ),
    large = rows.filter((x) => x.notional >= threshold),
    buy = large
      .filter((x) => x.side === "buy")
      .reduce((a, x) => a + x.notional, 0),
    sell = large
      .filter((x) => x.side === "sell")
      .reduce((a, x) => a + x.notional, 0),
    pressure = buy + sell ? (buy - sell) / (buy + sell) : 0;
  return M.result(
    "Whale",
    pressure,
    Math.min(0.9, 0.4 + large.length / 20),
    [
      `p95-notional=${threshold.toFixed(2)}`,
      `large-trades=${large.length}`,
      `pressure=${pressure.toFixed(3)}`,
    ],
    { threshold, largeTrades: large.length, buy, sell },
  );
}
function liquidity(book) {
  const bids = book?.bids || [],
    asks = book?.asks || [],
    bid = bids.reduce((a, x) => a + x.size, 0),
    ask = asks.reduce((a, x) => a + x.size, 0),
    imbalance = bid + ask ? (bid - ask) / (bid + ask) : 0,
    spreadBps = Number(book?.spreadBps || 0),
    penalty = Math.min(1, spreadBps / 20),
    signal = imbalance * (1 - penalty),
    confidence = Math.max(
      0.2,
      Math.min(
        0.98,
        (1 - penalty) * 0.6 + Math.min(1, (bid + ask) / 10) * 0.35,
      ),
    );
  return M.result(
    "Liquidity",
    signal,
    confidence,
    [
      `imbalance=${imbalance.toFixed(3)}`,
      `spread=${spreadBps.toFixed(2)}bps`,
      `depth=${(bid + ask).toFixed(4)}`,
    ],
    { imbalance, spreadBps, bidDepth: bid, askDepth: ask },
  );
}
function marketStructure(candles) {
  const xs = candles.slice(-60),
    highs = [],
    lows = [];
  for (let i = 2; i < xs.length - 2; i++) {
    if (
      xs[i].high > xs[i - 1].high &&
      xs[i].high > xs[i - 2].high &&
      xs[i].high > xs[i + 1].high &&
      xs[i].high > xs[i + 2].high
    )
      highs.push(xs[i].high);
    if (
      xs[i].low < xs[i - 1].low &&
      xs[i].low < xs[i - 2].low &&
      xs[i].low < xs[i + 1].low &&
      xs[i].low < xs[i + 2].low
    )
      lows.push(xs[i].low);
  }
  const close = xs.at(-1)?.close || 0,
    lastHigh = highs.at(-1) || Infinity,
    lastLow = lows.at(-1) || -Infinity,
    bullBos = close > lastHigh,
    bearBos = close < lastLow,
    trend =
      highs.length > 1 && lows.length > 1
        ? highs.at(-1) > highs.at(-2) && lows.at(-1) > lows.at(-2)
          ? 1
          : highs.at(-1) < highs.at(-2) && lows.at(-1) < lows.at(-2)
            ? -1
            : 0
        : 0,
    signal = bullBos ? 1 : bearBos ? -1 : trend * 0.55,
    confidence = 0.55 + (bullBos || bearBos ? 0.35 : Math.abs(trend) * 0.2);
  return M.result(
    "Market Structure",
    signal,
    confidence,
    [
      `swing-high=${Number(lastHigh).toFixed(4)}`,
      `swing-low=${Number(lastLow).toFixed(4)}`,
      `BOS=${bullBos ? "bull" : bearBos ? "bear" : "none"}`,
    ],
    { trend, bullBos, bearBos, lastHigh, lastLow },
  );
}
function orderBlock(candles) {
  const xs = candles.slice(-80),
    atr = M.atr(xs),
    current = xs.at(-1)?.close || 0;
  let found = null;
  for (let i = xs.length - 1; i >= 2; i--) {
    const body = Math.abs(xs[i].close - xs[i].open),
      direction = Math.sign(xs[i].close - xs[i].open);
    if (body > atr * 1.5) {
      const prev = xs[i - 1],
        opposite = Math.sign(prev.close - prev.open) === -direction;
      if (opposite) {
        found = { direction, low: prev.low, high: prev.high, index: i - 1 };
        break;
      }
    }
  }
  if (!found)
    return M.result("Order Block", 0, 0.25, ["no-valid-displacement"], { atr });
  const center = (found.low + found.high) / 2,
    distance = atr ? Math.abs(current - center) / atr : 99,
    inZone = current >= found.low && current <= found.high,
    signal = found.direction * (inZone ? 1 : Math.max(0, 1 - distance / 5)),
    confidence = inZone ? 0.9 : Math.max(0.3, 0.75 - distance * 0.08);
  return M.result(
    "Order Block",
    signal,
    confidence,
    [
      `zone=${found.low.toFixed(4)}..${found.high.toFixed(4)}`,
      `direction=${found.direction > 0 ? "demand" : "supply"}`,
      `distanceATR=${distance.toFixed(2)}`,
    ],
    { ...found, distanceAtr: distance, inZone, atr },
  );
}
module.exports = {
  technical,
  volume,
  whale,
  liquidity,
  marketStructure,
  orderBlock,
};
