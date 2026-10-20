"use strict";
const mean = (x) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : 0);
const std = (x) => {
  if (x.length < 2) return 0;
  const m = mean(x);
  return Math.sqrt(x.reduce((s, v) => s + (v - m) ** 2, 0) / (x.length - 1));
};
function returns(prices) {
  return prices.slice(1).map((x, i) => (prices[i] > 0 ? x / prices[i] - 1 : 0));
}
function entropy(xs) {
  if (!xs.length) return 0;
  const bins = [
      xs.filter((x) => x < 0).length,
      xs.filter((x) => x === 0).length,
      xs.filter((x) => x > 0).length,
    ],
    n = xs.length;
  return (
    -bins.reduce((s, c) => (c ? s + (c / n) * Math.log(c / n) : s), 0) /
    Math.log(3)
  );
}
function hurst(prices) {
  const n = prices.length;
  if (n < 20) return 0.5;
  const r = returns(prices),
    m = mean(r),
    cum = [];
  let s = 0;
  for (const x of r) {
    s += x - m;
    cum.push(s);
  }
  const range = Math.max(...cum) - Math.min(...cum),
    sigma = std(r);
  return range > 0 && sigma > 0
    ? Math.max(0, Math.min(1, Math.log(range / sigma) / Math.log(r.length)))
    : 0.5;
}
function changePoint(xs, window = 20) {
  if (xs.length < window * 2) return { probability: 0, z: 0 };
  const a = xs.slice(-window * 2, -window),
    b = xs.slice(-window),
    den = Math.sqrt(std(a) ** 2 / a.length + std(b) ** 2 / b.length) || 1,
    z = (mean(b) - mean(a)) / den;
  return { z, probability: 1 - Math.exp(-Math.abs(z)) };
}
function features(prices, spreadBps = 0, window = 20) {
  const out = [];
  for (let i = window; i < prices.length; i++) {
    const p = prices.slice(i - window, i + 1),
      r = returns(p);
    out.push([mean(r), std(r), p.at(-1) / p[0] - 1, spreadBps / 10000]);
  }
  return out;
}
function gaussianLog(x, mu, sigma) {
  return x.reduce(
    (s, v, i) => s - 0.5 * ((v - mu[i]) / sigma[i]) ** 2 - Math.log(sigma[i]),
    0,
  );
}
function hmm(observations, states, transition) {
  let p = states.map(() => 1 / states.length);
  for (const x of observations) {
    const next = states.map((state, j) => {
        const prior = p.reduce((s, v, i) => s + v * transition[i][j], 0);
        return (
          Math.log(Math.max(1e-15, prior)) +
          gaussianLog(x, state.mu, state.sigma)
        );
      }),
      max = Math.max(...next),
      scaled = next.map((v) => Math.exp(v - max)),
      sum = scaled.reduce((a, b) => a + b, 0);
    p = scaled.map((v) => v / sum);
  }
  return p;
}
module.exports = {
  mean,
  std,
  returns,
  entropy,
  hurst,
  changePoint,
  features,
  hmm,
};
