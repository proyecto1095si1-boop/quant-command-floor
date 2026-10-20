"use strict";
const clamp = (x, a, b) => Math.max(a, Math.min(b, Number(x) || 0));
const mean = (xs) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const std = (xs) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};
const words = (text) =>
  String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .match(/[a-z0-9]+/g) || [];
const POSITIVE = new Set([
  "beat",
  "bull",
  "bullish",
  "growth",
  "approve",
  "approval",
  "surge",
  "gain",
  "strong",
  "buy",
  "adoption",
  "inflow",
  "baja",
  "sube",
  "alcista",
  "crecimiento",
]);
const NEGATIVE = new Set([
  "miss",
  "bear",
  "bearish",
  "ban",
  "hack",
  "loss",
  "weak",
  "sell",
  "outflow",
  "inflation",
  "default",
  "cae",
  "bajista",
  "riesgo",
  "fraude",
]);

function base(agentId, signal, confidence, evidence, started = Date.now()) {
  return {
    agent_id: agentId,
    version: "local-math-1.0.0",
    status: "ok",
    signal: clamp(signal, -1, 1),
    confidence: clamp(confidence, 0, 1),
    evidence: evidence.slice(0, 20),
    latency_ms: Date.now() - started,
    at: new Date().toISOString(),
  };
}
function sentiment(input, started) {
  const tokens = words(input.text || input.headline || input.posts?.join(" ")),
    pos = tokens.filter((x) => POSITIVE.has(x)).length,
    neg = tokens.filter((x) => NEGATIVE.has(x)).length,
    n = Math.max(1, pos + neg),
    raw = (pos - neg) / Math.sqrt(n),
    signal = Math.tanh(raw),
    coverage = (pos + neg) / Math.max(1, tokens.length);
  return base(
    "Social Sentiment Scanner",
    signal,
    Math.min(0.95, 0.45 + coverage * 3),
    [
      `lexicon:positive=${pos}`,
      `lexicon:negative=${neg}`,
      `tokens=${tokens.length}`,
    ],
    started,
  );
}
function macro(input, started) {
  const prior = clamp(input.prior_bull ?? 0.5, 0.01, 0.99),
    events = Array.isArray(input.events) ? input.events : [],
    likelihood = events.reduce(
      (acc, e) => acc * clamp(e.bull_likelihood ?? 0.5, 0.05, 0.95),
      1,
    ),
    bearLikelihood = events.reduce(
      (acc, e) => acc * clamp(1 - (e.bull_likelihood ?? 0.5), 0.05, 0.95),
      1,
    ),
    posterior =
      (prior * likelihood) /
      (prior * likelihood + (1 - prior) * bearLikelihood || 1),
    confidence = Math.abs(posterior - 0.5) * 2;
  return base(
    "Macro News Reader",
    posterior * 2 - 1,
    confidence,
    [
      `bayes:prior=${prior.toFixed(3)}`,
      `bayes:posterior=${posterior.toFixed(3)}`,
      `events=${events.length}`,
    ],
    started,
  );
}
function onchain(input, started) {
  const history = (input.history || []).map(Number).filter(Number.isFinite),
    flow = Number(input.net_flow || 0),
    m = mean(history),
    s = std(history),
    z = s ? (flow - m) / s : 0,
    exchangeDirection = input.destination === "exchange" ? -1 : 1,
    signal = Math.tanh(z / 3) * exchangeDirection;
  return base(
    "On-Chain Analyst",
    signal,
    Math.min(0.98, 0.5 + Math.abs(z) / 8),
    [
      `net-flow=${flow}`,
      `z-score=${z.toFixed(3)}`,
      `destination=${input.destination || "unknown"}`,
    ],
    started,
  );
}
function feed(input, started) {
  const age = Math.max(0, Number(input.age_ms || 0)),
    gap = Math.max(0, Number(input.gap_ms || 0)),
    divergence = Math.max(0, Number(input.divergence_bps || 0)),
    score =
      Math.exp(-age / 12000) *
      Math.exp(-gap / 60000) *
      Math.exp(-divergence / 25),
    healthy = score >= 0.7;
  return base(
    "Data Engineer (Feed Manager)",
    healthy ? score : -1 + score,
    Math.min(0.99, 0.7 + Math.abs(score - 0.7)),
    [
      `health=${score.toFixed(4)}`,
      `age_ms=${age}`,
      `gap_ms=${gap}`,
      `divergence_bps=${divergence}`,
    ],
    started,
  );
}
function apiOptimizer(input, started) {
  const rate = Math.max(0.01, Number(input.rate_per_second || 5)),
    burst = Math.max(1, Number(input.burst || 10)),
    queued = Math.max(0, Number(input.queued || 0)),
    priority = clamp(input.priority ?? 0.5, 0, 1),
    waitMs =
      Math.max(0, ((queued - burst) / rate) * 1000) * (1 - priority * 0.75),
    load = queued / burst;
  return base(
    "API Optimizer",
    1 - clamp(load / 2, 0, 2),
    Math.min(0.99, 0.7 + Math.min(load, 1) * 0.2),
    [
      `token-bucket=${rate}/s`,
      `burst=${burst}`,
      `estimated_wait_ms=${waitMs.toFixed(0)}`,
    ],
    started,
  );
}
function anomaly(input, started) {
  const xs = (input.samples || []).map(Number).filter(Number.isFinite),
    current = Number(input.current ?? xs.at(-1) ?? 0),
    sorted = [...xs].sort((a, b) => a - b),
    median = sorted[Math.floor(sorted.length / 2)] || 0,
    mad =
      [...xs].map((x) => Math.abs(x - median)).sort((a, b) => a - b)[
        Math.floor(xs.length / 2)
      ] || 0,
    z = mad ? (0.6745 * (current - median)) / mad : 0,
    isAnomaly = Math.abs(z) > 3.5;
  return base(
    "Anomaly Detector",
    isAnomaly ? -1 : 1 - Math.min(1, Math.abs(z) / 3.5),
    Math.min(0.99, 0.6 + Math.abs(z) / 10),
    [
      `median=${median}`,
      `mad=${mad}`,
      `robust-z=${z.toFixed(3)}`,
      `anomaly=${isAnomaly}`,
    ],
    started,
  );
}
const handlers = {
  "Social Sentiment Scanner": sentiment,
  "Macro News Reader": macro,
  "On-Chain Analyst": onchain,
  "Data Engineer (Feed Manager)": feed,
  "API Optimizer": apiOptimizer,
  "Anomaly Detector": anomaly,
};
function execute(agentId, input = {}) {
  const started = Date.now(),
    handler = handlers[agentId];
  if (!handler)
    return base(agentId, 0, 0.25, ["fallback:no-local-engine"], started);
  return handler(input, started);
}
module.exports = { execute, handlers, math: { clamp, mean, std, words } };
