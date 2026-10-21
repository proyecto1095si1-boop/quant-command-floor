"use strict";

function levels(rows = []) {
  return rows
    .map((row) => ({
      price: Number(Array.isArray(row) ? row[0] : row?.price),
      size: Number(Array.isArray(row) ? row[1] : row?.size),
    }))
    .filter((row) => row.price > 0 && row.size > 0);
}

function bookMetrics(book = {}) {
  book = book || {};
  const bids = levels(book.bids).sort((a, b) => b.price - a.price),
    asks = levels(book.asks).sort((a, b) => a.price - b.price),
    bestBid = bids[0],
    bestAsk = asks[0],
    bidDepth = bids.reduce((sum, row) => sum + row.size, 0),
    askDepth = asks.reduce((sum, row) => sum + row.size, 0),
    totalDepth = bidDepth + askDepth,
    midpoint = bestBid && bestAsk ? (bestBid.price + bestAsk.price) / 2 : null,
    microprice =
      bestBid && bestAsk && bestBid.size + bestAsk.size > 0
        ? (bestAsk.price * bestBid.size + bestBid.price * bestAsk.size) /
          (bestBid.size + bestAsk.size)
        : null;
  return {
    midpoint,
    microprice,
    micropriceEdgeBps:
      midpoint && microprice
        ? ((microprice - midpoint) / midpoint) * 10_000
        : null,
    spreadBps:
      midpoint && bestBid && bestAsk
        ? ((bestAsk.price - bestBid.price) / midpoint) * 10_000
        : null,
    imbalance: totalDepth ? (bidDepth - askDepth) / totalDepth : null,
    bidDepth,
    askDepth,
    bidDepthNotional: bids.reduce((sum, row) => sum + row.price * row.size, 0),
    askDepthNotional: asks.reduce((sum, row) => sum + row.price * row.size, 0),
  };
}

function tradeMetrics(trades = []) {
  const rows = trades
    .map((trade) => ({
      price: Number(trade.price),
      size: Number(trade.size),
      side: trade.side === "sell" ? -1 : 1,
    }))
    .filter((row) => row.price > 0 && row.size > 0);
  let amihudSum = 0,
    amihudCount = 0,
    sumX = 0,
    sumY = 0,
    sumXX = 0,
    sumXY = 0,
    buyVolume = 0,
    sellVolume = 0;
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    if (row.side > 0) buyVolume += row.size;
    else sellVolume += row.size;
    if (!index) continue;
    const priceChange = row.price - rows[index - 1].price,
      logReturn = Math.log(row.price / rows[index - 1].price),
      signedNotional = row.side * row.price * row.size;
    amihudSum += Math.abs(logReturn) / (row.price * row.size);
    amihudCount++;
    sumX += signedNotional;
    sumY += priceChange;
    sumXX += signedNotional * signedNotional;
    sumXY += signedNotional * priceChange;
  }
  const n = Math.max(0, rows.length - 1),
    denominator = n * sumXX - sumX * sumX,
    totalVolume = buyVolume + sellVolume;
  return {
    observations: rows.length,
    amihud: amihudCount ? amihudSum / amihudCount : null,
    kyleLambda: denominator ? (n * sumXY - sumX * sumY) / denominator : null,
    flowToxicity: totalVolume
      ? Math.abs(buyVolume - sellVolume) / totalVolume
      : null,
    buyVolume,
    sellVolume,
  };
}

function microstructure(book, trades) {
  return { book: bookMetrics(book), trades: tradeMetrics(trades) };
}

module.exports = { bookMetrics, microstructure, tradeMetrics };
