"use strict";

function invalid(message) {
  throw Object.assign(new Error(message), { status: 422 });
}

function clampProbability(value, floor) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1)
    invalid("invalid-sequential-probability");
  return Math.max(floor, Math.min(1 - floor, number));
}

function logLoss(probability, outcome) {
  return -(
    outcome * Math.log(probability) +
    (1 - outcome) * Math.log(1 - probability)
  );
}

function neweyWest(values, margin = 0) {
  const observations = values.length;
  if (!observations)
    return { observations: 0, mean: 0, lag: 0, standardError: 0, statistic: 0 };
  const mean = values.reduce((sum, value) => sum + value, 0) / observations,
    centered = values.map((value) => value - mean),
    lag = Math.min(observations - 1, Math.floor(observations ** (1 / 3))),
    gamma = (offset) =>
      centered
        .slice(offset)
        .reduce((sum, value, index) => sum + value * centered[index], 0) /
      observations;
  let longRunVariance = gamma(0);
  for (let offset = 1; offset <= lag; offset++)
    longRunVariance += 2 * (1 - offset / (lag + 1)) * gamma(offset);
  const standardError = Math.sqrt(Math.max(0, longRunVariance) / observations),
    difference = mean - margin,
    statistic = standardError
      ? difference / standardError
      : difference > 0
        ? Number.MAX_VALUE
        : difference < 0
          ? -Number.MAX_VALUE
          : 0;
  return { observations, mean, lag, standardError, statistic };
}

function eProcess(values, { margin, bound, bettingFraction }) {
  const lambda = bettingFraction / bound,
    logEValue = values.reduce(
      (sum, value) =>
        sum + lambda * (value - margin) - 0.5 * lambda * lambda * bound * bound,
      0,
    );
  return {
    lambda,
    logEValue,
    eValue: Math.exp(Math.min(700, logEValue)),
  };
}

function summarizeForecasts(rows, policy) {
  const differences = rows.map((row) => row.lossDifference),
    overall = {
      ...neweyWest(differences, policy.degradationMargin),
      ...eProcess(differences, {
        margin: policy.degradationMargin,
        bound: policy.lossBound,
        bettingFraction: policy.bettingFraction,
      }),
    },
    regimes = Object.fromEntries(
      [...new Set(rows.map((row) => row.regime))].sort().map((regime) => {
        const values = rows
          .filter((row) => row.regime === regime)
          .map((row) => row.lossDifference);
        return [
          regime,
          {
            ...neweyWest(values, policy.degradationMargin),
            ...eProcess(values, {
              margin: policy.degradationMargin,
              bound: policy.lossBound,
              bettingFraction: policy.bettingFraction,
            }),
          },
        ];
      }),
    ),
    globalThreshold = 1 / policy.alpha,
    regimeThreshold = policy.maximumRegimes / policy.alpha,
    breaches = [];
  if (
    overall.observations >= policy.minimumObservations &&
    overall.eValue >= globalThreshold
  )
    breaches.push("sequential-log-loss-global");
  for (const [regime, result] of Object.entries(regimes))
    if (
      result.observations >= policy.minimumRegimeObservations &&
      result.eValue >= regimeThreshold
    )
      breaches.push(`sequential-log-loss-regime:${regime}`);
  return {
    method: "paired-log-loss-e-process-v1",
    assumptions: {
      null: `E[challengerLoss-championLoss] <= ${policy.degradationMargin}`,
      boundedLossDifference: policy.lossBound,
      alwaysValidThreshold: globalThreshold,
      regimeThreshold,
      regimeCorrection: "Bonferroni",
      neweyWestUse: "diagnostic-only",
    },
    overall,
    regimes,
    breaches,
  };
}

function cleanForecast(input, policy) {
  const outcome = Number(input.outcome),
    regime = String(input.regime || "unclassified").trim();
  if (![0, 1].includes(outcome) || !regime)
    invalid("invalid-sequential-outcome");
  const championProbability = clampProbability(
      input.championProbability,
      policy.probabilityFloor,
    ),
    challengerProbability = clampProbability(
      input.challengerProbability,
      policy.probabilityFloor,
    ),
    championLoss = logLoss(championProbability, outcome),
    challengerLoss = logLoss(challengerProbability, outcome);
  return {
    outcome,
    regime,
    championProbability,
    challengerProbability,
    championLoss,
    challengerLoss,
    lossDifference: challengerLoss - championLoss,
  };
}

module.exports = {
  cleanForecast,
  eProcess,
  logLoss,
  neweyWest,
  summarizeForecasts,
};
