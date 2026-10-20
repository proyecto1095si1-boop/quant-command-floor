"use strict";
const { PERIODS_PER_YEAR } = require("../config/annualization.js"),
  M = require("../risk/math.js");

const EPSILON = 1e-9;

function projectExposure(proposal, context = {}) {
  const mapped = Number(context.exposures?.[proposal.symbol]),
    explicit = Number(context.signedAssetExposure),
    fallback = Number(context.assetExposure),
    current = Number.isFinite(explicit)
      ? explicit
      : Number.isFinite(mapped)
        ? mapped
        : Number.isFinite(fallback)
          ? fallback
          : 0,
    notional = Math.max(0, Number(proposal.notional) || 0),
    delta = (proposal.side === "sell" ? -1 : 1) * notional,
    post = current + delta,
    currentAbsolute = Math.abs(current),
    postAbsolute = Math.abs(post),
    grossBefore = Math.max(0, Number(context.grossExposure) || 0),
    grossAfter = Math.max(0, grossBefore - currentAbsolute) + postAbsolute,
    directionReduces = current !== 0 && Math.sign(delta) !== Math.sign(current),
    flips =
      current !== 0 && post !== 0 && Math.sign(current) !== Math.sign(post),
    riskReducing = postAbsolute < currentAbsolute - EPSILON,
    closes = current !== 0 && postAbsolute <= EPSILON,
    reduceOnlyValid =
      directionReduces && !flips && postAbsolute <= currentAbsolute + EPSILON;
  return {
    current,
    delta,
    post,
    currentAbsolute,
    postAbsolute,
    grossBefore,
    grossAfter,
    directionReduces,
    riskReducing,
    closes,
    flips,
    reduceOnlyRequested: proposal.reduceOnly === true,
    reduceOnlyValid,
  };
}

class RiskGate {
  constructor(limits = {}) {
    this.periodsPerYear = Number(
      limits.periodsPerYear || PERIODS_PER_YEAR.daily,
    );
    this.limits = {
      maxDrawdown: 0.1,
      maxVaR: 0.04,
      maxCVaR: 0.06,
      maxGrossExposure: 0.7,
      maxCorrelation: 0.9,
      maxSpreadBps: 20,
      minConfidence: 0.15,
      riskPerTrade: 0.005,
      targetVolatility: 0.15,
      maxStressLoss: 0.2,
      minObservations: 50,
      kellyFraction: 0.25,
      ...limits,
    };
    delete this.limits.periodsPerYear;
    this.halted = false;
    this.reason = null;
    this.highWater = 0;
    this.reviews = [];
  }
  halt(reason = "manual") {
    this.halted = true;
    this.reason = reason;
  }
  resume() {
    this.halted = false;
    this.reason = null;
  }
  size({
    equity,
    price,
    atr,
    maxWeight,
    returns = [],
    winRate = 0.5,
    payoff = 1,
  }) {
    const annualVol = M.ewmaVolatility(returns, 0.94, this.periodsPerYear),
      periodVol = annualVol / Math.sqrt(this.periodsPerYear),
      stopDistance = Math.max(
        2 * Math.max(0, atr || 0),
        price * Math.max(0.008, periodVol * 1.5),
      ),
      riskBudget = equity * this.limits.riskPerTrade,
      byStop = stopDistance ? riskBudget / stopDistance : 0,
      byMandate = (equity * maxWeight) / price,
      byVol = annualVol
        ? (equity * this.limits.targetVolatility) / annualVol / price
        : byMandate,
      kelly = M.fractionalKelly({
        winRate,
        payoff,
        fraction: this.limits.kellyFraction,
      }),
      byKelly = kelly ? (equity * kelly) / price : byMandate,
      qty = Math.max(0, Math.min(byStop, byMandate, byVol, byKelly));
    return {
      qty,
      stopDistance,
      riskBudget,
      annualVol,
      annualizationPeriods: this.periodsPerYear,
      kelly,
      limits: { byStop, byMandate, byVol, byKelly },
      binding: Object.entries({
        stop: byStop,
        mandate: byMandate,
        volatility: byVol,
        kelly: byKelly,
      }).sort((a, b) => a[1] - b[1])[0][0],
    };
  }
  evaluate(proposal, context = {}) {
    const equity = context.equity || 1;
    this.highWater = Math.max(this.highWater, equity);
    const drawdown = Math.max(
        context.drawdown || 0,
        this.highWater ? 1 - equity / this.highWater : 0,
      ),
      tail = M.historicalVarCvar(context.returns || []),
      valueAtRisk = Math.max(context.var || 0, tail.var),
      cvar = Math.max(context.cvar || 0, tail.cvar),
      projection = projectExposure(proposal, context),
      postAsset = projection.postAbsolute / equity,
      postGross = projection.grossAfter / equity,
      emergencyReduction =
        projection.reduceOnlyRequested && projection.reduceOnlyValid,
      stress = M.stressLoss({
        ...context.exposures,
        [proposal.symbol]: projection.post,
      }),
      stressRatio = stress.worst / equity,
      checks = [
        ["system", !this.halted || emergencyReduction],
        [
          "data",
          context.dataStatus === "healthy" ||
            (emergencyReduction && context.dataStatus === "degraded"),
        ],
        [
          "reduce-only",
          !projection.reduceOnlyRequested || projection.reduceOnlyValid,
        ],
        [
          "history",
          emergencyReduction ||
            !context.returns?.length ||
            tail.observations >= this.limits.minObservations,
        ],
        [
          "confidence",
          emergencyReduction ||
            proposal.confidence >= this.limits.minConfidence,
        ],
        ["drawdown", emergencyReduction || drawdown <= this.limits.maxDrawdown],
        ["VaR", emergencyReduction || valueAtRisk <= this.limits.maxVaR],
        ["CVaR", emergencyReduction || cvar <= this.limits.maxCVaR],
        [
          "stress-loss",
          emergencyReduction || stressRatio <= this.limits.maxStressLoss,
        ],
        [
          "asset-weight",
          emergencyReduction || postAsset <= proposal.maxWeight + EPSILON,
        ],
        [
          "gross-exposure",
          emergencyReduction || postGross <= this.limits.maxGrossExposure,
        ],
        [
          "correlation",
          emergencyReduction ||
            (context.correlation || 0) <= this.limits.maxCorrelation,
        ],
        [
          "liquidity",
          emergencyReduction ||
            (context.spreadBps || 0) <= this.limits.maxSpreadBps,
        ],
        ["quantity", proposal.qty > 0 && proposal.notional > 0],
      ],
      failed = checks.filter((x) => !x[1]).map((x) => x[0]),
      review = {
        at: new Date().toISOString(),
        proposalId: proposal.id,
        decision: failed.length ? "VETO" : "APPROVE",
        approved: !failed.length,
        failed,
        checks: checks.map(([name, pass]) => ({ name, pass })),
        metrics: {
          postAssetWeight: postAsset,
          postGrossExposure: postGross,
          spreadBps: context.spreadBps || 0,
          drawdown,
          var: valueAtRisk,
          cvar,
          annualVol: M.ewmaVolatility(
            context.returns || [],
            0.94,
            this.periodsPerYear,
          ),
          stressLossRatio: stressRatio,
          exposure: projection,
        },
        stress,
        reduceOnlyOverrides: emergencyReduction
          ? [
              "history",
              "confidence",
              "drawdown",
              "VaR",
              "CVaR",
              "stress-loss",
              "asset-weight",
              "gross-exposure",
              "correlation",
              "liquidity",
            ]
          : [],
        haltReason: this.reason,
      };
    this.reviews.push(review);
    if (this.reviews.length > 500) this.reviews.shift();
    return review;
  }
  status() {
    return {
      halted: this.halted,
      reason: this.reason,
      limits: { ...this.limits },
      annualizationPeriods: this.periodsPerYear,
      highWater: this.highWater,
      reviews: this.reviews.length,
      lastReview: this.reviews.at(-1) || null,
    };
  }
}
module.exports = { RiskGate, projectExposure };
