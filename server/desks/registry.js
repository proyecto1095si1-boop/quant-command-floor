"use strict";
const A = require("./agents.js"),
  M = require("./math.js");
const DEFAULT_WEIGHTS = {
  Technical: 1.25,
  Volume: 0.9,
  Whale: 1,
  Liquidity: 1.1,
  "Market Structure": 1.2,
  "Order Block": 0.85,
};
const ASSETS = {
  BTC: {
    product: "BTC-USD",
    riskClass: "major",
    factor: "crypto-core",
    maxWeight: 0.35,
  },
  ETH: {
    product: "ETH-USD",
    riskClass: "major",
    factor: "crypto-core",
    maxWeight: 0.3,
  },
  SOL: {
    product: "SOL-USD",
    riskClass: "major-high-beta",
    factor: "high-beta-l1",
    maxWeight: 0.15,
  },
  BNB: {
    product: "BNB-USD",
    riskClass: "major-venue",
    factor: "venue-linked",
    maxWeight: 0.1,
  },
};
class DeskRegistry {
  constructor({
    assets = ASSETS,
    weights = DEFAULT_WEIGHTS,
    minCandles = 50,
    minTrades = 20,
  } = {}) {
    this.assets = assets;
    this.weights = weights;
    this.minCandles = minCandles;
    this.minTrades = minTrades;
  }
  list() {
    return Object.entries(this.assets).map(([asset, x]) => ({
      asset,
      ...x,
      agents: [...Object.keys(this.weights), "Signal Hub"],
    }));
  }
  analyze(asset, context = {}) {
    const spec = this.assets[asset];
    if (!spec) throw Object.assign(new Error("unknown-asset"), { status: 404 });
    const candles = context.candles || [],
      trades = context.trades || [],
      quality = context.quality || { status: "healthy" },
      blockers = [];
    if (candles.length < this.minCandles)
      blockers.push(`candles:${candles.length}/${this.minCandles}`);
    if (trades.length < this.minTrades)
      blockers.push(`trades:${trades.length}/${this.minTrades}`);
    if (!context.book?.bids?.length || !context.book?.asks?.length)
      blockers.push("book:missing");
    if (quality.status !== "healthy")
      blockers.push(`quality:${quality.status}`);
    const results = [
        A.technical(candles),
        A.volume(candles),
        A.whale(trades),
        A.liquidity(context.book),
        A.marketStructure(candles),
        A.orderBlock(candles),
      ],
      weighted = results.reduce(
        (a, x) => {
          const w = this.weights[x.agent] || 1;
          return {
            signal: a.signal + x.signal * x.confidence * w,
            weight: a.weight + x.confidence * w,
          };
        },
        { signal: 0, weight: 0 },
      ),
      signal = weighted.weight ? weighted.signal / weighted.weight : 0,
      dispersion = M.std(results.map((x) => x.signal)),
      agreement = Math.max(0, 1 - dispersion),
      confidence =
        M.mean(results.map((x) => x.confidence)) *
        agreement *
        (blockers.length ? 0 : 0.95),
      action = blockers.length
        ? "NO_TRADE"
        : signal > 0.2
          ? "LONG"
          : signal < -0.2
            ? "SHORT"
            : "FLAT";
    return {
      asset,
      product: spec.product,
      at: new Date().toISOString(),
      status: blockers.length ? "blocked" : "ok",
      action,
      signal: M.clamp(signal),
      confidence: M.clamp(confidence, 0, 1),
      agreement,
      blockers,
      agents: results,
      inputSummary: {
        candles: candles.length,
        trades: trades.length,
        bids: context.book?.bids?.length || 0,
        asks: context.book?.asks?.length || 0,
        quality: quality.status,
      },
      policy: {
        paperOnly: true,
        maxPortfolioWeight: spec.maxWeight,
        riskClass: spec.riskClass,
        factor: spec.factor || spec.riskClass || asset,
      },
      formula: "Σ(signalᵢ × confidenceᵢ × weightᵢ) / Σ(confidenceᵢ × weightᵢ)",
    };
  }
}
module.exports = { DeskRegistry, ASSETS, DEFAULT_WEIGHTS };
