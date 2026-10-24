"use strict";

const assert = require("node:assert/strict"),
  { EmployeeCards } = require("../server/employees/service.js"),
  {
    validateEmployeeCard,
    assertEmployeeCard,
    CARD_LIMITS,
  } = require("../server/employees/contract.js"),
  { DESK_PARAMETERS } = require("../server/desks/parameters.js"),
  { DeskRegistry } = require("../server/desks/registry.js"),
  { TradingPipeline } = require("../server/pipeline/orchestrator.js"),
  { RiskGate } = require("../server/pipeline/risk-gate.js"),
  { ResearchLab } = require("../server/research/lab.js"),
  { PortfolioService } = require("../server/portfolio/service.js"),
  { ExecutionService } = require("../server/execution/service.js"),
  A = require("../server/desks/agents.js"),
  M = require("../server/desks/math.js");

(async () => {
  let now = 1900000000000;
  const desks = new DeskRegistry({ weights: { Technical: 0.77 } }),
    pipeline = new TradingPipeline({
      desks,
      risk: new RiskGate({ maxDrawdown: 0.07 }),
    }),
    portfolio = new PortfolioService({
      pipeline,
      policy: { rebalanceBand: 0.03 },
    }),
    execution = new ExecutionService({
      pipeline,
      portfolio,
      policy: { slices: 3 },
    }),
    research = new ResearchLab({ policy: { minObservations: 160 } }),
    sources = { desks, pipeline, portfolio, execution, research },
    cards = new EmployeeCards({
      clock: () => now,
      sources: () => sources,
      secrets: ["sensitive-test-value"],
    });
  const entries = cards.list();
  assert.equal(entries.length, 33);
  for (const row of entries)
    assert.equal(validateEmployeeCard(cards.card(row.id)).valid, true, row.id);
  assert.equal(cards.card("unknown"), null);
  assert.equal(cards.card("research.miner").empty.active, true);
  assert.equal(
    cards.card("research.miner").reliability.performance.value,
    null,
  );

  const candles = Array.from({ length: 100 }, (_, index) => ({
      open: 100 + index,
      close: 101 + index + Math.sin(index),
      high: 104 + index,
      low: 98 + index,
      volume: 10 + index,
    })),
    result = A.technical(candles),
    at = new Date(now).toISOString();
  cards.ingest({
    type: "desk.analysis",
    report: {
      asset: "BTC",
      at,
      status: "ok",
      action: "LONG",
      signal: 0.32,
      confidence: 0.61,
      agents: [result],
      inputSummary: { candles: 100, trades: 20 },
    },
  });
  let card = cards.card("consensus.technical", { asset: "BTC" });
  const params = Object.fromEntries(
    card.work.parameters.map((row) => [row.name, row.value]),
  );
  assert.equal(params.consensusWeight, desks.weights.Technical);
  for (const [name, value] of Object.entries(DESK_PARAMETERS.Technical))
    assert.equal(params[name], value);
  assert.equal(
    card.latest.raw.metrics.fast,
    M.ema(
      candles.map((x) => x.close).slice(-params.fastWindow),
      params.fastPeriod,
    ),
    "a displayed EMA period/window must reproduce the real engine output",
  );
  assert.equal(
    card.latest.raw.metrics.slow,
    M.ema(
      candles.map((x) => x.close).slice(-params.slowWindow),
      params.slowPeriod,
    ),
  );
  assert.equal(
    card.latest.raw.metrics.rsi,
    M.rsi(
      candles.map((x) => x.close),
      params.rsiPeriod,
    ),
  );
  assert.equal(card.inputs[0].state, "live");
  cards.ingest({
    type: "desk.analysis",
    report: {
      asset: "SOL",
      at,
      signal: 0.2,
      confidence: 0.5,
      agents: [result],
      inputSummary: { candles: 10, trades: 5 },
    },
  });
  assert.match(
    cards.card("consensus.technical", { asset: "SOL" }).empty.reason,
    /n = 10, mínimo 50/,
  );
  assert.equal(
    cards.card("consensus.technical", { asset: "ETH" }).latest.at,
    null,
    "asset contexts are isolated",
  );
  const riskParams = Object.fromEntries(
    cards
      .card("risk.manager")
      .work.parameters.map((row) => [row.name, row.value]),
  );
  assert.equal(riskParams.maxDrawdown, pipeline.risk.limits.maxDrawdown);
  assert.equal(
    cards
      .card("portfolio.manager")
      .work.parameters.find((row) => row.name === "rebalanceBand").value,
    portfolio.policy.rebalanceBand,
  );
  assert.equal(
    cards
      .card("execution.router")
      .work.parameters.find((row) => row.name === "slices").value,
    execution.policy.slices,
  );
  assert.equal(
    cards
      .card("research.backtest")
      .work.parameters.find((row) => row.name === "minObservations").value,
    research.policy.minObservations,
  );

  now += CARD_LIMITS.marketAgeMs + 1;
  assert.equal(cards.card("consensus.technical").inputs[0].state, "stale");
  assert.equal(
    cards.list().find((row) => row.id === "consensus.technical").state,
    "stale",
  );
  const invalid = structuredClone(cards.card("consensus.technical"));
  invalid.inputs[0].state = "live";
  assert.equal(validateEmployeeCard(invalid).valid, false);
  invalid.reliability.performance.value = 0.9;
  assert.equal(validateEmployeeCard(invalid).valid, false);
  assert.equal(validateEmployeeCard({}).valid, false);
  assert.throws(() => assertEmployeeCard({}), /invalid-employee-card/);

  cards.observe("intake.onchain", {
    source: "test",
    at: now,
    raw: {
      apiKey: "sensitive-test-value",
      evidence: ["sensitive-test-value", "token=another-test-value"],
      nested: { password: "must-disappear" },
      metrics: { signal: NaN },
    },
    inputs: [],
  });
  const safeText = JSON.stringify(cards.card("intake.onchain"));
  assert.equal(safeText.includes("sensitive-test-value"), false);
  assert.equal(safeText.includes("another-test-value"), false);
  assert.equal(safeText.includes("must-disappear"), false);

  for (let index = 0; index < 30; index++) {
    now++;
    cards.ingest({
      type: "pipeline.stage",
      asset: "SOL",
      stage: {
        name: "proposal",
        at: new Date(now).toISOString(),
        status: "ok",
        payload: { sizing: { qty: index } },
      },
    });
  }
  card = cards.card("risk.size", { asset: "SOL" });
  assert.equal(card.history.items.length, CARD_LIMITS.history);
  assert.equal(card.latest.raw.qty, 29);
  assert.equal(
    cards.observe("risk.size", {
      asset: "SOL",
      at: now - 100,
      source: "old",
      raw: { qty: 999 },
    }),
    false,
  );
  assert.equal(cards.observe("unknown", { at: now, raw: {} }), false);
  assert.equal(
    cards.observe("risk.size", { asset: "ADA", at: now, raw: {} }),
    false,
  );
  assert.equal(card.history.trend.value, 19);

  for (const [name, payload] of [
    ["risk", { approved: false, metrics: { drawdown: 0.12 } }],
    ["execution", { status: "filled", fill: { price: 100 } }],
    ["reconcile", { cash: 100 }],
    ["error", { message: "failure" }],
    ["intake", { candles: 20 }],
  ])
    cards.ingest({
      type: "pipeline.stage",
      asset: "BTC",
      stage: { name, at: new Date(now).toISOString(), status: "ok", payload },
    });
  assert.equal(cards.card("execution.broker").latest.raw.fill.price, 100);
  cards.ingest({
    type: "agent.result",
    result: {
      agent_id: "Social Sentiment Scanner",
      at: new Date(now).toISOString(),
      signal: -0.5,
    },
  });
  assert.equal(cards.card("intake.sentiment").latest.raw.signal, -0.5);
  cards.ingest({
    type: "market.ticker",
    data: {
      symbol: "ETH-USD",
      source: "fixture",
      price: 100,
      receivedAt: new Date(now).toISOString(),
    },
  });
  assert.equal(cards.card("sre.feeds", { asset: "ETH" }).latest.raw.price, 100);

  sources.dataService = {
    products: ["BTC-USD"],
    snapshot: () => {
      throw new Error("provider-down");
    },
  };
  assert.equal(cards.card("desk.sol").inputs[0].state, "error");
  assert.match(cards.card("desk.sol").empty.solution, /MARKET_PRODUCTS/);
  sources.dataService = {
    products: ["BTC-USD"],
    snapshot: (symbol) => ({
      symbol,
      ticker: {
        source: "fixture",
        price: 101,
        receivedAt: new Date(now).toISOString(),
      },
    }),
  };
  assert.equal(
    cards.card("desk.btc").latest.raw.signal,
    0.32,
    "market refresh must not replace the latest desk analysis",
  );
  sources.intelligenceDag = {
    maxSnapshotAgeMs: 21600000,
    minimumSources: 2,
    snapshot: (asset) => ({
      asset,
      asOf: now,
      nodes: [{ id: "news", signal: 0.2, confidence: 0.6, observations: 3 }],
      consensus: { status: "ready", signal: 0.3 },
      provenance: [
        { operation: "news", provider: "finnhub", records: 3, error: null },
      ],
    }),
  };
  assert.equal(
    cards.card("intake.intel", { asset: "BTC" }).latest.raw.status,
    "ready",
  );
  assert.equal(
    cards.card("intake.news", { asset: "BTC" }).inputs[0].maxAgeMs,
    sources.intelligenceDag.maxSnapshotAgeMs,
  );
  assert.ok(
    Buffer.byteLength(JSON.stringify(cards.card("intake.news"))) <
      CARD_LIMITS.cardBytes,
  );
  console.log(
    "employee card contract, source parameters, events, privacy and bounded histories: ok",
  );
  const matrix = Array.from({ length: 4 }, (_, asset) =>
    Array.from(
      { length: 180 },
      (_, index) => 0.001 * Math.sin(index + asset) + 0.0001,
    ),
  );
  const plan = await portfolio.plan({ returnsMatrix: matrix });
  assert.equal(
    cards.card("portfolio.allocation").latest.raw.observations,
    plan.observations,
  );
  const report = await research.evaluate({
    candidateId: "employee-card-test",
    returnsMatrix: matrix,
    returns: matrix[0],
  });
  assert.equal(
    cards.card("research.backtest").latest.raw.observations,
    report.observations,
  );
  assert.match(
    cards.card("research.backtest").inputs[0].name,
    /procedencia.*no declarada/,
  );
  cards.ingest({
    type: "execution.queued",
    result: {
      planId: "plan",
      queued: 2,
      parents: [{ createdAt: new Date(now).toISOString() }],
    },
  });
  assert.equal(cards.card("execution.router").latest.raw.queued, 2);
  cards.ingest({
    type: "execution.reconciled",
    reconciliation: {
      at: new Date(now).toISOString(),
      processed: 2,
      filled: 2,
    },
  });
  assert.equal(cards.card("execution.broker").latest.raw.filled, 2);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
