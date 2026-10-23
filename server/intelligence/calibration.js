"use strict";

const crypto = require("node:crypto");

const DEFAULT_FOLDS = {
    minimumTrainingObservations: 40,
    testObservations: 10,
    purgeObservations: 2,
    embargoObservations: 2,
    minimumFolds: 2,
  },
  DEFAULT_GRID = {
    weightSets: [
      { macro: 0.25, news: 0.35, market: 0.4 },
      { macro: 0.15, news: 0.25, market: 0.6 },
      { macro: 0.4, news: 0.3, market: 0.3 },
      { macro: 1 / 3, news: 1 / 3, market: 1 / 3 },
    ],
    dispersionPenalties: [1, 2, 3],
  };

const clampProbability = (value) => Math.max(1e-12, Math.min(1 - 1e-12, value)),
  fingerprint = (value) =>
    crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

function invalid(message) {
  throw Object.assign(new Error(message), { status: 422 });
}

function nonNegativeInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) invalid(name);
  return number;
}

function normalizeObservations(input, asOf = Date.now()) {
  if (!Array.isArray(input) || !input.length)
    invalid("intelligence-calibration-observations-required");
  let previous = -Infinity,
    asset = null,
    horizon = null;
  return input.map((row) => {
    const timestamp = Date.parse(row.timestamp),
      outcomeAt = Date.parse(row.outcomeAt),
      outcome = Number(row.outcome),
      currentAsset = String(row.asset || "").toUpperCase(),
      nodes = Array.isArray(row.nodes) ? row.nodes : [];
    if (
      !Number.isFinite(timestamp) ||
      timestamp <= previous ||
      !Number.isFinite(outcomeAt) ||
      outcomeAt <= timestamp ||
      outcomeAt > asOf ||
      ![0, 1].includes(outcome) ||
      !/^[A-Z0-9]{2,10}$/.test(currentAsset)
    )
      invalid("invalid-intelligence-calibration-observation");
    previous = timestamp;
    asset ||= currentAsset;
    if (currentAsset !== asset)
      invalid("intelligence-calibration-single-asset-required");
    const currentHorizon = outcomeAt - timestamp;
    horizon ??= currentHorizon;
    if (currentHorizon !== horizon)
      invalid("intelligence-calibration-horizon-mismatch");
    const normalizedNodes = Object.fromEntries(
      nodes.map((node) => {
        const id = String(node.id || ""),
          signal = Number(node.signal),
          confidence = Number(node.confidence);
        if (
          !["macro", "news", "market"].includes(id) ||
          !Number.isFinite(signal) ||
          signal < -1 ||
          signal > 1 ||
          !Number.isFinite(confidence) ||
          confidence < 0 ||
          confidence > 1
        )
          invalid("invalid-intelligence-calibration-node");
        return [id, { signal, confidence }];
      }),
    );
    if (Object.keys(normalizedNodes).length !== 3)
      invalid("intelligence-calibration-nodes-required");
    return {
      timestamp: new Date(timestamp).toISOString(),
      outcomeAt: new Date(outcomeAt).toISOString(),
      asset,
      outcome,
      nodes: normalizedNodes,
    };
  });
}

function walkForwardFolds(length, input = {}) {
  const policy = { ...DEFAULT_FOLDS, ...input },
    training = nonNegativeInteger(
      policy.minimumTrainingObservations,
      "invalid-intelligence-training-window",
    ),
    test = nonNegativeInteger(
      policy.testObservations,
      "invalid-intelligence-test-window",
    ),
    purge = nonNegativeInteger(
      policy.purgeObservations,
      "invalid-intelligence-purge",
    ),
    embargo = nonNegativeInteger(
      policy.embargoObservations,
      "invalid-intelligence-embargo",
    ),
    minimum = nonNegativeInteger(
      policy.minimumFolds,
      "invalid-intelligence-minimum-folds",
    ),
    folds = [];
  if (!training || !test || !minimum)
    invalid("invalid-intelligence-fold-policy");
  for (
    let testStart = training + purge;
    testStart + test <= length;
    testStart += test + embargo
  ) {
    const trainEnd = testStart - purge;
    folds.push({
      fold: folds.length,
      train: { start: 0, end: trainEnd - 1, observations: trainEnd },
      purge: { start: trainEnd, end: testStart - 1, observations: purge },
      test: { start: testStart, end: testStart + test - 1, observations: test },
      embargo: {
        start: testStart + test,
        end: Math.min(length, testStart + test + embargo) - 1,
        observations: Math.min(embargo, length - testStart - test),
      },
    });
  }
  if (folds.length < minimum)
    invalid("insufficient-intelligence-calibration-folds");
  return folds;
}

function candidates(input = {}) {
  const grid = { ...DEFAULT_GRID, ...input };
  if (
    !Array.isArray(grid.weightSets) ||
    !grid.weightSets.length ||
    !Array.isArray(grid.dispersionPenalties) ||
    !grid.dispersionPenalties.length
  )
    invalid("invalid-intelligence-calibration-grid");
  const output = [];
  for (const rawWeights of grid.weightSets) {
    const weights = Object.fromEntries(
        ["macro", "news", "market"].map((id) => [id, Number(rawWeights[id])]),
      ),
      total = Object.values(weights).reduce((sum, value) => sum + value, 0);
    if (
      Object.values(weights).some(
        (value) => !Number.isFinite(value) || value < 0,
      ) ||
      total <= 0
    )
      invalid("invalid-intelligence-calibration-grid");
    for (const penaltyValue of grid.dispersionPenalties) {
      const dispersionPenalty = Number(penaltyValue),
        normalized = Object.fromEntries(
          Object.entries(weights).map(([id, value]) => [id, value / total]),
        );
      if (!Number.isFinite(dispersionPenalty) || dispersionPenalty < 0)
        invalid("invalid-intelligence-calibration-grid");
      const parameters = { weights: normalized, dispersionPenalty };
      output.push({ id: fingerprint(parameters), parameters });
    }
  }
  const unique = [...new Map(output.map((row) => [row.id, row])).values()];
  if (unique.length > 128) invalid("intelligence-calibration-grid-too-large");
  return unique.sort((left, right) => left.id.localeCompare(right.id));
}

function forecast(observation, candidate) {
  const weighted = Object.entries(observation.nodes).map(([id, node]) => ({
      signal: node.signal,
      weight: candidate.parameters.weights[id] * node.confidence,
    })),
    denominator = weighted.reduce((sum, row) => sum + row.weight, 0),
    signal = denominator
      ? weighted.reduce((sum, row) => sum + row.signal * row.weight, 0) /
        denominator
      : 0,
    dispersion = denominator
      ? Math.sqrt(
          weighted.reduce(
            (sum, row) => sum + row.weight * (row.signal - signal) ** 2,
            0,
          ) / denominator,
        )
      : 1,
    coverage = Object.entries(observation.nodes).reduce(
      (sum, [id, node]) =>
        sum + candidate.parameters.weights[id] * node.confidence,
      0,
    ),
    confidence = Math.max(
      0,
      Math.min(
        1,
        coverage *
          Math.exp(-candidate.parameters.dispersionPenalty * dispersion),
      ),
    ),
    probability = clampProbability(0.5 + (signal * confidence) / 2);
  return { probability, signal, confidence, dispersion };
}

function metrics(observations, candidate) {
  const forecasts = observations.map((row) => ({
      ...forecast(row, candidate),
      row,
    })),
    count = forecasts.length,
    logLoss =
      forecasts.reduce(
        (sum, item) =>
          sum -
          (item.row.outcome * Math.log(item.probability) +
            (1 - item.row.outcome) * Math.log(1 - item.probability)),
        0,
      ) / count,
    brier =
      forecasts.reduce(
        (sum, item) => sum + (item.probability - item.row.outcome) ** 2,
        0,
      ) / count,
    accuracy =
      forecasts.filter(
        (item) => (item.probability >= 0.5 ? 1 : 0) === item.row.outcome,
      ).length / count,
    calibrationError = Math.abs(
      forecasts.reduce((sum, item) => sum + item.probability, 0) / count -
        forecasts.reduce((sum, item) => sum + item.row.outcome, 0) / count,
    );
  return {
    observations: count,
    logLoss,
    brier,
    directionalAccuracy: accuracy,
    calibrationError,
  };
}

function calibrateIntelligence(input = {}) {
  const asOf = input.asOf ? Date.parse(input.asOf) : Date.now();
  if (!Number.isFinite(asOf)) invalid("invalid-intelligence-calibration-as-of");
  const observations = normalizeObservations(input.observations, asOf),
    folds = walkForwardFolds(observations.length, input.folds),
    grid = candidates(input.grid),
    selections = new Map(),
    foldResults = [];
  for (const fold of folds) {
    const testRows = observations.slice(fold.test.start, fold.test.end + 1),
      testStartsAt = Date.parse(testRows[0].timestamp),
      training = observations
        .slice(fold.train.start, fold.train.end + 1)
        .filter((row) => Date.parse(row.outcomeAt) < testStartsAt);
    if (training.length < Math.max(10, Math.floor(fold.train.observations / 2)))
      invalid("insufficient-causally-mature-training-observations");
    const ranked = grid
        .map((candidate) => {
          const result = metrics(training, candidate);
          return {
            candidate,
            metrics: result,
            objective: result.logLoss + 0.5 * result.calibrationError,
          };
        })
        .sort(
          (left, right) =>
            left.objective - right.objective ||
            left.candidate.id.localeCompare(right.candidate.id),
        ),
      selected = ranked[0].candidate,
      testMetrics = metrics(testRows, selected);
    selections.set(selected.id, (selections.get(selected.id) || 0) + 1);
    foldResults.push({
      fold: fold.fold,
      selectedCandidateId: selected.id,
      causallyMatureTrainingObservations: training.length,
      trainingObjective: ranked[0].objective,
      test: testMetrics,
    });
  }
  const selectedId = [...selections].sort(
      ([leftId, leftCount], [rightId, rightCount]) =>
        rightCount - leftCount || leftId.localeCompare(rightId),
    )[0][0],
    selected = grid.find((candidate) => candidate.id === selectedId),
    oos = {
      observations: foldResults.reduce(
        (sum, fold) => sum + fold.test.observations,
        0,
      ),
      logLoss:
        foldResults.reduce(
          (sum, fold) => sum + fold.test.logLoss * fold.test.observations,
          0,
        ) / foldResults.reduce((sum, fold) => sum + fold.test.observations, 0),
      brier:
        foldResults.reduce(
          (sum, fold) => sum + fold.test.brier * fold.test.observations,
          0,
        ) / foldResults.reduce((sum, fold) => sum + fold.test.observations, 0),
    },
    dataset = {
      asset: observations[0].asset,
      observations: observations.length,
      firstTimestamp: observations[0].timestamp,
      lastOutcomeAt: observations.at(-1).outcomeAt,
      horizonMs:
        Date.parse(observations[0].outcomeAt) -
        Date.parse(observations[0].timestamp),
      hash: fingerprint(observations),
    },
    result = {
      paperOnly: true,
      method: "nested-purged-embargoed-walk-forward-v1",
      dataset,
      folds,
      foldResults,
      search: {
        candidates: grid.length,
        selectionCounts: Object.fromEntries(selections),
      },
      outOfSample: oos,
      recommendation: {
        candidateId: selected.id,
        parameters: selected.parameters,
        autoApply: false,
        requiresHumanApproval: true,
        state: "research-only",
      },
    };
  return { ...result, reproducibilityHash: fingerprint(result) };
}

module.exports = {
  DEFAULT_FOLDS,
  DEFAULT_GRID,
  calibrateIntelligence,
  candidates,
  forecast,
  metrics,
  normalizeObservations,
  walkForwardFolds,
};
