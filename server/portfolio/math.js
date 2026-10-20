"use strict";
const mean = (x) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : 0);
function covariance(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const x = a.slice(-n),
    y = b.slice(-n),
    mx = mean(x),
    my = mean(y);
  return x.reduce((s, v, i) => s + (v - mx) * (y[i] - my), 0) / (n - 1);
}
function covarianceMatrix(series) {
  return series.map((a, i) => series.map((b, j) => covariance(a, b)));
}
function normalizeCapped(raw, caps, budget = 1) {
  const w = raw.map((x) => Math.max(0, x)),
    out = Array(w.length).fill(0);
  let remaining = budget,
    active = new Set(w.map((_, i) => i));
  for (let pass = 0; pass < w.length + 1 && active.size; pass++) {
    const total = [...active].reduce((s, i) => s + w[i], 0) || active.size;
    let capped = false;
    for (const i of [...active]) {
      const proposed =
        remaining *
        (total === active.size && w.every((x) => x === 0)
          ? 1 / active.size
          : w[i] / total);
      if (proposed > caps[i]) {
        out[i] = caps[i];
        remaining -= caps[i];
        active.delete(i);
        capped = true;
      }
    }
    if (!capped) {
      for (const i of active)
        out[i] =
          remaining *
          (total === active.size && w.every((x) => x === 0)
            ? 1 / active.size
            : w[i] / total);
      remaining = 0;
      break;
    }
  }
  return out;
}
function riskParity(series, caps, budget = 0.85) {
  const vols = series.map((x) => Math.sqrt(Math.max(1e-12, covariance(x, x)))),
    raw = vols.map((v) => 1 / v);
  return normalizeCapped(raw, caps, budget);
}
function meanVariance(series, caps, { riskAversion = 6, budget = 0.85 } = {}) {
  const cov = covarianceMatrix(series),
    mu = series.map(mean),
    raw = mu.map(
      (m, i) => Math.max(0, m) / (riskAversion * Math.max(1e-9, cov[i][i])),
    );
  return normalizeCapped(raw, caps, budget);
}
function portfolioVariance(weights, cov) {
  let v = 0;
  for (let i = 0; i < weights.length; i++)
    for (let j = 0; j < weights.length; j++)
      v += weights[i] * weights[j] * cov[i][j];
  return Math.max(0, v);
}
function diagnostics(weights, series, periods = 24 * 365) {
  const cov = covarianceMatrix(series),
    variance = portfolioVariance(weights, cov),
    vol = Math.sqrt(variance),
    assetVol = series.map((_, i) => Math.sqrt(Math.max(0, cov[i][i]))),
    marginal = weights.map((_, i) =>
      weights.reduce((s, w, j) => s + w * cov[i][j], 0),
    ),
    contributions = weights.map((w, i) =>
      variance ? (w * marginal[i]) / variance : 0,
    ),
    diversificationRatio = vol
      ? weights.reduce((s, w, i) => s + w * assetVol[i], 0) / vol
      : 0;
  return {
    periodVolatility: vol,
    annualVolatility: vol * Math.sqrt(periods),
    annualizationPeriods: periods,
    diversificationRatio,
    riskContributions: contributions,
    covariance: cov,
  };
}
function rebalance(current, target, { band = 0.02, maxTurnover = 0.2 } = {}) {
  let trades = target.map((w, i) =>
      Math.abs(w - (current[i] || 0)) >= band ? w - (current[i] || 0) : 0,
    ),
    turnover = trades.reduce((s, x) => s + Math.abs(x), 0) / 2,
    scale = turnover > maxTurnover ? maxTurnover / turnover : 1;
  trades = trades.map((x) => x * scale);
  return {
    trades,
    turnover: turnover * scale,
    rawTurnover: turnover,
    scaled: scale < 1,
    band,
    maxTurnover,
  };
}
module.exports = {
  mean,
  covariance,
  covarianceMatrix,
  normalizeCapped,
  riskParity,
  meanVariance,
  portfolioVariance,
  diagnostics,
  rebalance,
};
