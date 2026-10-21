"use strict";
const crypto = require("node:crypto"),
  { schedule } = require("./router.js"),
  { ExecutionTca } = require("./tca.js"),
  { fromAtoms, toAtoms } = require("../math/fixed-decimal.js");
class ExecutionService {
  constructor({
    pipeline,
    portfolio,
    record = async () => {},
    publish = () => {},
    policy = {},
    tca = new ExecutionTca(),
  } = {}) {
    this.pipeline = pipeline;
    this.portfolio = portfolio;
    this.record = record;
    this.publish = publish;
    this.policy = {
      algorithm: "TWAP",
      slices: 6,
      participationRate: 0.1,
      intervalMs: 60000,
      ...policy,
    };
    this.tca = tca;
    this.parents = [];
    this.children = [];
    this.idempotency = new Map();
    this.metrics = {
      parents: 0,
      children: 0,
      fills: 0,
      rejected: 0,
      notional: 0,
      fees: 0,
    };
  }
  status() {
    return {
      paperOnly: true,
      policy: this.policy,
      metrics: { ...this.metrics },
      parents: this.parents.slice(-20).reverse(),
      queue: this.children.filter((x) => x.state === "queued").length,
      lastChildren: this.children.slice(-30).reverse(),
      portfolio: this.pipeline.ledger.snapshot(this.pipeline.marks()),
      tca: this.tca.snapshot(),
    };
  }
  async submit({
    planId,
    approvedBy,
    algorithm,
    prices = {},
    volumeProfiles = {},
    orderType = "market",
    limitPrices = {},
    stopPrices = {},
    idempotencyKey,
  } = {}) {
    if (typeof approvedBy !== "string" || approvedBy.trim().length < 3)
      throw Object.assign(new Error("human-approval-required"), {
        status: 403,
      });
    const plan = this.portfolio.plans.find((x) => x.id === planId);
    if (!plan)
      throw Object.assign(new Error("plan-not-found"), { status: 404 });
    const key = String(idempotencyKey || planId);
    if (this.idempotency.has(key)) return this.idempotency.get(key);
    if (this.pipeline.risk.halted)
      throw Object.assign(new Error("risk-halted"), { status: 409 });
    plan.approval = {
      required: true,
      state: "approved",
      approvedBy: approvedBy.trim(),
      approvedAt: new Date().toISOString(),
    };
    const created = [];
    for (const allocation of plan.allocations.filter(
      (x) => Math.abs(x.tradeNotional) >= 1,
    )) {
      const price = Number(
        prices[allocation.asset] ||
          prices[allocation.product] ||
          this.pipeline.marks()[allocation.product],
      );
      if (!(price > 0))
        throw Object.assign(new Error(`price-required:${allocation.asset}`), {
          status: 422,
        });
      const parent = {
          id: crypto.randomUUID(),
          planId,
          asset: allocation.asset,
          symbol: allocation.product,
          side: allocation.tradeNotional >= 0 ? "buy" : "sell",
          notional: Math.abs(allocation.tradeNotional),
          price,
          state: "scheduled",
          approvedBy: approvedBy.trim(),
          createdAt: new Date().toISOString(),
          paper: true,
          orderType,
          limitPrice: Number(
            limitPrices[allocation.asset] || limitPrices[allocation.product],
          ),
          stopPrice: Number(
            stopPrices[allocation.asset] || stopPrices[allocation.product],
          ),
        },
        route = schedule(
          { ...parent, marketVolumes: volumeProfiles[allocation.asset] },
          {
            ...this.policy,
            algorithm: algorithm || this.policy.algorithm,
            volumeProfile: volumeProfiles[allocation.asset] || [],
          },
        );
      parent.algorithm = algorithm || this.policy.algorithm;
      parent.slices = route.children.length;
      parent.residualNotional = route.residualNotional;
      this.parents.push(parent);
      this.children.push(...route.children);
      created.push(parent);
      this.metrics.parents++;
      this.metrics.children += route.children.length;
    }
    const result = {
      planId,
      approvedBy: approvedBy.trim(),
      parents: created,
      queued: this.children.filter((x) => x.state === "queued").length,
      paperOnly: true,
    };
    this.idempotency.set(key, result);
    await this.record("execution.submissions", result);
    this.publish({ type: "execution.queued", result });
    return result;
  }
  async drain({ spreadBps = 8, depthNotional = 250000, books = {} } = {}) {
    const results = [];
    for (const [symbol, book] of Object.entries(books))
      this.tca.observe(symbol, Number(book.mid), Date.now());
    for (const child of this.children.filter((x) => x.state === "queued")) {
      const parent = this.parents.find((x) => x.id === child.parentId),
        book =
          books[parent.symbol] ||
          books[parent.asset] ||
          this.pipeline.dataService?.books?.get(parent.symbol)?.snapshot(100) ||
          null,
        observedMarkouts = book?.mid
          ? this.tca.observe(parent.symbol, Number(book.mid), Date.now())
          : 0,
        effectiveSpreadBps = Number(book?.spreadBps ?? spreadBps),
        portfolio = this.pipeline.ledger.snapshot(this.pipeline.marks()),
        spec = this.pipeline.desks.assets[parent.asset],
        position = portfolio.positions[child.symbol],
        inferredReduceOnly =
          (child.side === "sell" &&
            Number(position?.qty || 0) > 0 &&
            child.qty <= Number(position?.qty || 0) + 1e-9) ||
          (child.side === "buy" &&
            Number(position?.qty || 0) < 0 &&
            child.qty <= Math.abs(Number(position?.qty || 0)) + 1e-9),
        proposal = {
          id: child.id,
          symbol: child.symbol,
          side: child.side,
          qty: child.qty,
          notional: child.notional,
          confidence: 1,
          maxWeight: spec.maxWeight,
          factor: spec.factor || spec.riskClass || parent.asset,
          type: child.orderType,
          limitPrice: child.limitPrice,
          stopPrice: child.stopPrice,
          reduceOnly: inferredReduceOnly,
        },
        review = this.pipeline.risk.evaluate(proposal, {
          equity: portfolio.equity,
          grossExposure: portfolio.grossExposure,
          assetExposure: Math.abs(position?.marketValue || 0),
          signedAssetExposure: position?.marketValue || 0,
          factorExposure: Object.entries(portfolio.positions).reduce(
            (sum, [product, currentPosition]) => {
              const assetSpec = Object.values(this.pipeline.desks.assets).find(
                (candidate) => candidate.product === product,
              );
              return (assetSpec?.factor || assetSpec?.riskClass) ===
                proposal.factor
                ? sum + Math.abs(currentPosition.marketValue)
                : sum;
            },
            0,
          ),
          dataStatus: "healthy",
          spreadBps: effectiveSpreadBps,
          exposures: Object.fromEntries(
            Object.entries(portfolio.positions).map(([k, v]) => [
              k,
              v.marketValue,
            ]),
          ),
        });
      child.risk = review;
      child.observedMarkouts = observedMarkouts;
      if (!review.approved) {
        child.state = "rejected";
        child.reason = review.failed.join(",");
        this.metrics.rejected++;
        results.push(child);
        continue;
      }
      const execution = this.pipeline.ledger.execute(proposal, {
        ...(book || {}),
        mid: book?.mid || parent.price,
        spreadBps: effectiveSpreadBps,
        depthNotional,
      });
      child.state = ["resting", "pending"].includes(execution.status)
        ? "queued"
        : execution.status;
      child.execution = execution;
      child.executedAt = new Date().toISOString();
      if (["filled", "partial"].includes(execution.status)) {
        this.metrics.fills++;
        this.metrics.notional = fromAtoms(
          toAtoms(this.metrics.notional) + toAtoms(execution.fill.notional),
        );
        this.metrics.fees = fromAtoms(
          toAtoms(this.metrics.fees) + toAtoms(execution.fill.fee),
        );
        const tca = this.tca.record(execution.fill, {
          arrivalMid: Number(book?.mid || parent.price),
          book,
        });
        child.tca = tca;
        await this.record("execution.tca", tca);
      } else this.metrics.rejected++;
      results.push(child);
    }
    for (const parent of this.parents) {
      const children = this.children.filter((x) => x.parentId === parent.id);
      if (children.length && !children.some((x) => x.state === "queued"))
        parent.state = children.every((x) => x.state === "filled")
          ? "filled"
          : children.some((x) => ["filled", "partial"].includes(x.state))
            ? "partial"
            : "rejected";
    }
    const reconciliation = {
      at: new Date().toISOString(),
      processed: results.length,
      filled: results.filter((x) => x.state === "filled").length,
      partial: results.filter((x) => x.state === "partial").length,
      rejected: results.filter((x) => x.state === "rejected").length,
      portfolio: this.pipeline.ledger.snapshot(this.pipeline.marks()),
      paperOnly: true,
      tca: this.tca.snapshot(),
    };
    await this.record("execution.reconciliations", reconciliation);
    this.publish({ type: "execution.reconciled", reconciliation });
    return reconciliation;
  }
}
module.exports = { ExecutionService };
