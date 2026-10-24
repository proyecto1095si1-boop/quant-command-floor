"use strict";

// Offline capture: call the actual engines, never write files or contact feeds.
const { EMPLOYEE_REGISTRY } = require("../../server/employees/registry.js"),
  { EmployeeCards } = require("../../server/employees/service.js"),
  { specificationFor } = require("../../server/employees/specifications.js"),
  { DeskRegistry } = require("../../server/desks/registry.js"),
  { TradingPipeline } = require("../../server/pipeline/orchestrator.js"),
  { ResearchLab, seededReturns } = require("../../server/research/lab.js"),
  { PortfolioService } = require("../../server/portfolio/service.js"),
  { ExecutionService } = require("../../server/execution/service.js"),
  { SreService } = require("../../server/sre/service.js"),
  { execute } = require("../../server/agent-engine.js"),
  { newsNode, consensus } = require("../../server/intelligence/dag.js");

async function captureEmployeeEvents() {
  const now = Date.now(),
    cards = new EmployeeCards({ clock: () => Date.now() + 1000 }),
    rows = new Map(),
    sources = {},
    capture = (id, raw, source, asset = null, expectedPaths = []) => {
      const employee = EMPLOYEE_REGISTRY.find((row) => row.id === id);
      if (raw !== null) cards.observe(id, { raw, asset, source, at: now });
      rows.set(id, {
        id,
        asset,
        source,
        observed: raw !== null,
        raw:
          raw === null
            ? {}
            : cards.rows.get(`${id}:${asset || "global"}`)[0].raw,
        parameters: specificationFor(employee, sources).work.parameters,
        expectedPaths,
      });
    },
    candles = Array.from({ length: 100 }, (_, i) => ({
      open: 100 + i,
      high: 104 + i,
      low: 98 + i,
      close: 101 + i + Math.sin(i),
      volume: 10 + i,
    })),
    trades = Array.from({ length: 40 }, (_, i) => ({
      price: 200,
      size: 1 + i / 10,
      side: i % 3 ? "buy" : "sell",
    })),
    book = {
      mid: 200,
      spreadBps: 2,
      bids: [{ price: 199.98, size: 10 }],
      asks: [{ price: 200.02, size: 12 }],
    },
    news = newsNode(
      [
        {
          id: "n1",
          headline: "Bitcoin BTC adoption approval",
          summary: "Bitcoin upgrade",
          url: "https://example.test/bitcoin",
          publishedAt: now - 1000,
          receivedAt: now,
          source: "offline-fixture",
        },
      ],
      now,
      "BTC",
    ),
    intel = {
      consensus: consensus([news], 1),
      nodes: [news],
      hash: "fixture",
      asOf: now,
    },
    desks = (sources.desks = new DeskRegistry()),
    pipeline = (sources.pipeline = new TradingPipeline({ desks })),
    portfolio = (sources.portfolio = new PortfolioService({ pipeline })),
    research = (sources.research = new ResearchLab()),
    execution = (sources.execution = new ExecutionService({
      pipeline,
      portfolio,
    }));
  pipeline.dataService = {
    tickers: new Map(
      ["BTC", "ETH", "SOL", "BNB"].map((asset) => [
        `${asset}-USD`,
        { price: 200 },
      ]),
    ),
    health: () => ({ status: "healthy" }),
  };
  sources.intelligenceDag = { maxSnapshotAgeMs: 60000, minimumSources: 1 };
  const market = {
    price: 200,
    bid: 199.98,
    ask: 200.02,
    bookLevels: { bids: 1, asks: 1 },
  };
  capture(
    "intake.data",
    market,
    "EmployeeCards.ingest(market.snapshot): ticker/book projection",
    "BTC",
    ["price", "bid", "ask"],
  );
  capture(
    "sre.feeds",
    market,
    "EmployeeCards.ingest(market.snapshot): ticker/book projection",
    "BTC",
    ["price"],
  );
  capture(
    "intake.news",
    news,
    "newsNode: real lexical news calculation",
    "BTC",
    ["observations", "signal", "confidence"],
  );
  capture(
    "intake.intel",
    intel.consensus,
    "IntelligenceDag.consensus([newsNode], 1)",
    "BTC",
    ["signal", "coverage"],
  );
  for (const [id, handler, input, paths] of [
    [
      "intake.sentiment",
      "Social Sentiment Scanner",
      { text: "Bitcoin bullish growth buy but hack" },
      ["signal", "confidence"],
    ],
    [
      "intake.onchain",
      "On-Chain Analyst",
      { history: [1, 2, 3, 4, 5], net_flow: 9, destination: "exchange" },
      ["signal", "confidence"],
    ],
    [
      "sre.anomaly",
      "Anomaly Detector",
      { samples: [10, 11, 12, 13, 14], current: 80 },
      ["signal", "confidence"],
    ],
  ])
    capture(
      id,
      execute(handler, input),
      `agent-engine.execute(${handler}): controlled manual input`,
      id.startsWith("intake.") ? "BTC" : null,
      paths,
    );
  for (const asset of ["BTC", "ETH", "SOL", "BNB"]) {
    const report = desks.analyze(asset, {
      candles,
      trades,
      book,
      intelligence: intel,
    });
    cards.ingest({ type: "desk.analysis", report });
    const raw = cards.rows.get(`desk.${asset.toLowerCase()}:${asset}`)[0].raw;
    capture(
      `desk.${asset.toLowerCase()}`,
      raw,
      `DeskRegistry.analyze(${asset}): actual EmployeeCards report projection`,
      asset,
      ["signal", "confidence", "agreement"],
    );
    if (asset === "BTC") {
      for (const row of report.agents.filter(
        (row) => row.agent !== "Intel Hub",
      )) {
        const id = EMPLOYEE_REGISTRY.find(
          (employee) => employee.agent === row.agent,
        ).id;
        capture(id, row, `server/desks/agents.js:${row.agent}`, asset, [
          "signal",
          "confidence",
        ]);
      }
      capture(
        "consensus.signal",
        report.consensus,
        "ConsensusEngine.combine via DeskRegistry.analyze",
        asset,
        ["signal", "confidence", "effectiveAgents"],
      );
    }
  }
  const sizing = pipeline.risk.size({
      equity: 100000,
      price: 200,
      atr: 3,
      returns: seededReturns(11, 0.0005, 100),
      maxWeight: 0.35,
    }),
    riskReview = pipeline.risk.evaluate(
      {
        id: "fixture",
        symbol: "BTC-USD",
        side: "buy",
        qty: 1,
        notional: 200,
        confidence: 0.8,
        maxWeight: 0.35,
        factor: "crypto-core",
      },
      { equity: 100000, dataStatus: "healthy", drawdown: 0.03, spreadBps: 2 },
    );
  capture("risk.manager", riskReview, "RiskGate.evaluate", "BTC", [
    "checks.length",
    "failed.length",
    "metrics.drawdown",
  ]);
  capture("risk.drawdown", riskReview, "RiskGate.evaluate.metrics", "BTC", [
    "metrics.drawdown",
  ]);
  capture("risk.exposure", riskReview, "RiskGate.evaluate.metrics", "BTC", [
    "metrics.postGrossExposure",
    "metrics.postAssetWeight",
  ]);
  capture("risk.size", sizing, "RiskGate.size", "BTC", [
    "qty",
    "riskBudget",
    "stopDistance",
  ]);
  const fill = pipeline.ledger.execute(
    { id: "fixture-fill", symbol: "BTC-USD", side: "buy", qty: 1 },
    { price: 200, ...book },
  );
  capture(
    "execution.broker",
    fill,
    "PaperLedger.execute against synthetic L2",
    "BTC",
    ["fill.qty", "fill.price", "fill.fee"],
  );
  capture(
    "portfolio.manager",
    pipeline.ledger.snapshot({ "BTC-USD": 200 }),
    "PaperLedger.snapshot",
    null,
    ["equity", "cash", "fees"],
  );
  pipeline.audit.append("fixture", { paperOnly: true });
  capture(
    "audit.writer",
    pipeline.audit.verify(),
    "Sha256AuditChain.verify",
    null,
    ["count"],
  );
  const matrix = [0, 1, 2, 3].map((i) => seededReturns(40 + i, 0.0005, 160)),
    plan = await portfolio.plan({ returnsMatrix: matrix }),
    report = await research.evaluate({
      returns: matrix[0],
      returnsMatrix: matrix,
    });
  capture(
    "portfolio.allocation",
    plan,
    "PortfolioService.plan: synthetic returns, not exchange history",
    null,
    ["observations", "equity", "cashTarget"],
  );
  capture(
    "portfolio.rebalance",
    plan,
    "PortfolioService.plan.rebalancing: synthetic returns",
    null,
    ["rebalancing.turnover", "rebalancing.band"],
  );
  capture(
    "research.backtest",
    report,
    "ResearchLab.evaluate: seeded synthetic returns",
    null,
    ["observations", "metrics.sharpe", "metrics.pbo"],
  );
  capture(
    "research.walkforward",
    report,
    "ResearchLab.evaluate: actual purged-k-fold, not walk-forward optimization",
    null,
    ["observations", "folds.length", "metrics.oosSharpe"],
  );
  const submitted = await execution.submit({
    planId: plan.id,
    approvedBy: "Offline fixture human",
    prices: { BTC: 200, ETH: 200, SOL: 200, BNB: 200 },
  });
  capture(
    "execution.router",
    submitted,
    "ExecutionService.submit: actual queued event, no routing totals fabricated",
    null,
    ["parents.length", "queued"],
  );
  capture(
    "execution.queue",
    execution.status(),
    "ExecutionService.status",
    null,
    ["queue", "metrics.fills"],
  );
  const sre = (sources.sre = new SreService({
    pipeline,
    portfolio,
    execution,
    research,
    dataService: {
      health: () => ({
        status: "healthy",
        cycleAgeMs: 100,
        stream: { status: "open" },
      }),
    },
    gatewayMetrics: {
      requests: 1000,
      statuses: { 200: 999, 500: 1 },
      latencies: [10, 20, 30, 40],
    },
  }));
  capture(
    "sre.api",
    await sre.snapshot(),
    "SreService.snapshot: controlled gateway telemetry",
    null,
    ["slis.availability", "slis.p95LatencyMs", "slis.dataFreshnessMs"],
  );
  capture(
    "research.miner",
    null,
    "No backend executor: intentionally no fabricated event",
    null,
    [],
  );
  return EMPLOYEE_REGISTRY.map((employee) => rows.get(employee.id));
}
module.exports = { captureEmployeeEvents };
