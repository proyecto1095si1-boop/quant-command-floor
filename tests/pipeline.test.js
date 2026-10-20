const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { TradingPipeline } = require("../server/pipeline/orchestrator.js"),
  { RiskGate } = require("../server/pipeline/risk-gate.js"),
  { PaperLedger } = require("../server/pipeline/paper-ledger.js"),
  { Sha256AuditChain } = require("../server/pipeline/audit.js"),
  { JsonlStore } = require("../server/data/jsonl-store.js");
const context = {
  candles: Array.from({ length: 60 }, (_, i) => ({
    open: 100 + i,
    high: 102 + i,
    low: 99 + i,
    close: 101 + i,
    volume: 100,
  })),
  trades: Array.from({ length: 30 }, (_, i) => ({
    tradeId: String(i),
    price: 160,
    size: 1,
    side: "buy",
  })),
  book: {
    mid: 160,
    spreadBps: 2,
    bids: [{ price: 159.9, size: 1000 }],
    asks: [{ price: 160.1, size: 1000 }],
  },
  ticker: { price: 160 },
  quality: { status: "healthy" },
};
const desk = {
  assets: { BTC: { product: "BTC-USD", maxWeight: 0.35 } },
  analyze: () => ({
    status: "ok",
    action: "LONG",
    signal: 0.8,
    confidence: 0.8,
    blockers: [],
    agents: [{ agent: "Technical", metrics: { atr: 2 } }],
    policy: { maxPortfolioWeight: 0.35, riskClass: "major" },
  }),
};
(async () => {
  const recorded = [],
    data = {
      analysisContext: async () => context,
      record: async (stream, event) => recorded.push({ stream, event }),
      tickers: new Map([["BTC-USD", { price: 160 }]]),
    },
    ledger = new PaperLedger({ cash: 100000 }),
    pipeline = new TradingPipeline({ dataService: data, desks: desk, ledger });
  const run = await pipeline.run("BTC", { runId: "run-1" });
  assert.equal(run.status, "completed");
  assert.equal(run.execution.status, "filled");
  assert.equal(run.execution.fill.fillModel, "l2");
  assert.equal(
    run.stages.map((x) => x.name).join(","),
    "intake,intake,signal,proposal,risk,execution,reconcile",
  );
  assert.equal(pipeline.status().portfolio.fills, 1);
  const duplicate = await pipeline.run("BTC", { runId: "run-1" });
  assert.equal(duplicate.id, run.id);
  assert.equal(pipeline.status().portfolio.fills, 1);
  pipeline.risk.halt("test");
  const veto = await pipeline.run("BTC", { runId: "run-2" });
  assert.equal(veto.status, "veto");
  assert.ok(veto.risk.failed.includes("system"));
  assert.equal(pipeline.audit.verify().valid, true);
  assert.equal(pipeline.audit.verify().head.length, 64);
  assert.ok(recorded.length > 0);
  const marks = ledger.snapshot({ "BTC-USD": 170 });
  assert.ok(marks.unrealizedPnl > 0);
  const impactPipeline = new TradingPipeline({
      dataService: data,
      desks: desk,
      ledger: new PaperLedger({ cash: 100000 }),
    }),
    impactRun = await impactPipeline.run("BTC", {
      runId: "impact-1",
      context: { ...context, book: null },
    }),
    impactAudit = impactPipeline.audit.rows.find(
      (row) => row.type === "pipeline.execution",
    );
  assert.equal(impactRun.execution.fill.fillModel, "impact");
  assert.equal(impactAudit.payload.payload.fill.fillModel, "impact");
  const chain = new Sha256AuditChain();
  chain.append("x", { a: 1 });
  chain.rows[0].payload.a = 2;
  assert.equal(chain.verify().valid, false);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qcf-pipeline-")),
    store = new JsonlStore(dir),
    durableData = {
      ...data,
      store,
      record: (stream, event) => store.append(stream, event),
    },
    durable = new TradingPipeline({ dataService: durableData, desks: desk });
  await durable.run("BTC", { runId: "durable-1" });
  await store.flush();
  const restored = new TradingPipeline({
      dataService: durableData,
      desks: desk,
    }),
    recovery = await restored.recover();
  assert.equal(recovery.recovered, true);
  assert.equal(restored.ledger.fills.length, 1);
  assert.equal(restored.audit.verify().valid, true);
  fs.rmSync(dir, { recursive: true });
  let release;
  const slowData = {
      ...data,
      analysisContext: () => new Promise((r) => (release = () => r(context))),
    },
    slow = new TradingPipeline({ dataService: slowData, desks: desk }),
    first = slow.run("BTC", { runId: "slow-1" });
  await new Promise((r) => setImmediate(r));
  await assert.rejects(
    () => slow.run("BTC", { runId: "slow-2" }),
    /asset-pipeline-busy/,
  );
  release();
  await first;
  console.log("pipeline tests: ok");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
