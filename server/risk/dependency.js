"use strict";

const { percentile } = require("./math.js"),
  { covarianceMatrix, nearestPsd } = require("../portfolio/math.js");

function correlationMatrix(series) {
  const covariance = covarianceMatrix(series),
    volatility = covariance.map((row, index) =>
      Math.sqrt(Math.max(0, row[index])),
    );
  return covariance.map((row, i) =>
    row.map((value, j) =>
      volatility[i] && volatility[j]
        ? Math.max(-1, Math.min(1, value / (volatility[i] * volatility[j])))
        : i === j
          ? 1
          : 0,
    ),
  );
}

function conditionalSeries(series, predicate) {
  if (!series.length) return [];
  const observations = Math.min(...series.map((row) => row.length)),
    selected = Array.from({ length: series.length }, () => []);
  for (let index = 0; index < observations; index++) {
    const row = series.map((asset) => asset[index]);
    if (predicate(row))
      row.forEach((value, asset) => selected[asset].push(value));
  }
  return selected;
}

function solveLinear(matrix, vector) {
  const n = vector.length,
    augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < n; column++) {
    let pivot = column;
    for (let row = column + 1; row < n; row++)
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column]))
        pivot = row;
    [augmented[column], augmented[pivot]] = [
      augmented[pivot],
      augmented[column],
    ];
    const divisor = augmented[column][column];
    if (Math.abs(divisor) < 1e-15) continue;
    for (let index = column; index <= n; index++)
      augmented[column][index] /= divisor;
    for (let row = 0; row < n; row++) {
      if (row === column) continue;
      const multiplier = augmented[row][column];
      for (let index = column; index <= n; index++)
        augmented[row][index] -= multiplier * augmented[column][index];
    }
  }
  return augmented.map((row, index) =>
    Math.abs(row[index]) < 1e-15 ? 0 : row[n],
  );
}

function ridgeFactorLoadings(assetReturns, factorReturns, lambda = 1e-4) {
  if (!(lambda >= 0) || !Number.isFinite(lambda))
    throw new RangeError("invalid-ridge-penalty");
  const factors = Object.keys(factorReturns || {}),
    rows = factors.map((factor) => factorReturns[factor]),
    observations = Math.min(
      assetReturns.length,
      ...rows.map((row) => row.length),
    );
  if (!factors.length || observations < factors.length + 2)
    return { available: false, reason: "insufficient-factor-history" };
  const design = Array.from({ length: observations }, (_, observation) => [
      1,
      ...rows.map((row) => Number(row[observation])),
    ]),
    target = assetReturns.slice(0, observations).map(Number);
  if (
    target.some((value) => !Number.isFinite(value)) ||
    design.some((row) => row.some((value) => !Number.isFinite(value)))
  )
    throw new TypeError("factor-returns-must-be-finite");
  const columns = factors.length + 1,
    gram = Array.from({ length: columns }, (_, i) =>
      Array.from({ length: columns }, (_, j) =>
        design.reduce((sum, row) => sum + row[i] * row[j], 0),
      ),
    ),
    cross = Array.from({ length: columns }, (_, i) =>
      design.reduce(
        (sum, row, observation) => sum + row[i] * target[observation],
        0,
      ),
    );
  for (let index = 1; index < columns; index++) gram[index][index] += lambda;
  const coefficients = solveLinear(gram, cross),
    fitted = design.map((row) =>
      row.reduce((sum, value, index) => sum + value * coefficients[index], 0),
    ),
    average = target.reduce((sum, value) => sum + value, 0) / observations,
    residualSum = target.reduce(
      (sum, value, index) => sum + (value - fitted[index]) ** 2,
      0,
    ),
    totalSum = target.reduce((sum, value) => sum + (value - average) ** 2, 0);
  return {
    available: true,
    observations,
    lambda,
    intercept: coefficients[0],
    loadings: Object.fromEntries(
      factors.map((factor, index) => [factor, coefficients[index + 1]]),
    ),
    rSquared: totalSum ? 1 - residualSum / totalSum : 0,
  };
}

function normalizeCorrelation(matrix) {
  const scale = matrix.map((row, index) =>
    Math.sqrt(Math.max(1e-15, row[index])),
  );
  return matrix.map((row, i) =>
    row.map((value, j) => (i === j ? 1 : value / (scale[i] * scale[j]))),
  );
}

function stressCorrelation(series, tailQuantile = 0.1) {
  if (!series.length || series.some((row) => row.length < 3))
    return { available: false, reason: "insufficient-dependency-history" };
  const observations = Math.min(...series.map((row) => row.length)),
    market = Array.from(
      { length: observations },
      (_, index) =>
        series.reduce((sum, row) => sum + row[index], 0) / series.length,
    ),
    cutoff = percentile(market, tailQuantile),
    downside = conditionalSeries(
      series,
      (row) =>
        row.reduce((sum, value) => sum + value, 0) / row.length <= cutoff,
    );
  if (Math.min(...downside.map((row) => row.length)) < 3)
    return { available: false, reason: "insufficient-tail-observations" };
  const normal = correlationMatrix(series),
    tail = correlationMatrix(downside),
    conservative = normal.map((row, i) =>
      row.map((value, j) => {
        if (i === j) return 1;
        const adverse = Math.max(value, tail[i][j]);
        return adverse < 0 ? Math.min(0, adverse + 0.25) : adverse;
      }),
    ),
    projected = nearestPsd(conservative, 1e-10);
  return {
    available: true,
    observations,
    tailObservations: downside[0].length,
    tailQuantile,
    cutoff,
    normal,
    tail,
    stress: normalizeCorrelation(projected.matrix),
    eigenvalues: projected.eigenvalues,
  };
}

function lowerTailDependence(series, quantile = 0.1) {
  if (!series.length) return [];
  const thresholds = series.map((row) => percentile(row, quantile)),
    observations = Math.min(...series.map((row) => row.length));
  return series.map((_, i) =>
    series.map((__, j) => {
      let joint = 0,
        left = 0;
      for (let index = 0; index < observations; index++) {
        const inLeftTail = series[i][index] <= thresholds[i];
        if (inLeftTail) left++;
        if (inLeftTail && series[j][index] <= thresholds[j]) joint++;
      }
      return left ? joint / left : 0;
    }),
  );
}

module.exports = {
  correlationMatrix,
  ridgeFactorLoadings,
  stressCorrelation,
  lowerTailDependence,
};
