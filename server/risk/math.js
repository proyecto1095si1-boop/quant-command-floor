"use strict";
const { PERIODS_PER_YEAR } = require("../config/annualization.js");

function mean(x) {
  return x.length ? x.reduce((a, b) => a + b, 0) / x.length : 0;
}
function percentile(x, p) {
  if (!x.length) return 0;
  const a = [...x].sort((u, v) => u - v),
    i = (a.length - 1) * p,
    l = Math.floor(i),
    h = Math.ceil(i);
  return a[l] + (a[h] - a[l]) * (i - l);
}
function returns(prices) {
  return prices
    .slice(1)
    .map((x, i) => (prices[i] > 0 ? x / prices[i] - 1 : 0))
    .filter(Number.isFinite);
}
function historicalVarCvar(xs, confidence = 0.95) {
  if (!xs.length) return { var: 0, cvar: 0, observations: 0 };
  const losses = xs.map((x) => -x),
    value = Math.max(0, percentile(losses, confidence)),
    tail = losses.filter((x) => x >= value);
  return {
    var: value,
    cvar: Math.max(value, mean(tail)),
    observations: xs.length,
  };
}
function ewmaVolatility(xs, lambda = 0.94, periods = PERIODS_PER_YEAR.daily) {
  if (!xs.length) return 0;
  let variance = xs[0] ** 2;
  for (const r of xs.slice(1))
    variance = lambda * variance + (1 - lambda) * r * r;
  return Math.sqrt(variance * periods);
}
function fractionalKelly({ winRate = 0.5, payoff = 1, fraction = 0.25 } = {}) {
  if (payoff <= 0) return 0;
  return Math.max(0, (winRate - (1 - winRate) / payoff) * fraction);
}
function correlation(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 3) return 0;
  const x = a.slice(-n),
    y = b.slice(-n),
    mx = mean(x),
    my = mean(y),
    cov = mean(x.map((v, i) => (v - mx) * (y[i] - my))),
    sx = Math.sqrt(mean(x.map((v) => (v - mx) ** 2))),
    sy = Math.sqrt(mean(y.map((v) => (v - my) ** 2)));
  return sx && sy ? cov / (sx * sy) : 0;
}
function stressLoss(
  exposures,
  scenarios = { marketCrash: -0.2, liquidityShock: -0.08, venueFailure: -0.12 },
) {
  const gross = Object.values(exposures || {}).reduce(
      (a, x) => a + Math.abs(Number(x) || 0),
      0,
    ),
    rows = Object.entries(scenarios).map(([name, shock]) => ({
      name,
      shock,
      loss: gross * Math.abs(shock),
    }));
  return {
    worst: rows.reduce((a, x) => Math.max(a, x.loss), 0),
    scenarios: rows,
  };
}
module.exports = {
  mean,
  percentile,
  returns,
  historicalVarCvar,
  ewmaVolatility,
  fractionalKelly,
  correlation,
  stressLoss,
};
