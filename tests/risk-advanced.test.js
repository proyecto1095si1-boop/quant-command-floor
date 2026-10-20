"use strict";
const assert = require("node:assert/strict"),
  M = require("../server/risk/math.js"),
  { RiskGate } = require("../server/pipeline/risk-gate.js");
(() => {
  const prices = [100, 98, 95, 97, 92, 94],
    rs = M.returns(prices),
    tail = M.historicalVarCvar(rs, 0.8);
  assert.ok(tail.cvar >= tail.var);
  assert.ok(M.ewmaVolatility(rs) > 0);
  assert.equal(M.fractionalKelly({ winRate: 0.4, payoff: 1 }), 0);
  assert.ok(M.fractionalKelly({ winRate: 0.6, payoff: 2 }) > 0);
  assert.equal(+M.correlation([1, 2, 3, 4], [2, 4, 6, 8]).toFixed(4), 1);
  const risk = new RiskGate({
      minObservations: 5,
      maxVaR: 0.2,
      maxCVaR: 0.3,
      maxStressLoss: 1,
    }),
    sizing = risk.size({
      equity: 100000,
      price: 100,
      atr: 2,
      maxWeight: 0.3,
      returns: Array(80).fill(0.001),
      winRate: 0.6,
      payoff: 1.5,
    });
  assert.ok(sizing.qty > 0);
  assert.ok(
    ["stop", "mandate", "volatility", "kelly"].includes(sizing.binding),
  );
  const proposal = {
      id: "a",
      symbol: "BTC-USD",
      qty: sizing.qty,
      notional: sizing.qty * 100,
      confidence: 0.8,
      maxWeight: 0.3,
    },
    approved = risk.evaluate(proposal, {
      equity: 100000,
      dataStatus: "healthy",
      returns: Array(80).fill(0.001),
      spreadBps: 5,
    });
  assert.equal(approved.approved, true);
  const veto = risk.evaluate(proposal, {
    equity: 80000,
    dataStatus: "healthy",
    drawdown: 0.2,
    returns: Array(80).fill(-0.01),
    spreadBps: 50,
  });
  assert.equal(veto.approved, false);
  assert.ok(veto.failed.includes("drawdown"));
  assert.ok(veto.failed.includes("liquidity"));
  risk.halt("human-director");
  assert.equal(
    risk
      .evaluate(proposal, { equity: 100000, dataStatus: "healthy" })
      .failed.includes("system"),
    true,
  );
  console.log("advanced risk tests: ok");
})();
