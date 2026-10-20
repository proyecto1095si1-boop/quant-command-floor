"use strict";
const mean = (xs) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
function returns(xs) {
  return xs.slice(1).map((x, i) => (xs[i] ? x / xs[i] - 1 : 0));
}
function maxDrawdown(xs) {
  let peak = -Infinity,
    max = 0,
    current = 0;
  for (const x of xs) {
    peak = Math.max(peak, x);
    current = peak ? 1 - x / peak : 0;
    max = Math.max(max, current);
  }
  return { current, max };
}
function varCvar(xs, level = 0.95) {
  if (!xs.length) return { var: 0, cvar: 0 };
  const losses = xs.map((x) => -x).sort((a, b) => a - b),
    index = Math.max(0, Math.ceil(losses.length * level) - 1),
    v = losses[index],
    tail = losses.filter((x) => x >= v);
  return { var: v, cvar: mean(tail) };
}
function percentile(xs, p) {
  if (!xs.length) return 0;
  const a = [...xs].sort((x, y) => x - y),
    i = (a.length - 1) * p,
    lo = Math.floor(i),
    hi = Math.ceil(i);
  return a[lo] + (a[hi] - a[lo]) * (i - lo);
}
function correlation(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const x = a.slice(-n),
    y = b.slice(-n),
    mx = mean(x),
    my = mean(y),
    cov = mean(x.map((v, i) => (v - mx) * (y[i] - my))),
    sx = Math.sqrt(mean(x.map((v) => (v - mx) ** 2))),
    sy = Math.sqrt(mean(y.map((v) => (v - my) ** 2)));
  return sx && sy ? cov / (sx * sy) : 0;
}
function matrix(series) {
  const keys = Object.keys(series),
    out = {};
  for (const a of keys) {
    out[a] = {};
    for (const b of keys)
      out[a][b] = a === b ? 1 : correlation(series[a], series[b]);
  }
  return out;
}
module.exports = {
  mean,
  returns,
  maxDrawdown,
  varCvar,
  percentile,
  correlation,
  matrix,
};
