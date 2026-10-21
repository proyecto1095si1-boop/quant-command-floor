"use strict";

const clamp = (value, low = 0, high = 1) =>
    Math.max(low, Math.min(high, Number(value) || 0)),
  sigmoid = (value) => 1 / (1 + Math.exp(-value)),
  logit = (probability) =>
    Math.log(
      clamp(probability, 1e-6, 1 - 1e-6) /
        (1 - clamp(probability, 1e-6, 1 - 1e-6)),
    );

const DEFAULT_CORRELATIONS = {
    "Market Structure|Technical": 0.7,
    "Order Block|Technical": 0.65,
    "Market Structure|Order Block": 0.6,
    "Volume|Whale": 0.35,
    "Liquidity|Volume": 0.4,
  },
  DEFAULT_REGIME_WEIGHTS = {
    risk_on_low_vol: { Technical: 1.15, Volume: 1.1 },
    range_mean_reverting: {
      Technical: 0.85,
      "Market Structure": 1.15,
      "Order Block": 1.2,
    },
    trend_high_vol: {
      Technical: 1.2,
      "Market Structure": 1.2,
      Liquidity: 1.15,
    },
    risk_off_crisis: {
      Technical: 0.75,
      Whale: 1.2,
      Liquidity: 1.3,
      Volume: 1.1,
    },
  };

function pairKey(left, right) {
  return [left, right].sort().join("|");
}

function nonNegative(value, error = "invalid-consensus-weight") {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0)
    throw Object.assign(new Error(error), { status: 422 });
  return numeric;
}

function correlation(left, right, correlations) {
  if (left === right) return 1;
  return clamp(correlations[pairKey(left, right)] || 0, 0, 0.99);
}

function validateSignals(signals) {
  if (!Array.isArray(signals))
    throw Object.assign(new Error("invalid-consensus-signals"), {
      status: 422,
    });
  return signals.map((input) => {
    const agent = String(input.agent || input.agent_id || "").trim(),
      signal = Number(input.signal),
      confidence = Number(input.confidence);
    if (
      !agent ||
      !Number.isFinite(signal) ||
      signal < -1 ||
      signal > 1 ||
      !Number.isFinite(confidence) ||
      confidence < 0 ||
      confidence > 1
    )
      throw Object.assign(new Error("invalid-consensus-signal"), {
        status: 422,
      });
    return { agent, signal, confidence };
  });
}

function effectiveSampleSize(rows, correlations) {
  const sum = rows.reduce((total, row) => total + row.weight, 0);
  let variance = 0;
  for (const left of rows)
    for (const right of rows)
      variance +=
        left.weight *
        right.weight *
        correlation(left.agent, right.agent, correlations);
  return variance ? (sum * sum) / variance : 0;
}

class ConsensusEngine {
  constructor({
    correlations = DEFAULT_CORRELATIONS,
    regimeWeights = DEFAULT_REGIME_WEIGHTS,
    policy = {},
  } = {}) {
    for (const [key, value] of Object.entries(correlations))
      if (
        !key.includes("|") ||
        !Number.isFinite(Number(value)) ||
        Number(value) < 0 ||
        Number(value) >= 1
      )
        throw Object.assign(new Error("invalid-consensus-correlation"), {
          status: 422,
        });
    this.correlations = { ...correlations };
    this.regimeWeights = structuredClone(regimeWeights);
    this.policy = {
      priorProbability: 0.5,
      minimumAgents: 3,
      minimumEffectiveAgents: 2,
      minimumAbsoluteSignal: 0.2,
      maximumWeightShare: 0.7,
      minimumDirectionalProbability: 0.55,
      credibleZ: 1.959963984540054,
      ...policy,
    };
    if (
      Object.values(this.policy).some(
        (value) => !Number.isFinite(Number(value)),
      ) ||
      this.policy.priorProbability <= 0 ||
      this.policy.priorProbability >= 1 ||
      this.policy.minimumAgents < 1 ||
      this.policy.minimumEffectiveAgents < 1 ||
      this.policy.minimumAbsoluteSignal < 0 ||
      this.policy.minimumAbsoluteSignal > 1 ||
      this.policy.maximumWeightShare <= 0 ||
      this.policy.maximumWeightShare > 1 ||
      this.policy.minimumDirectionalProbability < 0.5 ||
      this.policy.minimumDirectionalProbability > 1 ||
      this.policy.credibleZ <= 0
    )
      throw Object.assign(new Error("invalid-consensus-policy"), {
        status: 422,
      });
  }

  combine(
    signals,
    {
      weights = {},
      regime = null,
      blockers = [],
      correlations = this.correlations,
    } = {},
  ) {
    const normalized = validateSignals(signals),
      regimeName = String(regime?.regime || "unclassified"),
      regimeProbability = clamp(regime?.probability ?? 1),
      regimeMap = this.regimeWeights[regimeName] || {},
      weighted = normalized.map((row) => {
        const probability = clamp(0.5 + (row.signal * row.confidence) / 2),
          baseWeight = nonNegative(weights[row.agent] ?? 1),
          regimeWeight = nonNegative(regimeMap[row.agent] ?? 1),
          redundancy =
            1 +
            normalized.reduce(
              (sum, peer) =>
                sum +
                (peer.agent === row.agent
                  ? 0
                  : correlation(row.agent, peer.agent, correlations)),
              0,
            ),
          weight = (baseWeight * regimeWeight * row.confidence) / redundancy;
        return {
          ...row,
          probability,
          baseWeight,
          regimeWeight,
          redundancy,
          weight,
          logOddsContribution: weight * logit(probability),
        };
      }),
      totalWeight = weighted.reduce((sum, row) => sum + row.weight, 0),
      posteriorLogOdds =
        logit(this.policy.priorProbability) +
        weighted.reduce((sum, row) => sum + row.logOddsContribution, 0),
      posterior = sigmoid(posteriorLogOdds),
      signal = posterior * 2 - 1,
      direction = signal >= 0 ? "LONG" : "SHORT",
      directionalProbability = Math.max(posterior, 1 - posterior),
      information = weighted.reduce(
        (sum, row) => sum + row.weight * Math.max(row.confidence, 0.05),
        0,
      ),
      standardErrorLogOdds = information
        ? 1 / Math.sqrt(information)
        : Infinity,
      probabilityInterval = Number.isFinite(standardErrorLogOdds)
        ? {
            lower: sigmoid(
              posteriorLogOdds - this.policy.credibleZ * standardErrorLogOdds,
            ),
            upper: sigmoid(
              posteriorLogOdds + this.policy.credibleZ * standardErrorLogOdds,
            ),
          }
        : { lower: 0, upper: 1 },
      effectiveAgents = effectiveSampleSize(weighted, correlations),
      maximumWeightShare = totalWeight
        ? Math.max(0, ...weighted.map((row) => row.weight / totalWeight))
        : 1,
      checks = {
        blockers: blockers.length === 0,
        agents: normalized.length >= this.policy.minimumAgents,
        effectiveAgents: effectiveAgents >= this.policy.minimumEffectiveAgents,
        magnitude: Math.abs(signal) >= this.policy.minimumAbsoluteSignal,
        concentration: maximumWeightShare <= this.policy.maximumWeightShare,
        directionalProbability:
          directionalProbability >= this.policy.minimumDirectionalProbability,
        credibleDirection:
          direction === "LONG"
            ? probabilityInterval.lower > 0.5
            : probabilityInterval.upper < 0.5,
        regime: regimeName === "unclassified" || regimeProbability >= 0.5,
      },
      abstainReasons = Object.entries(checks)
        .filter(([, passed]) => !passed)
        .map(([name]) => name),
      abstained = abstainReasons.length > 0;
    return {
      paperOnly: true,
      method: "correlation-adjusted-log-odds-v1",
      action: abstained ? "NO_TRADE" : direction,
      abstained,
      abstainReasons,
      signal,
      confidence: directionalProbability,
      posterior,
      probabilityInterval95: probabilityInterval,
      effectiveAgents,
      maximumWeightShare,
      regime: {
        name: regimeName,
        probability: regimeProbability,
      },
      checks,
      contributions: weighted,
      debate: {
        bull: weighted
          .filter((row) => row.logOddsContribution > 0)
          .reduce((sum, row) => sum + row.logOddsContribution, 0),
        bear: weighted
          .filter((row) => row.logOddsContribution < 0)
          .reduce((sum, row) => sum + Math.abs(row.logOddsContribution), 0),
        moderator: abstained ? "ABSTAIN" : direction,
        investmentCommittee: checks,
        cio: {
          decision: abstained ? "NO_TRADE" : direction,
          probability: directionalProbability,
          interval95: probabilityInterval,
        },
      },
    };
  }
}

module.exports = {
  ConsensusEngine,
  DEFAULT_CORRELATIONS,
  DEFAULT_REGIME_WEIGHTS,
  effectiveSampleSize,
  validateSignals,
};
