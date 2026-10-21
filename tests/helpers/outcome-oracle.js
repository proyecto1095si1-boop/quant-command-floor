"use strict";

const { OutcomeOracle } = require("../../server/governance/outcome-oracle.js");

function testOracle(clock, outcomes = new Map()) {
  const provider = {
    pointInTimeQuotes: async (symbol, targetAt, phase, options) => {
      const outcome = outcomes.get(options.requestKey) ?? 1,
        base = phase === "anchor" ? 100 : outcome ? 101 : 99,
        receivedAt = new Date(targetAt).toISOString();
      return [
        {
          source: "coinbase",
          symbol,
          price: base,
          exchangeAt: receivedAt,
          receivedAt,
        },
        {
          source: "kraken",
          symbol,
          price: base + 0.01,
          exchangeAt: receivedAt,
          receivedAt,
        },
      ];
    },
  };
  return new OutcomeOracle({
    provider,
    clock,
    policy: {
      finalityDelayMs: 0,
      maxDivergenceBps: 25,
    },
  });
}

module.exports = { testOracle };
