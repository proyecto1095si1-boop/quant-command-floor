"use strict";
const { PERIODS_PER_YEAR } = require("../config/annualization.js"),
  M = require("./math.js");
const STATES = [
  {
    name: "risk_on_low_vol",
    mu: [0.0006, 0.008, 0.018, 0.0005],
    sigma: [0.001, 0.006, 0.025, 0.0005],
    riskMultiplier: 1,
    allowed: ["momentum", "breakout", "carry"],
  },
  {
    name: "range_mean_reverting",
    mu: [0, 0.014, 0, 0.0008],
    sigma: [0.001, 0.008, 0.018, 0.0007],
    riskMultiplier: 0.8,
    allowed: ["mean_reversion", "market_neutral", "options_income"],
  },
  {
    name: "trend_high_vol",
    mu: [0.0002, 0.035, 0.04, 0.0015],
    sigma: [0.002, 0.015, 0.05, 0.001],
    riskMultiplier: 0.6,
    allowed: ["trend", "volatility", "hedged_momentum"],
  },
  {
    name: "risk_off_crisis",
    mu: [-0.0015, 0.05, -0.07, 0.003],
    sigma: [0.003, 0.025, 0.07, 0.002],
    riskMultiplier: 0.35,
    allowed: ["cash", "protective_put", "short_trend"],
  },
];
const TRANSITION = [
  [0.88, 0.07, 0.04, 0.01],
  [0.08, 0.82, 0.08, 0.02],
  [0.05, 0.08, 0.78, 0.09],
  [0.02, 0.04, 0.14, 0.8],
];
class RegimeService {
  constructor({ record = async () => {} } = {}) {
    this.record = record;
    this.latest = new Map();
  }
  analyze({
    asset = "BTC",
    candles = [],
    book = {},
    periods = PERIODS_PER_YEAR.hourly,
  } = {}) {
    const prices = candles.map((x) => Number(x.close)).filter((x) => x > 0);
    if (prices.length < 60)
      throw Object.assign(new Error("regime-requires-60-candles"), {
        status: 422,
      });
    const rs = M.returns(prices),
      obs = M.features(prices, Number(book?.spreadBps || 0)),
      probabilities = M.hmm(obs, STATES, TRANSITION),
      index = probabilities.indexOf(Math.max(...probabilities)),
      state = STATES[index],
      cp = M.changePoint(rs),
      uncertainty =
        -probabilities.reduce((s, p) => (p ? s + p * Math.log(p) : s), 0) /
        Math.log(probabilities.length),
      result = {
        asset,
        at: new Date().toISOString(),
        regime: state.name,
        probability: probabilities[index],
        probabilities: Object.fromEntries(
          STATES.map((s, i) => [s.name, probabilities[i]]),
        ),
        expectedDuration: 1 / (1 - TRANSITION[index][index]),
        transitionRisk: 1 - TRANSITION[index][index],
        riskMultiplier:
          cp.probability > 0.8
            ? state.riskMultiplier * 0.75
            : state.riskMultiplier,
        allowedStrategies: state.allowed,
        blockedStrategies: STATES.flatMap((x) => x.allowed).filter(
          (x) => !state.allowed.includes(x),
        ),
        diagnostics: {
          annualizationPeriods: periods,
          meanReturn: M.mean(rs.slice(-20)),
          volatility: M.std(rs.slice(-20)) * Math.sqrt(periods),
          hurst: M.hurst(prices.slice(-120)),
          entropy: M.entropy(rs.slice(-60)),
          changePointProbability: cp.probability,
          changePointZ: cp.z,
          uncertainty,
        },
      };
    this.latest.set(asset, result);
    this.record("regime.analysis", result).catch(() => {});
    return result;
  }
  status() {
    return {
      states: STATES.map((x) => ({
        name: x.name,
        riskMultiplier: x.riskMultiplier,
        allowed: x.allowed,
      })),
      latest: Object.fromEntries(this.latest),
      transition: TRANSITION,
    };
  }
}
module.exports = { RegimeService, STATES, TRANSITION };
