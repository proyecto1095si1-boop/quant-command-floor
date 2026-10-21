"use strict";

const { fingerprint } = require("../governance/service.js"),
  {
    ConsensusEngine,
    DEFAULT_CORRELATIONS,
  } = require("../decision/consensus.js"),
  { DynamicCorrelationEstimator } = require("../decision/dependence.js");

const DEFAULT_GRID = {
    decay: [0.9, 0.94, 0.97],
    baseShrinkage: [0.1, 0.2, 0.35],
    minimumAbsoluteSignal: [0.15, 0.2],
    minimumDirectionalProbability: [0.55, 0.6],
  },
  DEFAULT_FOLDS = {
    minimumTrainingObservations: 30,
    testObservations: 10,
    purgeObservations: 2,
    embargoObservations: 2,
    minimumFolds: 2,
  };

const clampProbability = (value) => Math.max(1e-12, Math.min(1 - 1e-12, value));

function invalid(message) {
  throw Object.assign(new Error(message), { status: 422 });
}

function normalizeObservations(input) {
  if (!Array.isArray(input) || !input.length)
    invalid("calibration-observations-required");
  let previous = -Infinity;
  return input.map((row) => {
    const timestamp = Date.parse(row.timestamp),
      outcome = Number(row.outcome),
      regime = String(row.regime || "unclassified").trim();
    if (
      !Number.isFinite(timestamp) ||
      timestamp <= previous ||
      ![0, 1].includes(outcome) ||
      !regime ||
      !Array.isArray(row.signals) ||
      !row.signals.length
    )
      invalid("invalid-calibration-observation");
    previous = timestamp;
    return {
      timestamp: new Date(timestamp).toISOString(),
      asset: String(row.asset || "UNKNOWN").trim() || "UNKNOWN",
      regime,
      regimeProbability: Number.isFinite(Number(row.regimeProbability))
        ? Number(row.regimeProbability)
        : 1,
      outcome,
      signals: row.signals.map((signal) => ({
        agent: signal.agent,
        signal: signal.signal,
        confidence: signal.confidence,
      })),
    };
  });
}

function positiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) invalid(name);
  return number;
}

function walkForwardFolds(length, input = {}) {
  const policy = { ...DEFAULT_FOLDS, ...input },
    minimumTrainingObservations = positiveInteger(
      policy.minimumTrainingObservations,
      "invalid-calibration-training-window",
    ),
    testObservations = positiveInteger(
      policy.testObservations,
      "invalid-calibration-test-window",
    ),
    purgeObservations = positiveInteger(
      policy.purgeObservations,
      "invalid-calibration-purge",
    ),
    embargoObservations = positiveInteger(
      policy.embargoObservations,
      "invalid-calibration-embargo",
    ),
    minimumFolds = positiveInteger(
      policy.minimumFolds,
      "invalid-calibration-minimum-folds",
    );
  if (!minimumTrainingObservations || !testObservations || !minimumFolds)
    invalid("invalid-calibration-fold-policy");
  const folds = [];
  for (
    let testStart = minimumTrainingObservations + purgeObservations;
    testStart + testObservations <= length;
    testStart += testObservations + embargoObservations
  ) {
    const trainEnd = testStart - purgeObservations,
      testEnd = testStart + testObservations;
    folds.push({
      fold: folds.length,
      train: { start: 0, end: trainEnd - 1, observations: trainEnd },
      purge: {
        start: trainEnd,
        end: testStart - 1,
        observations: purgeObservations,
      },
      test: {
        start: testStart,
        end: testEnd - 1,
        observations: testObservations,
      },
      embargo: {
        start: testEnd,
        end: Math.min(length, testEnd + embargoObservations) - 1,
        observations: Math.min(embargoObservations, length - testEnd),
      },
    });
  }
  if (folds.length < minimumFolds) invalid("insufficient-calibration-folds");
  return folds;
}

function gridValues(grid, key, validate) {
  const values = grid[key];
  if (
    !Array.isArray(values) ||
    !values.length ||
    values.some((x) => !validate(Number(x)))
  )
    invalid("invalid-calibration-grid");
  return [...new Set(values.map(Number))].sort((left, right) => left - right);
}

function candidates(input = {}) {
  const grid = { ...DEFAULT_GRID, ...input },
    dimensions = [
      gridValues(grid, "decay", (x) => x > 0 && x < 1),
      gridValues(grid, "baseShrinkage", (x) => x >= 0 && x <= 1),
      gridValues(grid, "minimumAbsoluteSignal", (x) => x >= 0 && x <= 1),
      gridValues(
        grid,
        "minimumDirectionalProbability",
        (x) => x >= 0.5 && x <= 1,
      ),
    ],
    count = dimensions.reduce((product, values) => product * values.length, 1);
  if (count > 128) invalid("calibration-grid-too-large");
  const output = [];
  for (const decay of dimensions[0])
    for (const baseShrinkage of dimensions[1])
      for (const minimumAbsoluteSignal of dimensions[2])
        for (const minimumDirectionalProbability of dimensions[3])
          output.push({
            dependence: { decay, baseShrinkage },
            consensus: {
              minimumAbsoluteSignal,
              minimumDirectionalProbability,
            },
          });
  return output;
}

function metrics(rows, bins = 10) {
  const logLoss =
      rows.reduce(
        (sum, row) =>
          sum -
          (row.outcome * Math.log(clampProbability(row.probability)) +
            (1 - row.outcome) *
              Math.log(clampProbability(1 - row.probability))),
        0,
      ) / rows.length,
    brier =
      rows.reduce((sum, row) => sum + (row.probability - row.outcome) ** 2, 0) /
      rows.length,
    active = rows.filter((row) => !row.abstained),
    accuracy = active.length
      ? active.filter((row) => (row.action === "LONG" ? 1 : 0) === row.outcome)
          .length / active.length
      : 0;
  let ece = 0;
  for (let bin = 0; bin < bins; bin++) {
    const low = bin / bins,
      high = (bin + 1) / bins,
      group = rows.filter(
        (row) =>
          row.probability >= low &&
          (bin === bins - 1 ? row.probability <= high : row.probability < high),
      );
    if (!group.length) continue;
    const predicted =
        group.reduce((sum, row) => sum + row.probability, 0) / group.length,
      observed =
        group.reduce((sum, row) => sum + row.outcome, 0) / group.length;
    ece += (group.length / rows.length) * Math.abs(predicted - observed);
  }
  return {
    observations: rows.length,
    logLoss,
    brier,
    ece,
    abstentionRate: 1 - active.length / rows.length,
    actionCoverage: active.length / rows.length,
    directionalAccuracy: accuracy,
  };
}

function evaluateCandidate(observations, folds, candidate, options) {
  const rows = [];
  for (const fold of folds) {
    const dependence = new DynamicCorrelationEstimator({
        ...options.dependencePolicy,
        ...candidate.dependence,
      }),
      consensus = new ConsensusEngine({
        correlations: options.staticCorrelations,
        policy: { ...options.consensusPolicy, ...candidate.consensus },
      });
    for (let index = fold.train.start; index <= fold.train.end; index++)
      dependence.observe(observations[index].signals);
    for (let index = fold.test.start; index <= fold.test.end; index++) {
      const observation = observations[index],
        dynamic = dependence.current(options.staticCorrelations),
        result = consensus.combine(observation.signals, {
          correlations: dynamic.correlations,
          regime: {
            regime: observation.regime,
            probability: observation.regimeProbability,
          },
        });
      rows.push({
        fold: fold.fold,
        timestamp: observation.timestamp,
        regime: observation.regime,
        outcome: observation.outcome,
        probability: result.posterior,
        action: result.action,
        abstained: result.abstained,
        dependenceSource: dynamic.source,
      });
      dependence.observe(observation.signals);
    }
  }
  const overall = metrics(rows),
    regimes = Object.fromEntries(
      [...new Set(rows.map((row) => row.regime))]
        .sort()
        .map((regime) => [
          regime,
          metrics(rows.filter((row) => row.regime === regime)),
        ]),
    ),
    regimeLosses = Object.values(regimes).map((entry) => entry.logLoss),
    worstRegimeLogLoss = Math.max(...regimeLosses),
    meanRegimeLogLoss =
      regimeLosses.reduce((sum, value) => sum + value, 0) / regimeLosses.length,
    regimeDispersion = Math.sqrt(
      regimeLosses.reduce(
        (sum, value) => sum + (value - meanRegimeLogLoss) ** 2,
        0,
      ) / regimeLosses.length,
    ),
    objective =
      overall.logLoss +
      worstRegimeLogLoss +
      0.25 * regimeDispersion +
      0.5 * overall.ece +
      0.1 * overall.abstentionRate;
  return {
    id: fingerprint(candidate),
    parameters: candidate,
    objective,
    overall,
    robustness: { worstRegimeLogLoss, meanRegimeLogLoss, regimeDispersion },
    regimes,
    folds: folds.map((fold) => ({
      fold: fold.fold,
      metrics: metrics(rows.filter((row) => row.fold === fold.fold)),
    })),
  };
}

function calibrateConsensus(input = {}) {
  const observations = normalizeObservations(input.observations),
    folds = walkForwardFolds(observations.length, input.folds),
    grid = candidates(input.grid),
    options = {
      dependencePolicy: {
        minimumObservations: 10,
        ...input.dependencePolicy,
      },
      consensusPolicy: input.consensusPolicy || {},
      staticCorrelations: input.staticCorrelations || DEFAULT_CORRELATIONS,
    },
    regimes = new Set(observations.map((row) => row.regime));
  if (regimes.size < 2) invalid("calibration-requires-multiple-regimes");
  const ranking = grid
      .map((candidate) =>
        evaluateCandidate(observations, folds, candidate, options),
      )
      .sort(
        (left, right) =>
          left.objective - right.objective || left.id.localeCompare(right.id),
      ),
    best = ranking[0],
    dataset = {
      observations: observations.length,
      firstTimestamp: observations[0].timestamp,
      lastTimestamp: observations.at(-1).timestamp,
      regimes: [...regimes].sort(),
      hash: fingerprint(observations),
    };
  return {
    paperOnly: true,
    method: "purged-embargoed-walk-forward-v1",
    dataset,
    folds,
    search: {
      candidates: ranking.length,
      objective:
        "mean-log-loss + worst-regime-log-loss + 0.25*regime-dispersion + 0.5*ECE + 0.1*abstention-rate",
      ranking,
    },
    recommendation: {
      candidateId: best.id,
      parameters: best.parameters,
      objective: best.objective,
      autoApply: false,
      requiresHumanApproval: true,
      state: "research-only",
    },
    reproducibilityHash: fingerprint({ dataset, folds, ranking }),
  };
}

module.exports = {
  DEFAULT_FOLDS,
  DEFAULT_GRID,
  calibrateConsensus,
  candidates,
  metrics,
  normalizeObservations,
  walkForwardFolds,
};
