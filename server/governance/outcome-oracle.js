"use strict";

const { fingerprint } = require("./service.js");

function invalid(message, status = 422) {
  throw Object.assign(new Error(message), { status });
}

function milliseconds(value, message) {
  const parsed = Date.parse(String(value || ""));
  if (!Number.isFinite(parsed)) invalid(message);
  return parsed;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b),
    middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function cleanObservation(input, symbol, targetMs, phase, policy, nowMs) {
  const source = String(input?.source || "")
      .trim()
      .toLowerCase(),
    price = Number(input?.price),
    eventMs = milliseconds(
      input?.exchangeAt || input?.receivedAt,
      "oracle-observation-time-required",
    ),
    receivedMs = milliseconds(
      input?.receivedAt,
      "oracle-received-time-required",
    );
  if (
    !policy.sources.includes(source) ||
    String(input?.symbol || "") !== symbol ||
    !Number.isFinite(price) ||
    price <= 0
  )
    invalid("invalid-oracle-observation");
  if (receivedMs > nowMs) invalid("oracle-observation-from-future");
  if (eventMs - receivedMs > policy.maxClockSkewMs)
    invalid("oracle-clock-skew-exceeded");
  if (
    (phase === "anchor" &&
      (eventMs > targetMs || targetMs - eventMs > policy.maxStalenessMs)) ||
    (phase === "close" &&
      (eventMs < targetMs ||
        eventMs - targetMs > policy.maxOutcomeLagMs ||
        receivedMs - targetMs > policy.maxOutcomeLagMs))
  )
    invalid(`invalid-oracle-${phase}-window`);
  const content = {
    source,
    symbol,
    price,
    eventAt: new Date(eventMs).toISOString(),
    receivedAt: new Date(receivedMs).toISOString(),
  };
  return { ...content, hash: fingerprint(content) };
}

function consensus(observations, policy) {
  const unique = new Set(observations.map((row) => row.source));
  if (unique.size !== observations.length) invalid("duplicate-oracle-source");
  if (observations.length < policy.minimumSources)
    invalid("insufficient-oracle-sources", 503);
  const prices = observations.map((row) => row.price),
    price = median(prices),
    maximumDivergenceBps =
      ((Math.max(...prices) - Math.min(...prices)) / price) * 10000;
  if (maximumDivergenceBps > policy.maxDivergenceBps)
    invalid("oracle-source-divergence", 503);
  return { price, maximumDivergenceBps, sources: observations.length };
}

function validateArtifact(artifact, phase, policy) {
  if (!artifact || artifact.version !== 1 || artifact.phase !== phase)
    return false;
  const { hash, ...content } = artifact;
  if (
    hash !== fingerprint(content) ||
    !Array.isArray(artifact.observations) ||
    JSON.stringify(artifact.policy) !== JSON.stringify(policy)
  )
    return false;
  try {
    const targetMs = milliseconds(artifact.targetAt, "invalid-target"),
      nowMs = milliseconds(artifact.observedAt, "invalid-observed"),
      cleaned = artifact.observations.map((row) =>
        cleanObservation(row, artifact.symbol, targetMs, phase, policy, nowMs),
      ),
      result = consensus(cleaned, policy);
    return (
      JSON.stringify(cleaned) === JSON.stringify(artifact.observations) &&
      JSON.stringify(result) === JSON.stringify(artifact.consensus)
    );
  } catch {
    return false;
  }
}

function validateResolution(anchor, resolution, policy) {
  if (
    !validateArtifact(anchor, "anchor", policy) ||
    !validateArtifact(resolution, "close", policy) ||
    anchor.symbol !== resolution.symbol ||
    resolution.anchorHash !== anchor.hash ||
    resolution.targetAt !== anchor.maturesAt ||
    resolution.thresholdBps !== anchor.thresholdBps
  )
    return false;
  const returnBps =
      ((resolution.consensus.price - anchor.consensus.price) /
        anchor.consensus.price) *
      10000,
    outcome = returnBps >= anchor.thresholdBps ? 1 : 0;
  return resolution.returnBps === returnBps && resolution.outcome === outcome;
}

class OutcomeOracle {
  constructor({ provider, clock = () => Date.now(), policy = {} } = {}) {
    if (!provider || typeof provider.pointInTimeQuotes !== "function")
      throw new Error("outcome-oracle-provider-required");
    this.provider = provider;
    this.clock = clock;
    this.policy = {
      sources: ["coinbase", "kraken"],
      minimumSources: 2,
      maxStalenessMs: 30_000,
      maxOutcomeLagMs: 30_000,
      finalityDelayMs: 30_000,
      maxClockSkewMs: 2_000,
      maxDivergenceBps: 25,
      ...policy,
    };
    if (!Array.isArray(this.policy.sources))
      throw new Error("invalid-outcome-oracle-policy");
    this.policy.sources = this.policy.sources.map((source) =>
      String(source).toLowerCase(),
    );
    const p = this.policy;
    if (
      new Set(p.sources).size !== p.sources.length ||
      !p.sources.length ||
      p.sources.some((source) => !source) ||
      !Number.isInteger(p.minimumSources) ||
      p.minimumSources < 2 ||
      p.minimumSources > p.sources.length ||
      !Number.isInteger(p.maxStalenessMs) ||
      p.maxStalenessMs < 0 ||
      !Number.isInteger(p.maxOutcomeLagMs) ||
      p.maxOutcomeLagMs < 0 ||
      !Number.isInteger(p.finalityDelayMs) ||
      p.finalityDelayMs < 0 ||
      !Number.isInteger(p.maxClockSkewMs) ||
      p.maxClockSkewMs < 0 ||
      !Number.isFinite(p.maxDivergenceBps) ||
      p.maxDivergenceBps < 0
    )
      throw new Error("invalid-outcome-oracle-policy");
  }

  now() {
    const value = Number(this.clock());
    if (!Number.isFinite(value))
      throw new Error("invalid-outcome-oracle-clock");
    return value;
  }

  async artifact({
    phase,
    symbol,
    targetAt,
    observedAt,
    extra = {},
    query = {},
  }) {
    const targetMs = milliseconds(targetAt, "invalid-oracle-target"),
      nowMs = milliseconds(observedAt, "invalid-oracle-observed-at"),
      observations = (
        await this.provider.pointInTimeQuotes(symbol, targetAt, phase, {
          sources: this.policy.sources,
          maxStalenessMs: this.policy.maxStalenessMs,
          maxOutcomeLagMs: this.policy.maxOutcomeLagMs,
          ...query,
        })
      ).map((row) =>
        cleanObservation(row, symbol, targetMs, phase, this.policy, nowMs),
      );
    observations.sort(
      (left, right) =>
        this.policy.sources.indexOf(left.source) -
        this.policy.sources.indexOf(right.source),
    );
    const content = {
      version: 1,
      phase,
      symbol,
      targetAt: new Date(targetMs).toISOString(),
      observedAt: new Date(nowMs).toISOString(),
      observations,
      consensus: consensus(observations, this.policy),
      policy: structuredClone(this.policy),
      ...extra,
    };
    return { ...content, hash: fingerprint(content) };
  }

  async anchor({
    requestKey,
    symbol,
    predictedAt,
    maturesAt,
    thresholdBps = 0,
  }) {
    const threshold = Number(thresholdBps);
    if (!String(symbol || "").trim() || !Number.isFinite(threshold))
      invalid("invalid-oracle-target");
    return this.artifact({
      phase: "anchor",
      symbol: String(symbol),
      targetAt: predictedAt,
      observedAt: predictedAt,
      extra: { maturesAt, thresholdBps: threshold },
      query: { requestKey },
    });
  }

  async resolve(forecast) {
    const nowMs = this.now(),
      maturityMs = milliseconds(forecast.maturesAt, "invalid-oracle-maturity");
    if (nowMs < maturityMs + this.policy.finalityDelayMs)
      invalid("oracle-outcome-not-final", 409);
    const artifact = await this.artifact({
        phase: "close",
        symbol: forecast.symbol,
        targetAt: forecast.maturesAt,
        observedAt: new Date(nowMs).toISOString(),
        extra: {
          anchorHash: forecast.oracleAnchor.hash,
          thresholdBps: forecast.oracleAnchor.thresholdBps,
        },
        query: { requestKey: forecast.requestKey },
      }),
      returnBps =
        ((artifact.consensus.price - forecast.oracleAnchor.consensus.price) /
          forecast.oracleAnchor.consensus.price) *
        10000,
      content = {
        ...artifact,
        returnBps,
        outcome: returnBps >= forecast.oracleAnchor.thresholdBps ? 1 : 0,
      };
    delete content.hash;
    return { ...content, hash: fingerprint(content) };
  }
}

module.exports = {
  OutcomeOracle,
  consensus,
  validateArtifact,
  validateResolution,
};
