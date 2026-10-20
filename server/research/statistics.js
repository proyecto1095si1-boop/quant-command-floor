"use strict";
const { PERIODS_PER_YEAR } = require("../config/annualization.js");

function mean(x) {
  return x.length ? x.reduce((a, b) => a + b, 0) / x.length : 0;
}
function variance(x, sample = true) {
  if (x.length < (sample ? 2 : 1)) return 0;
  const m = mean(x);
  return (
    x.reduce((a, b) => a + (b - m) ** 2, 0) / (x.length - (sample ? 1 : 0))
  );
}
function std(x) {
  return Math.sqrt(Math.max(0, variance(x)));
}
function moments(x) {
  const m = mean(x),
    s =
      Math.sqrt(x.reduce((a, b) => a + (b - m) ** 2, 0) / (x.length || 1)) || 1;
  return {
    mean: m,
    std: std(x),
    skew: mean(x.map((v) => ((v - m) / s) ** 3)),
    kurtosis: mean(x.map((v) => ((v - m) / s) ** 4)),
  };
}
function sharpe(x, periods = PERIODS_PER_YEAR.daily) {
  const s = std(x);
  return s ? (mean(x) / s) * Math.sqrt(periods) : 0;
}
function erf(x) {
  const sign = x < 0 ? -1 : 1,
    a = Math.abs(x),
    t = 1 / (1 + 0.3275911 * a),
    y =
      1 -
      ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
        t +
        0.254829592) *
        t *
        Math.exp(-a * a);
  return sign * y;
}
function normalCdf(x) {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}
function probabilisticSharpeRatio(
  returns,
  benchmark = 0,
  periods = PERIODS_PER_YEAR.daily,
) {
  const n = returns.length,
    m = moments(returns),
    sr = sharpe(returns, periods),
    den = Math.sqrt(
      Math.max(
        1e-12,
        1 -
          (m.skew * sr) / Math.sqrt(periods) +
          ((m.kurtosis - 1) * sr * sr) / (4 * periods),
      ),
    );
  return normalCdf(((sr - benchmark) * Math.sqrt(Math.max(1, n - 1))) / den);
}
function deflatedSharpeRatio(
  returns,
  trials = 1,
  periods = PERIODS_PER_YEAR.daily,
) {
  const n = Math.max(2, returns.length),
    penalty =
      Math.sqrt((2 * Math.log(Math.max(1, trials))) / (n - 1)) *
      Math.sqrt(periods),
    sr = sharpe(returns, periods);
  return {
    sharpe: sr,
    benchmark: penalty,
    probability: probabilisticSharpeRatio(returns, penalty, periods),
    trials: Math.max(1, trials),
  };
}
function maxDrawdown(returns) {
  let wealth = 1,
    peak = 1,
    worst = 0;
  for (const r of returns) {
    wealth *= 1 + r;
    peak = Math.max(peak, wealth);
    worst = Math.max(worst, (peak - wealth) / peak);
  }
  return worst;
}
function median(x) {
  if (!x.length) return 0;
  const a = [...x].sort((a, b) => a - b),
    m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
module.exports = {
  mean,
  variance,
  std,
  moments,
  sharpe,
  normalCdf,
  probabilisticSharpeRatio,
  deflatedSharpeRatio,
  maxDrawdown,
  median,
};
