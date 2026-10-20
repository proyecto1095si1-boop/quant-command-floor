"use strict";

const { mean, percentile } = require("./math.js");

const EPSILON = 1e-12;

function finiteSeries(values) {
  if (!Array.isArray(values) || values.some((value) => !Number.isFinite(value)))
    throw new TypeError("returns-must-be-finite");
  return values.map(Number);
}

function validateProbability(value, name) {
  if (!(value > 0 && value < 1))
    throw new RangeError(`${name}-must-be-between-zero-and-one`);
}

function tailEstimate(losses, confidence) {
  const valueAtRisk = Math.max(0, percentile(losses, confidence)),
    tail = losses.filter((loss) => loss >= valueAtRisk);
  return {
    valueAtRisk,
    expectedShortfall: Math.max(valueAtRisk, mean(tail)),
  };
}

function sampleVariance(values) {
  if (values.length < 2) return 0;
  const average = mean(values);
  return (
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
    (values.length - 1)
  );
}

function filteredHistoricalSimulation(
  values,
  { confidence = 0.99, lambda = 0.94, minimumObservations = 30 } = {},
) {
  const returns = finiteSeries(values);
  validateProbability(confidence, "confidence");
  validateProbability(lambda, "lambda");
  if (returns.length < minimumObservations)
    return {
      available: false,
      reason: "insufficient-observations",
      observations: returns.length,
      minimumObservations,
    };

  let variance = Math.max(EPSILON, sampleVariance(returns.slice(0, 20)));
  const residuals = [];
  for (const value of returns) {
    residuals.push(value / Math.sqrt(variance));
    variance = lambda * variance + (1 - lambda) * value * value;
  }
  const forecastVolatility = Math.sqrt(variance),
    scenarios = residuals.map((residual) => residual * forecastVolatility),
    estimate = tailEstimate(
      scenarios.map((value) => -value),
      confidence,
    );
  return {
    available: true,
    model: "filtered-historical-simulation",
    confidence,
    lambda,
    observations: returns.length,
    forecastVolatility,
    scenarios,
    ...estimate,
  };
}

function peaksOverThreshold(
  values,
  { confidence = 0.99, thresholdQuantile = 0.9, minimumExceedances = 10 } = {},
) {
  const returns = finiteSeries(values);
  validateProbability(confidence, "confidence");
  validateProbability(thresholdQuantile, "threshold-quantile");
  if (confidence <= thresholdQuantile)
    throw new RangeError("confidence-must-exceed-threshold-quantile");
  const losses = returns.map((value) => -value),
    threshold = percentile(losses, thresholdQuantile),
    excesses = losses
      .filter((loss) => loss > threshold)
      .map((loss) => loss - threshold);
  if (excesses.length < minimumExceedances)
    return {
      available: false,
      reason: "insufficient-exceedances",
      observations: returns.length,
      exceedances: excesses.length,
      minimumExceedances,
      threshold,
      thresholdQuantile,
    };

  const excessMean = mean(excesses),
    excessVariance = sampleVariance(excesses);
  if (!(excessMean > 0) || !(excessVariance > 0))
    return {
      available: false,
      reason: "degenerate-exceedances",
      observations: returns.length,
      exceedances: excesses.length,
      threshold,
      thresholdQuantile,
    };

  // Method-of-moments GPD fit. The cap keeps ES finite and makes the
  // estimator explicit when a very small sample implies an explosive tail.
  const rawShape = 0.5 * (1 - (excessMean * excessMean) / excessVariance),
    shape = Math.max(-0.49, Math.min(0.95, rawShape)),
    scale = Math.max(EPSILON, excessMean * (1 - shape)),
    tailProbability = excesses.length / returns.length,
    ratio = tailProbability / (1 - confidence),
    valueAtRisk =
      Math.abs(shape) < 1e-8
        ? threshold + scale * Math.log(ratio)
        : threshold + (scale / shape) * (ratio ** shape - 1),
    expectedShortfall = (valueAtRisk + scale - shape * threshold) / (1 - shape);
  return {
    available: true,
    model: "evt-pot-gpd-moments",
    confidence,
    thresholdQuantile,
    threshold,
    observations: returns.length,
    exceedances: excesses.length,
    shape,
    rawShape,
    scale,
    valueAtRisk: Math.max(0, valueAtRisk),
    expectedShortfall: Math.max(valueAtRisk, expectedShortfall),
  };
}

function xLogY(x, y) {
  return x === 0 ? 0 : x * Math.log(y);
}

function erf(value) {
  const sign = value < 0 ? -1 : 1,
    x = Math.abs(value),
    t = 1 / (1 + 0.3275911 * x),
    approximation =
      1 -
      ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
        t +
        0.254829592) *
        t *
        Math.exp(-x * x);
  return sign * approximation;
}

function kupiecTest(exceptions, expectedRate) {
  validateProbability(expectedRate, "expected-rate");
  const observations = exceptions.length,
    count = exceptions.filter(Boolean).length;
  if (!observations)
    return { available: false, reason: "no-observations", observations: 0 };
  const observedRate = count / observations,
    nullLogLikelihood =
      xLogY(count, expectedRate) +
      xLogY(observations - count, 1 - expectedRate),
    fittedLogLikelihood =
      xLogY(count, observedRate) +
      xLogY(observations - count, 1 - observedRate),
    statistic = Math.max(0, 2 * (fittedLogLikelihood - nullLogLikelihood)),
    pValue = 1 - erf(Math.sqrt(statistic / 2));
  return {
    available: true,
    test: "kupiec-unconditional-coverage",
    observations,
    exceptions: count,
    expectedRate,
    observedRate,
    statistic,
    degreesOfFreedom: 1,
    pValue,
    rejectAt5Percent: pValue < 0.05,
  };
}

function christoffersenTest(exceptions) {
  if (exceptions.length < 2)
    return {
      available: false,
      reason: "insufficient-transitions",
      observations: exceptions.length,
    };
  const transitions = { n00: 0, n01: 0, n10: 0, n11: 0 };
  for (let index = 1; index < exceptions.length; index++) {
    const previous = exceptions[index - 1] ? 1 : 0,
      current = exceptions[index] ? 1 : 0;
    transitions[`n${previous}${current}`]++;
  }
  const { n00, n01, n10, n11 } = transitions,
    probability = (n01 + n11) / (n00 + n01 + n10 + n11),
    probability01 = n01 / (n00 + n01 || 1),
    probability11 = n11 / (n10 + n11 || 1),
    independentLogLikelihood =
      xLogY(n01 + n11, probability) + xLogY(n00 + n10, 1 - probability),
    markovLogLikelihood =
      xLogY(n01, probability01) +
      xLogY(n00, 1 - probability01) +
      xLogY(n11, probability11) +
      xLogY(n10, 1 - probability11),
    statistic = Math.max(
      0,
      2 * (markovLogLikelihood - independentLogLikelihood),
    ),
    pValue = 1 - erf(Math.sqrt(statistic / 2));
  return {
    available: true,
    test: "christoffersen-independence",
    observations: exceptions.length,
    transitions,
    probability01,
    probability11,
    statistic,
    degreesOfFreedom: 1,
    pValue,
    rejectAt5Percent: pValue < 0.05,
  };
}

function binomialCdf(count, observations, probability) {
  let term = (1 - probability) ** observations,
    total = term;
  for (let index = 1; index <= count; index++) {
    term *=
      ((observations - index + 1) / index) * (probability / (1 - probability));
    total += term;
  }
  return Math.min(1, total);
}

function firstBinomialQuantile(level, observations, probability) {
  for (let count = 0; count <= observations; count++)
    if (binomialCdf(count, observations, probability) >= level) return count;
  return observations;
}

function trafficLight(count, observations, expectedRate) {
  if (!observations)
    return { zone: "insufficient", greenMaximum: 0, redMinimum: 0 };
  const yellowMinimum = firstBinomialQuantile(0.95, observations, expectedRate),
    redMinimum = firstBinomialQuantile(0.9999, observations, expectedRate);
  return {
    zone:
      count < yellowMinimum ? "green" : count < redMinimum ? "yellow" : "red",
    greenMaximum: yellowMinimum - 1,
    yellowMinimum,
    redMinimum,
  };
}

function exceptionBacktest(losses, forecasts, { confidence = 0.99 } = {}) {
  validateProbability(confidence, "confidence");
  if (losses.length !== forecasts.length)
    throw new RangeError("losses-and-forecasts-length-mismatch");
  const exceptions = losses.map((loss, index) => loss > forecasts[index]),
    expectedRate = 1 - confidence,
    kupiec = kupiecTest(exceptions, expectedRate),
    christoffersen = christoffersenTest(exceptions),
    conditionalStatistic =
      kupiec.available && christoffersen.available
        ? kupiec.statistic + christoffersen.statistic
        : null,
    conditionalPValue =
      conditionalStatistic === null
        ? null
        : Math.exp(-conditionalStatistic / 2);
  return {
    observations: losses.length,
    exceptions: exceptions.filter(Boolean).length,
    expectedRate,
    sequence: exceptions,
    kupiec,
    christoffersen,
    conditionalCoverage:
      conditionalStatistic === null
        ? { available: false }
        : {
            available: true,
            test: "christoffersen-conditional-coverage",
            statistic: conditionalStatistic,
            degreesOfFreedom: 2,
            pValue: conditionalPValue,
            rejectAt5Percent: conditionalPValue < 0.05,
          },
    trafficLight: trafficLight(
      exceptions.filter(Boolean).length,
      losses.length,
      expectedRate,
    ),
  };
}

function rollingFhsBacktest(
  values,
  { confidence = 0.99, window = 100, lambda = 0.94 } = {},
) {
  const returns = finiteSeries(values);
  if (window < 30 || returns.length <= window)
    return {
      available: false,
      reason: "insufficient-out-of-sample-observations",
      observations: Math.max(0, returns.length - window),
      window,
    };
  const losses = [],
    forecasts = [];
  for (let index = window; index < returns.length; index++) {
    const forecast = filteredHistoricalSimulation(
      returns.slice(index - window, index),
      { confidence, lambda },
    );
    losses.push(-returns[index]);
    forecasts.push(forecast.valueAtRisk);
  }
  const result = exceptionBacktest(losses, forecasts, { confidence });
  return {
    available: true,
    model: "rolling-filtered-historical-simulation",
    window,
    ...result,
  };
}

function tailRisk(values, options = {}) {
  const fhs = filteredHistoricalSimulation(values, options),
    evt = peaksOverThreshold(values, options),
    candidates = [fhs, evt].filter((estimate) => estimate.available),
    conservative = candidates.reduce(
      (selected, estimate) =>
        !selected || estimate.expectedShortfall > selected.expectedShortfall
          ? estimate
          : selected,
      null,
    );
  return {
    confidence: Number(options.confidence ?? 0.99),
    fhs,
    evt,
    conservative: conservative
      ? {
          model: conservative.model,
          valueAtRisk: conservative.valueAtRisk,
          expectedShortfall: conservative.expectedShortfall,
        }
      : null,
  };
}

module.exports = {
  filteredHistoricalSimulation,
  peaksOverThreshold,
  kupiecTest,
  christoffersenTest,
  trafficLight,
  exceptionBacktest,
  rollingFhsBacktest,
  tailRisk,
};
