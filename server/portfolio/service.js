"use strict";
const crypto = require("node:crypto"),
  M = require("./math.js"),
  { returns } = require("../risk/math.js");
class PortfolioService {
  constructor({
    pipeline,
    dataService,
    record = async () => {},
    policy = {},
  } = {}) {
    this.pipeline = pipeline;
    this.dataService = dataService;
    this.record = record;
    this.policy = {
      method: "blended",
      investmentBudget: 0.85,
      riskParityBlend: 0.65,
      riskAversion: 6,
      rebalanceBand: 0.02,
      maxTurnover: 0.2,
      ...policy,
    };
    this.plans = [];
  }
  assets() {
    return Object.entries(this.pipeline.desks.assets).map(([asset, x]) => ({
      asset,
      ...x,
    }));
  }
  status() {
    const portfolio = this.pipeline.ledger.snapshot(this.pipeline.marks());
    return {
      paperOnly: true,
      policy: this.policy,
      portfolio,
      lastPlan: this.plans.at(-1) || null,
      plans: this.plans.length,
    };
  }
  async marketSeries() {
    return Promise.all(
      this.assets().map(async (x) => {
        const candles = await this.dataService.connector.candles(x.product, {
          granularity: 3600,
        });
        return returns(candles.map((c) => c.close));
      }),
    );
  }
  async plan(input = {}) {
    const assets = this.assets(),
      series = input.returnsMatrix || (await this.marketSeries()),
      n = Math.min(...series.map((x) => x.length));
    if (series.length !== assets.length || n < 30)
      throw Object.assign(new Error("insufficient-portfolio-history"), {
        status: 422,
      });
    const aligned = series.map((x) => x.slice(-n).map(Number)),
      caps = assets.map((x) => x.maxWeight),
      rp = M.riskParity(aligned, caps, this.policy.investmentBudget),
      mv = M.meanVariance(aligned, caps, this.policy),
      blend = Number(input.riskParityBlend ?? this.policy.riskParityBlend),
      target = M.normalizeCapped(
        rp.map((w, i) => w * blend + mv[i] * (1 - blend)),
        caps,
        this.policy.investmentBudget,
      ),
      portfolio = this.pipeline.ledger.snapshot(this.pipeline.marks()),
      current = assets.map(
        (x) =>
          Math.abs(portfolio.positions[x.product]?.marketValue || 0) /
          (portfolio.equity || 1),
      ),
      rebalancing = M.rebalance(current, target, this.policy),
      diagnostics = M.diagnostics(target, aligned),
      rows = assets.map((x, i) => ({
        ...x,
        currentWeight: current[i],
        targetWeight: target[i],
        tradeWeight: rebalancing.trades[i],
        tradeNotional: rebalancing.trades[i] * portfolio.equity,
        riskContribution: diagnostics.riskContributions[i],
      })),
      plan = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        method: this.policy.method,
        observations: n,
        equity: portfolio.equity,
        cashTarget: 1 - target.reduce((a, b) => a + b, 0),
        allocations: rows,
        diagnostics: {
          annualVolatility: diagnostics.annualVolatility,
          diversificationRatio: diagnostics.diversificationRatio,
        },
        rebalancing: {
          turnover: rebalancing.turnover,
          rawTurnover: rebalancing.rawTurnover,
          scaled: rebalancing.scaled,
          band: rebalancing.band,
          maxTurnover: rebalancing.maxTurnover,
        },
        approval: { required: true, state: "proposed" },
      };
    this.plans.push(plan);
    if (this.plans.length > 100) this.plans.shift();
    await this.record("portfolio.plans", plan);
    return plan;
  }
}
module.exports = { PortfolioService };
