"use strict";

const { PAPER_ONLY } = require("../config/trading-mode.js"),
  { walkBook } = require("../execution/book.js"),
  {
    decimalString,
    divideRounded,
    fromAtoms,
    multiplyAtoms,
    toAtoms,
  } = require("../math/fixed-decimal.js");

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
    this.initialCashAtoms = toAtoms(cash);
    this.cashAtoms = this.initialCashAtoms;
    this.initialCash = fromAtoms(this.initialCashAtoms);
    this.cash = fromAtoms(this.cashAtoms);
    this.makerFeeRate = makerFeeRate;
    this.takerFeeRate = takerFeeRate;
    this.latencyMs = Math.max(0, Number(latencyMs) || 0);
    this.minNotional = Math.max(0, Number(minNotional) || 0);
    this.lotSize = Math.max(0, Number(lotSize) || 0);
    this.baseSlippageBps = baseSlippageBps;
    this.impactBps = impactBps;
    this.positions = new Map();
    this.atomicPositions = new Map();
    this.fills = [];
    this.totalFeesAtoms = 0n;
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
    let qtyAtoms, lotAtoms, referenceAtoms, minimumAtoms;
    try {
      qtyAtoms = toAtoms(qty);
      lotAtoms = toAtoms(lotSize);
      referenceAtoms = toAtoms(referencePrice);
      minimumAtoms = toAtoms(minNotional);
    } catch {
      return "invalid-decimal";
    }
    if (!(qty > 0) || qtyAtoms <= 0n) return "invalid-quantity";
    if (lotAtoms > 0n && qtyAtoms % lotAtoms !== 0n) return "invalid-lot-size";
    if (multiplyAtoms(referenceAtoms, qtyAtoms) < minimumAtoms)
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
    if (toAtoms(referencePrice) <= 0n)
      return { status: "rejected", reason: "invalid-price-precision" };

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
      priceAtoms = toAtoms(price),
      qtyAtoms = toAtoms(qty),
      notionalAtoms = multiplyAtoms(priceAtoms, qtyAtoms),
      feeAtoms = multiplyAtoms(notionalAtoms, toAtoms(feeRate)),
      notional = fromAtoms(notionalAtoms),
      fee = fromAtoms(feeAtoms),
      atomicPos = this.atomicPositions.get(order.symbol) || {
        qty: 0n,
        avgPrice: 0n,
        costBasis: 0n,
        realizedPnl: 0n,
      },
      pos = this.positions.get(order.symbol) || {
        qty: 0,
        avgPrice: 0,
        realizedPnl: 0,
      };
    if (side === "buy" && notionalAtoms + feeAtoms > this.cashAtoms)
      return { status: "rejected", reason: "insufficient-cash" };

    qty = fromAtoms(qtyAtoms);
    price = fromAtoms(priceAtoms);

    for (const [key, value] of stagedUsed) used.set(key, value);
    this.ids.add(order.id);
    const oldAbsolute = atomicPos.qty < 0n ? -atomicPos.qty : atomicPos.qty,
      signedQtyAtoms = BigInt(sign) * qtyAtoms,
      newQtyAtoms = atomicPos.qty + signedQtyAtoms;
    let realizedAtoms = 0n;
    if (atomicPos.qty === 0n || (atomicPos.qty > 0n ? 1 : -1) === sign) {
      atomicPos.costBasis += BigInt(sign) * notionalAtoms;
    } else {
      const closing = oldAbsolute < qtyAtoms ? oldAbsolute : qtyAtoms,
        closingNotional = divideRounded(notionalAtoms * closing, qtyAtoms),
        allocatedCost = divideRounded(
          atomicPos.costBasis * closing,
          oldAbsolute,
        ),
        oldSign = atomicPos.qty > 0n ? 1n : -1n;
      realizedAtoms =
        oldSign > 0n
          ? closingNotional - allocatedCost
          : -allocatedCost - closingNotional;
      atomicPos.realizedPnl += realizedAtoms;
      atomicPos.costBasis -= allocatedCost;
      if (qtyAtoms > closing)
        atomicPos.costBasis = BigInt(sign) * (notionalAtoms - closingNotional);
      else if (newQtyAtoms === 0n) atomicPos.costBasis = 0n;
    }
    atomicPos.qty = newQtyAtoms;
    atomicPos.avgPrice =
      atomicPos.qty === 0n
        ? 0n
        : divideRounded(
            atomicPos.costBasis < 0n
              ? -atomicPos.costBasis
              : atomicPos.costBasis,
            atomicPos.qty < 0n ? -atomicPos.qty : atomicPos.qty,
          );
    this.cashAtoms -= BigInt(sign) * notionalAtoms + feeAtoms;
    this.totalFeesAtoms += feeAtoms;
    this.cash = fromAtoms(this.cashAtoms);
    pos.qty = fromAtoms(atomicPos.qty);
    pos.avgPrice = fromAtoms(atomicPos.avgPrice);
    pos.realizedPnl = fromAtoms(atomicPos.realizedPnl);
    this.atomicPositions.set(order.symbol, atomicPos);
    this.positions.set(order.symbol, pos);
    const realized = fromAtoms(realizedAtoms);
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
      monetary: {
        scale: 8,
        qtyExact: decimalString(qtyAtoms),
        priceExact: decimalString(priceAtoms),
        notionalExact: decimalString(notionalAtoms),
        feeExact: decimalString(feeAtoms),
        realizedPnlExact: decimalString(realizedAtoms),
      },
      paper: PAPER_ONLY,
      at: new Date().toISOString(),
    };
    this.fills.push(fill);
    const requestedQtyAtoms = toAtoms(order.qty);
    return {
      status: qtyAtoms < requestedQtyAtoms ? "partial" : "filled",
      fill,
      remainingQty: fromAtoms(
        requestedQtyAtoms > qtyAtoms ? requestedQtyAtoms - qtyAtoms : 0n,
      ),
    };
  }
  snapshot(marks = {}) {
    let marketValueAtoms = 0n,
      unrealizedPnlAtoms = 0n,
      grossExposureAtoms = 0n,
      realizedPnlAtoms = 0n;
    const positions = {};
    for (const [symbol, p] of this.positions) {
      const atomic = this.atomicPositions.get(symbol),
        mark = Number(marks[symbol] || p.avgPrice),
        markAtoms = toAtoms(mark),
        valueAtoms = multiplyAtoms(atomic.qty, markAtoms),
        unrealizedAtoms = valueAtoms - atomic.costBasis,
        value = fromAtoms(valueAtoms),
        unrealized = fromAtoms(unrealizedAtoms);
      marketValueAtoms += valueAtoms;
      grossExposureAtoms += valueAtoms < 0n ? -valueAtoms : valueAtoms;
      unrealizedPnlAtoms += unrealizedAtoms;
      realizedPnlAtoms += atomic.realizedPnl;
      positions[symbol] = {
        ...p,
        mark,
        marketValue: value,
        unrealizedPnl: unrealized,
      };
    }
    const equityAtoms = this.cashAtoms + marketValueAtoms,
      expectedEquityAtoms =
        this.initialCashAtoms +
        realizedPnlAtoms +
        unrealizedPnlAtoms -
        this.totalFeesAtoms,
      residualAtoms = equityAtoms - expectedEquityAtoms;
    return {
      initialCash: this.initialCash,
      cash: this.cash,
      equity: fromAtoms(equityAtoms),
      marketValue: fromAtoms(marketValueAtoms),
      grossExposure: fromAtoms(grossExposureAtoms),
      realizedPnl: fromAtoms(realizedPnlAtoms),
      unrealizedPnl: fromAtoms(unrealizedPnlAtoms),
      fees: fromAtoms(this.totalFeesAtoms),
      fills: this.fills.length,
      positions,
      accounting: {
        scale: 8,
        balanced: residualAtoms === 0n,
        residual: fromAtoms(residualAtoms),
        residualExact: decimalString(residualAtoms),
        cashExact: decimalString(this.cashAtoms),
        equityExact: decimalString(equityAtoms),
        marketValueExact: decimalString(marketValueAtoms),
        realizedPnlExact: decimalString(realizedPnlAtoms),
        unrealizedPnlExact: decimalString(unrealizedPnlAtoms),
        feesExact: decimalString(this.totalFeesAtoms),
      },
    };
  }
  export() {
    return {
      initialCash: this.initialCash,
      cash: this.cash,
      monetaryAtoms: {
        initialCash: String(this.initialCashAtoms),
        cash: String(this.cashAtoms),
        totalFees: String(this.totalFeesAtoms),
        positions: Object.fromEntries(
          [...this.atomicPositions].map(([symbol, p]) => [
            symbol,
            {
              qty: String(p.qty),
              avgPrice: String(p.avgPrice),
              costBasis: String(p.costBasis),
              realizedPnl: String(p.realizedPnl),
            },
          ]),
        ),
      },
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
    this.initialCashAtoms = x.monetaryAtoms?.initialCash
      ? BigInt(x.monetaryAtoms.initialCash)
      : toAtoms(x.initialCash);
    this.cashAtoms = x.monetaryAtoms?.cash
      ? BigInt(x.monetaryAtoms.cash)
      : toAtoms(x.cash);
    this.totalFeesAtoms = x.monetaryAtoms?.totalFees
      ? BigInt(x.monetaryAtoms.totalFees)
      : (x.fills || []).reduce((sum, fill) => sum + toAtoms(fill.fee), 0n);
    this.initialCash = fromAtoms(this.initialCashAtoms);
    this.cash = fromAtoms(this.cashAtoms);
    this.makerFeeRate = x.makerFeeRate ?? x.feeRate ?? 0.001;
    this.takerFeeRate = x.takerFeeRate ?? x.feeRate ?? 0.001;
    this.latencyMs = x.latencyMs || 0;
    this.minNotional = x.minNotional || 0;
    this.lotSize = x.lotSize || 0;
    this.baseSlippageBps = x.baseSlippageBps;
    this.impactBps = x.impactBps;
    this.atomicPositions = new Map(
      Object.entries(x.positions || {}).map(([symbol, p]) => {
        const exact = x.monetaryAtoms?.positions?.[symbol];
        return [
          symbol,
          {
            qty: exact ? BigInt(exact.qty) : toAtoms(p.qty),
            avgPrice: exact ? BigInt(exact.avgPrice) : toAtoms(p.avgPrice),
            costBasis: exact?.costBasis
              ? BigInt(exact.costBasis)
              : multiplyAtoms(toAtoms(p.qty), toAtoms(p.avgPrice)),
            realizedPnl: exact
              ? BigInt(exact.realizedPnl)
              : toAtoms(p.realizedPnl),
          },
        ];
      }),
    );
    this.positions = new Map(
      [...this.atomicPositions].map(([symbol, exact]) => [
        symbol,
        {
          ...(x.positions?.[symbol] || {}),
          qty: fromAtoms(exact.qty),
          avgPrice: fromAtoms(exact.avgPrice),
          realizedPnl: fromAtoms(exact.realizedPnl),
        },
      ]),
    );
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
