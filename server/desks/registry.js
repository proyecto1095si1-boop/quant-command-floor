"use strict";
const A = require("./agents.js"),
  M = require("./math.js"),
  {
    ConsensusEngine,
    DEFAULT_CORRELATIONS,
  } = require("../decision/consensus.js"),
  { DynamicCorrelationEstimator } = require("../decision/dependence.js"),
  { fingerprint } = require("../governance/service.js");
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
    consensus = new ConsensusEngine(),
    dependencePolicy = {},
  } = {}) {
    this.assets = assets;
    this.weights = weights;
    this.minCandles = minCandles;
    this.minTrades = minTrades;
    this.consensus = consensus;
    this.dependencePolicy = structuredClone(dependencePolicy);
    this.dependencies = new Map();
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
      dispersion = M.std(results.map((x) => x.signal)),
      agreement = Math.max(0, 1 - dispersion),
      estimator = this.dependenceFor(asset),
      dependence = estimator.current(DEFAULT_CORRELATIONS),
      consensus = this.consensus.combine(results, {
        weights: this.weights,
        regime: context.regime,
        blockers,
        correlations: dependence.correlations,
      });
    dependence.afterObservation = estimator.observe(results);
    return {
      asset,
      product: spec.product,
      at: new Date().toISOString(),
      status: blockers.length ? "blocked" : "ok",
      action: consensus.action,
      signal: M.clamp(consensus.signal),
      confidence: M.clamp(consensus.confidence, 0, 1),
      agreement,
      consensus,
      dependence,
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
      formula: "logit(p*) = logit(prior) + Σ(weightᵢ × logit(pᵢ))",
    };
  }

  exportDecisionState() {
    const state = {
      version: 1,
      assets: Object.fromEntries(
        [...this.dependencies].map(([asset, estimator]) => [
          asset,
          estimator.export(),
        ]),
      ),
    };
    return { ...state, hash: fingerprint(state) };
  }

  restoreDecisionState(state) {
    const { hash, ...body } = state || {};
    if (
      body.version !== 1 ||
      hash !== fingerprint(body) ||
      !body.assets ||
      typeof body.assets !== "object" ||
      Array.isArray(body.assets) ||
      Object.keys(body.assets).some((asset) => !this.assets[asset])
    )
      throw new Error("invalid-decision-checkpoint");
    const restored = new Map();
    for (const [asset, checkpoint] of Object.entries(body.assets)) {
      const estimator = new DynamicCorrelationEstimator(this.dependencePolicy);
      estimator.restore(checkpoint);
      restored.set(asset, estimator);
    }
    this.dependencies = restored;
    return Object.fromEntries(
      [...restored].map(([asset, estimator]) => [asset, estimator.status()]),
    );
  }

  dependenceFor(asset) {
    if (!this.dependencies.has(asset))
      this.dependencies.set(
        asset,
        new DynamicCorrelationEstimator(this.dependencePolicy),
      );
    return this.dependencies.get(asset);
  }
}
module.exports = { DeskRegistry, ASSETS, DEFAULT_WEIGHTS };
