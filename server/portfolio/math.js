"use strict";
const { PERIODS_PER_YEAR } = require("../config/annualization.js");

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
function identity(n) {
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  );
}
function symmetrize(matrix) {
  return matrix.map((row, i) =>
    row.map((value, j) => (Number(value) + Number(matrix[j][i])) / 2),
  );
}
function jacobiEigen(matrix, tolerance = 1e-14) {
  const n = matrix.length,
    values = symmetrize(matrix).map((row) => [...row]),
    vectors = identity(n),
    iterations = Math.max(1, 100 * n * n);
  for (let iteration = 0; iteration < iterations; iteration++) {
    let p = 0,
      q = 0,
      largest = 0;
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        if (Math.abs(values[i][j]) > largest) {
          largest = Math.abs(values[i][j]);
          p = i;
          q = j;
        }
    if (largest <= tolerance) break;
    const angle =
        0.5 * Math.atan2(2 * values[p][q], values[q][q] - values[p][p]),
      cosine = Math.cos(angle),
      sine = Math.sin(angle),
      app = values[p][p],
      aqq = values[q][q],
      apq = values[p][q];
    values[p][p] =
      cosine * cosine * app - 2 * sine * cosine * apq + sine * sine * aqq;
    values[q][q] =
      sine * sine * app + 2 * sine * cosine * apq + cosine * cosine * aqq;
    values[p][q] = 0;
    values[q][p] = 0;
    for (let k = 0; k < n; k++) {
      if (k !== p && k !== q) {
        const akp = values[k][p],
          akq = values[k][q];
        values[k][p] = cosine * akp - sine * akq;
        values[p][k] = values[k][p];
        values[k][q] = sine * akp + cosine * akq;
        values[q][k] = values[k][q];
      }
      const vkp = vectors[k][p],
        vkq = vectors[k][q];
      vectors[k][p] = cosine * vkp - sine * vkq;
      vectors[k][q] = sine * vkp + cosine * vkq;
    }
  }
  return { values: values.map((row, i) => row[i]), vectors };
}
function reconstructEigen(values, vectors) {
  const n = values.length;
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) =>
      values.reduce(
        (sum, eigenvalue, k) =>
          sum + vectors[i][k] * eigenvalue * vectors[j][k],
        0,
      ),
    ),
  );
}
function nearestPsd(matrix, floor = null) {
  if (!matrix.length) return { matrix: [], eigenvalues: [], floor: 0 };
  const trace = matrix.reduce((sum, row, i) => sum + row[i], 0),
    eigen = jacobiEigen(matrix),
    minimum = floor ?? Math.max(1e-16, Math.abs(trace) * 1e-12),
    clamped = eigen.values.map((value) => Math.max(minimum, value)),
    projected = symmetrize(reconstructEigen(clamped, eigen.vectors));
  return { matrix: projected, eigenvalues: clamped, floor: minimum };
}
function oasCovariance(series) {
  const sample = covarianceMatrix(series),
    p = sample.length,
    observations = p ? Math.min(...series.map((row) => row.length)) : 0;
  if (!p) return { covariance: [], sample, shrinkage: 0, targetVariance: 0 };
  const trace = sample.reduce((sum, row, i) => sum + row[i], 0),
    traceSquared = sample.reduce(
      (sum, row) =>
        sum + row.reduce((inner, value) => inner + value * value, 0),
      0,
    ),
    targetVariance = trace / p,
    numerator = (1 - 2 / p) * traceSquared + trace * trace,
    denominator =
      (observations + 1 - 2 / p) *
      Math.max(0, traceSquared - (trace * trace) / p),
    shrinkage =
      p === 1 || denominator <= 0
        ? 1
        : Math.max(0, Math.min(1, numerator / denominator)),
    shrunk = sample.map((row, i) =>
      row.map(
        (value, j) =>
          (1 - shrinkage) * value + shrinkage * (i === j ? targetVariance : 0),
      ),
    ),
    psd = nearestPsd(shrunk);
  return {
    covariance: psd.matrix,
    sample,
    shrinkage,
    targetVariance,
    observations,
    eigenvalues: psd.eigenvalues,
    eigenvalueFloor: psd.floor,
  };
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
  const cov = oasCovariance(series).covariance,
    vols = cov.map((row, i) => Math.sqrt(Math.max(1e-16, row[i][i])));
  let weights = normalizeCapped(
    vols.map((volatility) => 1 / volatility),
    caps,
    budget,
  );
  for (let iteration = 0; iteration < 500; iteration++) {
    const marginal = weights.map((_, i) =>
        weights.reduce((sum, weight, j) => sum + weight * cov[i][j], 0),
      ),
      variance = portfolioVariance(weights, cov),
      active = weights.filter((weight) => weight > 1e-12).length || 1,
      target = variance / active,
      adjusted = weights.map((weight, i) =>
        weight > 0
          ? weight * Math.sqrt(target / Math.max(1e-20, weight * marginal[i]))
          : 0,
      ),
      next = normalizeCapped(adjusted, caps, budget),
      change = Math.max(
        ...next.map((weight, i) => Math.abs(weight - weights[i])),
      );
    weights = next;
    if (change < 1e-12) break;
  }
  return weights;
}
function meanVariance(series, caps, { riskAversion = 6, budget = 0.85 } = {}) {
  const cov = oasCovariance(series).covariance,
    mu = series.map(mean),
    largestVariance = Math.max(1e-16, ...cov.map((row, i) => row[i])),
    step = 0.05 / (riskAversion * largestVariance);
  let weights = normalizeCapped(
    mu.map((value, i) => Math.max(0, value) / Math.max(1e-16, cov[i][i])),
    caps,
    budget,
  );
  for (let iteration = 0; iteration < 500; iteration++) {
    const gradient = weights.map(
        (_, i) =>
          mu[i] -
          riskAversion *
            weights.reduce((sum, weight, j) => sum + cov[i][j] * weight, 0),
      ),
      next = normalizeCapped(
        weights.map((weight, i) => Math.max(0, weight + step * gradient[i])),
        caps,
        budget,
      ),
      change = Math.max(
        ...next.map((weight, i) => Math.abs(weight - weights[i])),
      );
    weights = next;
    if (change < 1e-12) break;
  }
  return weights;
}
function portfolioVariance(weights, cov) {
  let v = 0;
  for (let i = 0; i < weights.length; i++)
    for (let j = 0; j < weights.length; j++)
      v += weights[i] * weights[j] * cov[i][j];
  return Math.max(0, v);
}
function inverseNormalCdf(probability) {
  if (!(probability > 0 && probability < 1))
    throw new RangeError("probability-must-be-between-zero-and-one");
  const a = [
      -39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269,
      -30.6647980661472, 2.50662827745924,
    ],
    b = [
      -54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197,
      -13.2806815528857,
    ],
    c = [
      -0.00778489400243029, -0.322396458041136, -2.40075827716184,
      -2.54973253934373, 4.37466414146497, 2.93816398269878,
    ],
    d = [
      0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742,
    ],
    low = 0.02425,
    high = 1 - low;
  if (probability < low) {
    const q = Math.sqrt(-2 * Math.log(probability));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (probability > high) return -inverseNormalCdf(1 - probability);
  const q = probability - 0.5,
    r = q * q;
  return (
    ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) *
      q) /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
  );
}
function concentration(weights, labels = []) {
  const gross = weights.reduce((sum, weight) => sum + Math.abs(weight), 0),
    totals = {};
  weights.forEach((weight, index) => {
    const label = String(labels[index] || `asset-${index}`);
    totals[label] = (totals[label] || 0) + Math.abs(weight);
  });
  const shares = Object.fromEntries(
      Object.entries(totals).map(([label, value]) => [
        label,
        gross ? value / gross : 0,
      ]),
    ),
    hhi = Object.values(shares).reduce((sum, share) => sum + share * share, 0);
  return {
    gross,
    weights: totals,
    shares,
    hhi,
    effectiveFactors: hhi ? 1 / hhi : 0,
    largestShare: Math.max(0, ...Object.values(shares)),
  };
}
function diagnostics(
  weights,
  series,
  periods = PERIODS_PER_YEAR.hourly,
  options = {},
) {
  const estimate = oasCovariance(series),
    cov = estimate.covariance,
    variance = portfolioVariance(weights, cov),
    vol = Math.sqrt(variance),
    assetVol = series.map((_, i) => Math.sqrt(Math.max(0, cov[i][i]))),
    marginal = weights.map((_, i) =>
      weights.reduce((s, w, j) => s + w * cov[i][j], 0),
    ),
    contributions = weights.map((w, i) =>
      variance ? (w * marginal[i]) / variance : 0,
    ),
    confidence = Number(options.confidence ?? 0.95),
    zScore = inverseNormalCdf(confidence),
    valueAtRisk = zScore * vol,
    marginalVaR = marginal.map((value) => (vol ? (zScore * value) / vol : 0)),
    componentVaR = weights.map((weight, i) => weight * marginalVaR[i]),
    diversificationRatio = vol
      ? weights.reduce((s, w, i) => s + w * assetVol[i], 0) / vol
      : 0;
  return {
    periodVolatility: vol,
    annualVolatility: vol * Math.sqrt(periods),
    annualizationPeriods: periods,
    diversificationRatio,
    riskContributions: contributions,
    marginalVaR,
    componentVaR,
    valueAtRisk,
    confidence,
    zScore,
    covariance: cov,
    sampleCovariance: estimate.sample,
    covarianceEstimator: "oas+psd",
    shrinkage: estimate.shrinkage,
    covarianceObservations: estimate.observations,
    eigenvalues: estimate.eigenvalues,
    eigenvalueFloor: estimate.eigenvalueFloor,
    factorConcentration: concentration(weights, options.factorLabels),
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
  identity,
  symmetrize,
  jacobiEigen,
  nearestPsd,
  oasCovariance,
  normalizeCapped,
  riskParity,
  meanVariance,
  portfolioVariance,
  inverseNormalCdf,
  concentration,
  diagnostics,
  rebalance,
};
