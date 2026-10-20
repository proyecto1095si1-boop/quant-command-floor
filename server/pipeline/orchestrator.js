"use strict";
const crypto = require("node:crypto"),
  { DeskRegistry } = require("../desks/registry.js"),
  { RiskGate } = require("./risk-gate.js"),
  { PaperLedger } = require("./paper-ledger.js"),
  { Sha256AuditChain } = require("./audit.js"),
  RM = require("../risk/math.js");
class TradingPipeline {
  constructor({
    dataService,
    desks = new DeskRegistry(),
    risk = new RiskGate(),
    ledger = new PaperLedger(),
    regime = null,
    publish = () => {},
  } = {}) {
    this.dataService = dataService;
    this.desks = desks;
    this.risk = risk;
    this.ledger = ledger;
    this.regime = regime;
    this.publish = publish;
    this.audit = new Sha256AuditChain();
    this.runs = new Map();
    this.locks = new Set();
    this.metrics = { runs: 0, fills: 0, vetos: 0, noTrade: 0, errors: 0 };
  }
  stage(run, name, status, payload = {}) {
    const row = { name, status, at: new Date().toISOString(), payload };
    run.stages.push(row);
    this.audit.append(`pipeline.${name}`, { runId: run.id, status, payload });
    this.dataService
      ?.record?.(`pipeline.${run.asset}`, { runId: run.id, ...row })
      ?.catch(() => {});
    this.publish({
      type: "pipeline.stage",
      runId: run.id,
      asset: run.asset,
      stage: row,
    });
    return row;
  }
  marks() {
    const out = {};
    for (const spec of Object.values(this.desks.assets)) {
      const ticker = this.dataService?.tickers?.get(spec.product);
      if (ticker) out[spec.product] = ticker.price;
    }
    return out;
  }
  async run(asset, options = {}) {
    const id = String(options.runId || crypto.randomUUID());
    if (this.runs.has(id)) return this.runs.get(id);
    if (this.locks.has(asset))
      throw Object.assign(new Error("asset-pipeline-busy"), { status: 409 });
    const spec = this.desks.assets[asset];
    if (!spec) throw Object.assign(new Error("unknown-asset"), { status: 404 });
    const run = {
      id,
      asset,
      product: spec.product,
      status: "running",
      startedAt: new Date().toISOString(),
      stages: [],
    };
    this.runs.set(id, run);
    this.locks.add(asset);
    this.metrics.runs++;
    try {
      this.stage(run, "intake", "running");
      const context =
        options.context ||
        (await this.dataService.analysisContext(spec.product));
      this.stage(run, "intake", "ok", {
        candles: context.candles.length,
        trades: context.trades.length,
        quality: context.quality.status,
      });
      const desk = this.desks.analyze(asset, context);
      run.desk = desk;
      this.stage(run, "signal", desk.status, {
        action: desk.action,
        signal: desk.signal,
        confidence: desk.confidence,
        blockers: desk.blockers,
      });
      if (desk.action === "NO_TRADE" || desk.action === "FLAT") {
        run.status = "no-trade";
        this.metrics.noTrade++;
        this.stage(run, "execution", "skipped", { reason: desk.action });
        return await this.finish(run);
      }
      const marks = this.marks(),
        portfolio = this.ledger.snapshot(marks),
        price = Number(
          context.ticker?.price ||
            context.book?.mid ||
            context.candles.at(-1)?.close,
        ),
        assetReturns = RM.returns(context.candles.map((x) => x.close)),
        atr =
          desk.agents.find((x) => x.agent === "Technical")?.metrics.atr || 0,
        sizing = this.risk.size({
          equity: portfolio.equity,
          price,
          atr,
          maxWeight: desk.policy.maxPortfolioWeight,
          returns: assetReturns,
          winRate: options.winRate,
          payoff: options.payoff,
        }),
        side = desk.action === "LONG" ? "buy" : "sell",
        proposal = {
          id: `${id}:order`,
          symbol: spec.product,
          side,
          qty: sizing.qty,
          notional: sizing.qty * price,
          confidence: desk.confidence,
          maxWeight: desk.policy.maxPortfolioWeight,
          stopDistance: sizing.stopDistance,
          sizing,
        };
      run.proposal = proposal;
      this.stage(run, "proposal", "ok", proposal);
      const current = portfolio.positions[spec.product],
        exposures = Object.fromEntries(
          Object.entries(portfolio.positions).map(([k, v]) => [
            k,
            v.marketValue,
          ]),
        ),
        riskContext = {
          equity: portfolio.equity,
          grossExposure: portfolio.grossExposure,
          assetExposure: Math.abs(current?.marketValue || 0),
          exposures,
          dataStatus: context.quality.status,
          returns: assetReturns,
          drawdown: options.drawdown || 0,
          var: options.var || 0,
          cvar: options.cvar || 0,
          correlation: options.correlation || 0,
          spreadBps: context.book?.spreadBps || 0,
        },
        review = this.risk.evaluate(proposal, riskContext);
      run.risk = review;
      this.stage(run, "risk", review.approved ? "approved" : "veto", review);
      if (!review.approved) {
        run.status = "veto";
        this.metrics.vetos++;
        return await this.finish(run);
      }
      const depthNotional = [
          ...(context.book?.bids || []),
          ...(context.book?.asks || []),
        ].reduce((a, x) => a + x.price * x.size, 0),
        execution = this.ledger.execute(proposal, {
          ...(context.book || {}),
          mid: price,
          spreadBps: riskContext.spreadBps,
          depthNotional,
        });
      run.execution = execution;
      this.stage(run, "execution", execution.status, execution);
      if (!["filled", "partial"].includes(execution.status)) {
        run.status = "rejected";
        return await this.finish(run);
      }
      this.metrics.fills++;
      run.portfolio = this.ledger.snapshot({ ...marks, [spec.product]: price });
      this.stage(run, "reconcile", "ok", {
        equity: run.portfolio.equity,
        cash: run.portfolio.cash,
        fees: run.portfolio.fees,
        position: run.portfolio.positions[spec.product],
      });
      run.status = "completed";
      return await this.finish(run);
    } catch (error) {
      run.status = "error";
      run.error = error.message;
      this.metrics.errors++;
      this.stage(run, "error", "error", { message: error.message });
      return await this.finish(run);
    } finally {
      this.locks.delete(asset);
    }
  }
  async finish(run) {
    run.finishedAt = new Date().toISOString();
    run.audit = this.audit.verify();
    await this.dataService?.record?.("pipeline.runs", run);
    await this.checkpoint(run.finishedAt);
    this.publish({ type: "pipeline.finished", run });
    return run;
  }
  async checkpoint(receivedAt = new Date().toISOString()) {
    await this.dataService?.record?.("pipeline.checkpoints", {
      receivedAt,
      ledger: this.ledger.export(),
      audit: this.audit.export(),
      metrics: this.metrics,
      risk: {
        halted: this.risk.halted,
        reason: this.risk.reason,
        highWater: this.risk.highWater,
      },
    });
  }
  async halt(reason = "manual", actor = "system") {
    this.risk.halt(String(reason));
    const event = {
      action: "halt",
      reason: this.risk.reason,
      actor: String(actor || "system"),
      at: new Date().toISOString(),
      paperOnly: true,
    };
    this.audit.append("pipeline.control", event);
    await this.dataService?.record?.("pipeline.controls", event);
    await this.checkpoint(event.at);
    this.publish({ type: "pipeline.control", event });
    return this.status();
  }
  async resume(actor = "system") {
    const previousReason = this.risk.reason || "resume-persistence-failed";
    this.risk.resume();
    const event = {
      action: "resume",
      actor: String(actor || "system"),
      at: new Date().toISOString(),
      paperOnly: true,
    };
    try {
      this.audit.append("pipeline.control", event);
      await this.dataService?.record?.("pipeline.controls", event);
      await this.checkpoint(event.at);
      this.publish({ type: "pipeline.control", event });
      return this.status();
    } catch (error) {
      this.risk.halt(previousReason);
      throw error;
    }
  }
  async recover() {
    const rows = await this.dataService?.store?.tail?.(
        "pipeline.checkpoints",
        1,
      ),
      checkpoint = rows?.at(-1);
    if (!checkpoint) return { recovered: false };
    this.ledger.restore(checkpoint.ledger);
    this.audit.restore(checkpoint.audit);
    this.metrics = { ...this.metrics, ...checkpoint.metrics };
    if (checkpoint.risk?.halted) this.risk.halt(checkpoint.risk.reason);
    this.risk.highWater = checkpoint.risk?.highWater || this.ledger.initialCash;
    return {
      recovered: true,
      fills: this.ledger.fills.length,
      audit: this.audit.verify(),
    };
  }
  status() {
    return {
      paperOnly: true,
      halted: this.risk.halted,
      haltReason: this.risk.reason,
      metrics: { ...this.metrics },
      portfolio: this.ledger.snapshot(this.marks()),
      risk: this.risk.status(),
      audit: this.audit.verify(),
      active: [...this.locks],
    };
  }
  get(id) {
    return this.runs.get(id) || null;
  }
}
module.exports = { TradingPipeline };
