"use strict";

const assert = require("node:assert/strict"),
  {
    ConsensusEngine,
    effectiveSampleSize,
    validateSignals,
  } = require("../server/decision/consensus.js");
require("./dependence.test.js");

(() => {
  const engine = new ConsensusEngine(),
    correlated = engine.combine([
      { agent: "Technical", signal: 0.9, confidence: 0.95 },
      { agent: "Market Structure", signal: 0.9, confidence: 0.95 },
      { agent: "Order Block", signal: 0.9, confidence: 0.95 },
      { agent: "Whale", signal: 0.7, confidence: 0.9 },
    ]);
  assert.equal(correlated.paperOnly, true);
  assert.equal(correlated.action, "LONG");
  assert.equal(correlated.abstained, false);
  assert.ok(correlated.probabilityInterval95.lower > 0.5);
  assert.ok(correlated.effectiveAgents < 4);
  assert.equal(correlated.debate.moderator, "LONG");
  assert.equal(correlated.method, "correlation-adjusted-log-odds-v1");

  const independent = engine.combine([
    { agent: "alpha", signal: 0.8, confidence: 0.9 },
    { agent: "beta", signal: 0.8, confidence: 0.9 },
    { agent: "gamma", signal: 0.8, confidence: 0.9 },
  ]);
  assert.equal(independent.effectiveAgents, 3);
  assert.ok(independent.effectiveAgents > correlated.effectiveAgents);

  const ambiguous = engine.combine([
    { agent: "alpha", signal: 0.05, confidence: 0.9 },
    { agent: "beta", signal: -0.05, confidence: 0.9 },
    { agent: "gamma", signal: 0.02, confidence: 0.9 },
  ]);
  assert.equal(ambiguous.action, "NO_TRADE");
  assert.ok(ambiguous.abstainReasons.includes("credibleDirection"));
  assert.equal(ambiguous.debate.cio.decision, "NO_TRADE");

  const uncertainRegime = engine.combine(
    [
      { agent: "alpha", signal: 1, confidence: 1 },
      { agent: "beta", signal: 1, confidence: 1 },
      { agent: "gamma", signal: 1, confidence: 1 },
    ],
    { regime: { regime: "trend_high_vol", probability: 0.4 } },
  );
  assert.equal(uncertainRegime.action, "NO_TRADE");
  assert.ok(uncertainRegime.abstainReasons.includes("regime"));

  const concentrated = new ConsensusEngine({
    policy: { maximumWeightShare: 0.5 },
  }).combine(
    [
      { agent: "alpha", signal: 1, confidence: 1 },
      { agent: "beta", signal: 1, confidence: 1 },
      { agent: "gamma", signal: 1, confidence: 1 },
    ],
    { weights: { alpha: 100 } },
  );
  assert.equal(concentrated.action, "NO_TRADE");
  assert.ok(concentrated.abstainReasons.includes("concentration"));

  assert.throws(
    () => validateSignals([{ agent: "bad", signal: 2, confidence: 1 }]),
    /invalid-consensus-signal/,
  );
  assert.throws(
    () => new ConsensusEngine({ correlations: { "a|b": 1 } }),
    /invalid-consensus-correlation/,
  );
  assert.throws(
    () => new ConsensusEngine({ policy: { priorProbability: 1 } }),
    /invalid-consensus-policy/,
  );
  assert.throws(
    () =>
      engine.combine([{ agent: "a", signal: 1, confidence: 1 }], {
        weights: { a: Number.NaN },
      }),
    /invalid-consensus-weight/,
  );
  assert.equal(effectiveSampleSize([], {}), 0);
  console.log("multi-agent consensus tests: ok");
})();
