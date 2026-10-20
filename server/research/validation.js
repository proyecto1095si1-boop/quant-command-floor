"use strict";
const S = require("./statistics.js");
function purgedKFold(length, { folds = 5, purge = 2, embargo = 2 } = {}) {
  if (length < folds || folds < 2) throw new Error("insufficient-observations");
  const size = Math.ceil(length / folds),
    all = Array.from({ length }, (_, i) => i);
  return Array.from({ length: folds }, (_, fold) => {
    const start = fold * size,
      end = Math.min(length, start + size),
      test = all.slice(start, end),
      left = Math.max(0, start - purge),
      right = Math.min(length, end + purge + embargo),
      train = all.filter((i) => i < left || i >= right);
    return { fold, start, end: end - 1, train, test, purge, embargo };
  }).filter((x) => x.test.length && x.train.length);
}
function combinations(n, k, limit = 252) {
  const out = [];
  function visit(start, row) {
    if (out.length >= limit) return;
    if (row.length === k) {
      out.push(row);
      return;
    }
    for (let i = start; i < n; i++) visit(i + 1, [...row, i]);
  }
  visit(0, []);
  return out;
}
function probabilityBacktestOverfitting(
  matrix,
  { slices = 8, maxCombinations = 252, periods = 252 } = {},
) {
  const strategies = matrix.filter((x) => Array.isArray(x) && x.length),
    n = Math.min(...strategies.map((x) => x.length));
  if (strategies.length < 2 || n < slices * 2)
    throw new Error("pbo-requires-multiple-strategies");
  if (slices % 2) slices--;
  const sliceSize = Math.floor(n / slices),
    parts = Array.from({ length: slices }, (_, i) => [
      i * sliceSize,
      i === slices - 1 ? n : (i + 1) * sliceSize,
    ]),
    combos = combinations(slices, slices / 2, maxCombinations);
  let overfit = 0;
  const logits = [];
  for (const selected of combos) {
    const inSet = new Set(selected),
      ins = strategies.map((r) =>
        S.sharpe(
          parts.flatMap((p, i) => (inSet.has(i) ? r.slice(...p) : [])),
          periods,
        ),
      ),
      oos = strategies.map((r) =>
        S.sharpe(
          parts.flatMap((p, i) => (!inSet.has(i) ? r.slice(...p) : [])),
          periods,
        ),
      ),
      winner = ins.indexOf(Math.max(...ins)),
      rank = [...oos].sort((a, b) => a - b).indexOf(oos[winner]) + 1,
      w = rank / (strategies.length + 1),
      logit = Math.log(w / (1 - w));
    logits.push(logit);
    if (logit <= 0) overfit++;
  }
  return {
    probability: overfit / combos.length,
    combinations: combos.length,
    medianLogit: S.median(logits),
  };
}
function sensitivity(results) {
  const values = results.map((x) => Number(x.metric)).filter(Number.isFinite),
    med = S.median(values),
    dispersion = S.std(values),
    scale = Math.abs(med) || 1;
  return {
    median: med,
    dispersion,
    stability: Math.max(0, 1 - dispersion / scale),
    best: Math.max(...values),
    worst: Math.min(...values),
  };
}
module.exports = {
  purgedKFold,
  probabilityBacktestOverfitting,
  sensitivity,
  combinations,
};
