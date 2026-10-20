"use strict";

function finite(values, name) {
  if (!Array.isArray(values) || values.some((value) => !Number.isFinite(value)))
    throw new TypeError(`${name}-must-be-finite`);
  return values.map(Number);
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / (values.length || 1);
}

function standardDeviation(values) {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
      (values.length - 1),
  );
}

function quantile(sorted, probability) {
  const index = (sorted.length - 1) * probability,
    low = Math.floor(index),
    high = Math.ceil(index);
  return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
}

function populationStabilityIndex(referenceInput, currentInput, bins = 10) {
  const reference = finite(referenceInput, "reference"),
    current = finite(currentInput, "current");
  if (reference.length < bins || current.length < bins)
    return { available: false, reason: "insufficient-drift-observations" };
  const sorted = [...reference].sort((a, b) => a - b),
    boundaries = Array.from({ length: bins - 1 }, (_, index) =>
      quantile(sorted, (index + 1) / bins),
    ),
    bucket = (value) => boundaries.findIndex((boundary) => value <= boundary),
    referenceCounts = Array(bins).fill(0),
    currentCounts = Array(bins).fill(0);
  for (const value of reference) {
    const index = bucket(value);
    referenceCounts[index < 0 ? bins - 1 : index]++;
  }
  for (const value of current) {
    const index = bucket(value);
    currentCounts[index < 0 ? bins - 1 : index]++;
  }
  const epsilon = 1e-6,
    contributions = referenceCounts.map((count, index) => {
      const expected = Math.max(epsilon, count / reference.length),
        actual = Math.max(epsilon, currentCounts[index] / current.length);
      return (actual - expected) * Math.log(actual / expected);
    });
  return {
    available: true,
    value: contributions.reduce((sum, value) => sum + value, 0),
    bins,
    boundaries,
    contributions,
  };
}

function kolmogorovSmirnov(referenceInput, currentInput) {
  const reference = finite(referenceInput, "reference").sort((a, b) => a - b),
    current = finite(currentInput, "current").sort((a, b) => a - b);
  if (!reference.length || !current.length)
    return { available: false, reason: "insufficient-drift-observations" };
  const values = [...new Set([...reference, ...current])].sort((a, b) => a - b);
  let referenceIndex = 0,
    currentIndex = 0,
    statistic = 0;
  for (const value of values) {
    while (reference[referenceIndex] <= value) referenceIndex++;
    while (current[currentIndex] <= value) currentIndex++;
    statistic = Math.max(
      statistic,
      Math.abs(
        referenceIndex / reference.length - currentIndex / current.length,
      ),
    );
  }
  if (statistic === 0) return { available: true, statistic: 0, pValue: 1 };
  const effective =
      (reference.length * current.length) / (reference.length + current.length),
    scaled =
      (Math.sqrt(effective) + 0.12 + 0.11 / Math.sqrt(effective)) * statistic,
    pValue = Math.max(
      0,
      Math.min(
        1,
        2 *
          Array.from({ length: 100 }, (_, index) => index + 1).reduce(
            (sum, k) =>
              sum + (-1) ** (k - 1) * Math.exp(-2 * k * k * scaled * scaled),
            0,
          ),
      ),
    );
  return { available: true, statistic, pValue };
}

function driftReport(referenceInput, currentInput, policy = {}) {
  const reference = finite(referenceInput, "reference"),
    current = finite(currentInput, "current"),
    psi = populationStabilityIndex(reference, current, policy.bins || 10),
    ks = kolmogorovSmirnov(reference, current),
    scale = standardDeviation(reference),
    standardizedMeanShift = scale
      ? Math.abs(mean(current) - mean(reference)) / scale
      : mean(current) === mean(reference)
        ? 0
        : Number.POSITIVE_INFINITY,
    thresholds = {
      maxPsi: Number(policy.maxPsi ?? 0.1),
      minKsPValue: Number(policy.minKsPValue ?? 0.05),
      maxStandardizedMeanShift: Number(policy.maxStandardizedMeanShift ?? 0.5),
    },
    checks = {
      psi: psi.available && psi.value <= thresholds.maxPsi,
      ks: ks.available && ks.pValue >= thresholds.minKsPValue,
      meanShift: standardizedMeanShift <= thresholds.maxStandardizedMeanShift,
    };
  return {
    referenceObservations: reference.length,
    currentObservations: current.length,
    psi,
    ks,
    standardizedMeanShift,
    thresholds,
    checks,
    drifted: Object.values(checks).some((passed) => !passed),
  };
}

module.exports = {
  mean,
  standardDeviation,
  populationStabilityIndex,
  kolmogorovSmirnov,
  driftReport,
};
