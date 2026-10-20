"use strict";

const { PAPER_ONLY } = require("../config/trading-mode.js"),
  { walkBook } = require("../execution/book.js");

const EPSILON = 1e-9;

class PaperLedger {
  constructor({
    cash = 100000,
    feeRate,
    makerFeeRate = feeRate ?? 0.001,
    takerFeeRate = feeRate ?? 0.001,
    latencyMs = 0,
    minNotional = 0,
    lotSize = 0,
    baseSlippageBps = 2,
    impactBps = 8,
  } = {}) {
    this.initialCash = cash;
    this.cash = cash;
    this.makerFeeRate = makerFeeRate;
    this.takerFeeRate = takerFeeRate;
    this.latencyMs = Math.max(0, Number(latencyMs) || 0);
    this.minNotional = Math.max(0, Number(minNotional) || 0);
    this.lotSize = Math.max(0, Number(lotSize) || 0);
    this.baseSlippageBps = baseSlippageBps;
    this.impactBps = impactBps;
    this.positions = new Map();
    this.fills = [];
    this.ids = new Set();
    this.snapshotUsage = new Map();
    this.objectUsage = new WeakMap();
  }
  usageFor(order, market) {
    if (market.used instanceof Map) return market.used;
    const identity =
      market.snapshotId ??
      (market.sequence != null || market.updatedAt != null
        ? `${order.symbol}:${market.sequence ?? "none"}:${market.updatedAt ?? "none"}`
        : null);
    if (identity !== null) {
      if (!this.snapshotUsage.has(identity))
        this.snapshotUsage.set(identity, new Map());
      if (this.snapshotUsage.size > 100)
        this.snapshotUsage.delete(this.snapshotUsage.keys().next().value);
      return this.snapshotUsage.get(identity);
    }
    if (market && typeof market === "object") {
      if (!this.objectUsage.has(market))
        this.objectUsage.set(market, new Map());
      return this.objectUsage.get(market);
    }
    return new Map();
  }
  validate(order, referencePrice) {
    const qty = Number(order.qty),
      minNotional = Math.max(
        0,
        Number(order.minNotional ?? this.minNotional) || 0,
      ),
      lotSize = Math.max(0, Number(order.lotSize ?? this.lotSize) || 0);
    if (!(qty > 0)) return "invalid-quantity";
    if (
      lotSize > 0 &&
      Math.abs(qty / lotSize - Math.round(qty / lotSize)) > EPSILON
    )
      return "invalid-lot-size";
    if (referencePrice * qty + EPSILON < minNotional)
      return "below-min-notional";
    return null;
  }
  execute(order, market = {}) {
    if (this.ids.has(order.id))
      return { status: "rejected", reason: "duplicate-id" };
    const type = String(
        order.type || order.orderType || "market",
      ).toLowerCase(),
      side = order.side === "sell" ? "sell" : "buy",
      sign = side === "buy" ? 1 : -1,
      limitPrice = Number(order.limit ?? order.limitPrice),
      stopPrice = Number(order.stop ?? order.stopPrice),
      asks = (market.asks || []).map((x) => ({
        price: levelValue(x, 0),
        size: levelValue(x, 1),
        side: "ask",
      })),
      bids = (market.bids || []).map((x) => ({
        price: levelValue(x, 0),
        size: levelValue(x, 1),
        side: "bid",
      })),
      hasBook = Array.isArray(market.asks) || Array.isArray(market.bids),
      levels = side === "buy" ? asks : bids,
      bestPrice = levels[0]?.price || 0,
      mid = Number(market.mid || market.price || bestPrice),
      referencePrice = limitPrice > 0 ? limitPrice : mid || bestPrice,
      validation = this.validate(order, referencePrice);
    if (validation) return { status: "rejected", reason: validation };

    if (type === "limit") {
      if (!(limitPrice > 0))
        return { status: "rejected", reason: "limit-price-required" };
      const crossed =
        bestPrice > 0 &&
        (side === "buy" ? bestPrice <= limitPrice : bestPrice >= limitPrice);
      if (levels.length && !crossed)
        return { status: "resting", reason: "limit-not-crossed" };
      if (
        !levels.length &&
        mid > 0 &&
        (side === "buy" ? mid > limitPrice : mid < limitPrice)
      )
        return { status: "resting", reason: "limit-not-crossed" };
    }
    if (type === "stop-market" || type === "stop") {
      if (!(stopPrice > 0))
        return { status: "rejected", reason: "stop-price-required" };
      const trigger = bestPrice || mid,
        triggered =
          trigger > 0 &&
          (side === "buy" ? trigger >= stopPrice : trigger <= stopPrice);
      if (!triggered)
        return { status: "pending", reason: "stop-not-triggered" };
    }

    const submittedAt = new Date().toISOString(),
      used = this.usageFor(order, market),
      stagedUsed = new Map(used),
      isLimit = type === "limit";
    let qty = Number(order.qty),
      price,
      slippageBps = 0,
      fillModel,
      liquidity = [];
    if (hasBook) {
      const walked = walkBook(
        levels,
        qty,
        isLimit ? limitPrice : null,
        stagedUsed,
      );
      qty = walked.filledQty;
      if (!(qty > 0))
        return { status: "rejected", reason: "insufficient-liquidity" };
      price = isLimit ? limitPrice : walked.averagePrice;
      liquidity = walked.fills;
      fillModel = "l2";
    } else {
      if (!(mid > 0))
        return { status: "rejected", reason: "market-price-required" };
      const spreadBps = Number(market.spreadBps || 0),
        depthNotional = Math.max(
          1,
          Number(market.depthNotional || mid * qty * 10),
        ),
        participation = Math.min(1, (mid * qty) / depthNotional);
      slippageBps =
        this.baseSlippageBps + spreadBps / 2 + participation * this.impactBps;
      price = isLimit ? limitPrice : mid * (1 + (sign * slippageBps) / 10000);
      fillModel = "impact";
    }
    const liquidityRole = isLimit ? "maker" : "taker",
      feeRate = isLimit ? this.makerFeeRate : this.takerFeeRate,
      notional = price * qty,
      fee = notional * feeRate,
      pos = this.positions.get(order.symbol) || {
        qty: 0,
        avgPrice: 0,
        realizedPnl: 0,
      };
    if (side === "buy" && notional + fee > this.cash)
      return { status: "rejected", reason: "insufficient-cash" };

    for (const [key, value] of stagedUsed) used.set(key, value);
    this.ids.add(order.id);
    let realized = 0;
    if (sign !== Math.sign(pos.qty) && pos.qty !== 0) {
      const closing = Math.min(Math.abs(pos.qty), qty);
      realized = closing * (price - pos.avgPrice) * Math.sign(pos.qty);
      pos.realizedPnl += realized;
    }
    const newQty = pos.qty + sign * qty;
    if (pos.qty === 0 || Math.sign(pos.qty) === sign)
      pos.avgPrice =
        (Math.abs(pos.qty) * pos.avgPrice + qty * price) /
        (Math.abs(pos.qty) + qty);
    else if (newQty === 0) pos.avgPrice = 0;
    else if (Math.sign(newQty) !== Math.sign(pos.qty)) pos.avgPrice = price;
    pos.qty = newQty;
    this.cash -= sign * notional + fee;
    this.positions.set(order.symbol, pos);
    const fill = {
      id: order.id,
      symbol: order.symbol,
      side,
      orderType: type,
      requestedQty: Number(order.qty),
      qty,
      price,
      mid,
      notional,
      fee,
      feeRate,
      liquidityRole,
      fillModel,
      latencyMs: this.latencyMs,
      submittedAt,
      filledAt: new Date(Date.now() + this.latencyMs).toISOString(),
      slippageBps,
      liquidity,
      realizedPnl: realized,
      paper: PAPER_ONLY,
      at: new Date().toISOString(),
    };
    this.fills.push(fill);
    return {
      status: qty + EPSILON < Number(order.qty) ? "partial" : "filled",
      fill,
      remainingQty: Math.max(0, Number(order.qty) - qty),
    };
  }
  snapshot(marks = {}) {
    let marketValue = 0,
      unrealizedPnl = 0,
      grossExposure = 0,
      realizedPnl = 0;
    const positions = {};
    for (const [symbol, p] of this.positions) {
      const mark = Number(marks[symbol] || p.avgPrice),
        value = p.qty * mark,
        unrealized = (mark - p.avgPrice) * p.qty;
      marketValue += value;
      grossExposure += Math.abs(value);
      unrealizedPnl += unrealized;
      realizedPnl += p.realizedPnl;
      positions[symbol] = {
        ...p,
        mark,
        marketValue: value,
        unrealizedPnl: unrealized,
      };
    }
    const fees = this.fills.reduce((a, x) => a + x.fee, 0),
      equity = this.cash + marketValue;
    return {
      initialCash: this.initialCash,
      cash: this.cash,
      equity,
      marketValue,
      grossExposure,
      realizedPnl,
      unrealizedPnl,
      fees,
      fills: this.fills.length,
      positions,
    };
  }
  export() {
    return {
      initialCash: this.initialCash,
      cash: this.cash,
      makerFeeRate: this.makerFeeRate,
      takerFeeRate: this.takerFeeRate,
      latencyMs: this.latencyMs,
      minNotional: this.minNotional,
      lotSize: this.lotSize,
      baseSlippageBps: this.baseSlippageBps,
      impactBps: this.impactBps,
      positions: Object.fromEntries(this.positions),
      fills: this.fills,
      ids: [...this.ids],
      paperOnly: PAPER_ONLY,
    };
  }
  restore(x = {}) {
    if (x.paperOnly === false)
      throw new Error("paper-only-checkpoint-required");
    if (
      !Number.isFinite(x.cash) ||
      !Array.isArray(x.fills) ||
      !Array.isArray(x.ids)
    )
      throw new Error("invalid-ledger-checkpoint");
    this.initialCash = x.initialCash;
    this.cash = x.cash;
    this.makerFeeRate = x.makerFeeRate ?? x.feeRate ?? 0.001;
    this.takerFeeRate = x.takerFeeRate ?? x.feeRate ?? 0.001;
    this.latencyMs = x.latencyMs || 0;
    this.minNotional = x.minNotional || 0;
    this.lotSize = x.lotSize || 0;
    this.baseSlippageBps = x.baseSlippageBps;
    this.impactBps = x.impactBps;
    this.positions = new Map(Object.entries(x.positions || {}));
    this.fills = x.fills;
    this.ids = new Set(x.ids);
    this.snapshotUsage = new Map();
    this.objectUsage = new WeakMap();
    return this;
  }
}

function levelValue(level, index) {
  return Number(
    Array.isArray(level) ? level[index] : level?.[index ? "size" : "price"],
  );
}

module.exports = { PaperLedger, walkBook };
