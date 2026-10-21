"use strict";

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function tradeCoverage(trades) {
  const sequences = [
    ...new Set(
      trades
        .map((trade) => String(trade.tradeId ?? trade.sequence ?? ""))
        .filter((value) => /^\d+$/.test(value))
        .map(BigInt),
    ),
  ].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (sequences.length < 2)
    return { observed: sequences.length, expected: sequences.length, ratio: 1 };
  const expected = Number(sequences.at(-1) - sequences[0] + 1n);
  return {
    observed: sequences.length,
    expected,
    ratio: expected > 0 ? sequences.length / expected : 0,
  };
}

class MarketReconciliation {
  constructor({
    clock = () => Date.now(),
    minSources = 2,
    maxAgeMs = 15_000,
    maxDivergenceBps = 25,
    maxSpreadBps = 100,
    minTradeCoverage = 0.98,
    quarantineAfter = 2,
    recoverAfter = 3,
  } = {}) {
    const policy = {
      minSources,
      maxAgeMs,
      maxDivergenceBps,
      maxSpreadBps,
      minTradeCoverage,
      quarantineAfter,
      recoverAfter,
    };
    if (
      !Object.values(policy).every(Number.isFinite) ||
      minSources < 1 ||
      maxAgeMs < 0 ||
      maxDivergenceBps < 0 ||
      maxSpreadBps < 0 ||
      minTradeCoverage < 0 ||
      minTradeCoverage > 1 ||
      quarantineAfter < 1 ||
      recoverAfter < 1
    )
      throw new Error("invalid-market-reconciliation-policy");
    this.clock = clock;
    this.policy = policy;
    this.products = new Map();
    this.metrics = {
      evaluations: 0,
      failures: 0,
      quarantines: 0,
      recoveries: 0,
    };
  }

  evaluate(product, { tickers = [], book = null, trades = [] } = {}) {
    const now = Number(this.clock()),
      tickerRows = tickers
        .map((ticker) => ({
          source: String(ticker?.source || "unknown"),
          price: Number(ticker?.price),
          receivedAt: ticker?.receivedAt || null,
          ageMs: now - Date.parse(String(ticker?.receivedAt || "")),
        }))
        .filter(
          (row) =>
            Number.isFinite(row.price) &&
            row.price > 0 &&
            Number.isFinite(row.ageMs),
        ),
      sources = [
        ...new Map(tickerRows.map((row) => [row.source, row])).values(),
      ],
      fresh = sources.filter(
        (row) => row.ageMs >= 0 && row.ageMs <= this.policy.maxAgeMs,
      ),
      referencePrice = median(fresh.map((row) => row.price)),
      deviations = fresh.map((row) => ({
        ...row,
        divergenceBps: referencePrice
          ? (Math.abs(row.price - referencePrice) / referencePrice) * 10_000
          : Infinity,
      })),
      maxSourceDeviationBps = Math.max(
        0,
        ...deviations.map((row) => row.divergenceBps),
      ),
      pairwiseDivergences = fresh.flatMap((left, index) =>
        fresh.slice(index + 1).map((right) => {
          const midpoint = (left.price + right.price) / 2;
          return midpoint > 0
            ? (Math.abs(left.price - right.price) / midpoint) * 10_000
            : Infinity;
        }),
      ),
      maxDivergenceBps = Math.max(0, ...pairwiseDivergences),
      bids = (book?.bids || []).filter(
        (level) => Number(level.price) > 0 && Number(level.size) > 0,
      ),
      asks = (book?.asks || []).filter(
        (level) => Number(level.price) > 0 && Number(level.size) > 0,
      ),
      bestBid = bids.length
        ? Math.max(...bids.map((level) => Number(level.price)))
        : null,
      bestAsk = asks.length
        ? Math.min(...asks.map((level) => Number(level.price)))
        : null,
      midpoint = (bestBid + bestAsk) / 2,
      spreadBps =
        midpoint > 0 ? ((bestAsk - bestBid) / midpoint) * 10_000 : Infinity,
      coverage = tradeCoverage(trades),
      reasons = [];
    if (fresh.length < this.policy.minSources)
      reasons.push("insufficient-sources");
    if (sources.length !== fresh.length) reasons.push("stale-source");
    if (maxDivergenceBps > this.policy.maxDivergenceBps)
      reasons.push("source-divergence");
    if (!bids.length || !asks.length) reasons.push("empty-book");
    else if (!(bestBid < bestAsk)) reasons.push("crossed-book");
    else if (spreadBps > this.policy.maxSpreadBps) reasons.push("wide-spread");
    if (coverage.ratio < this.policy.minTradeCoverage)
      reasons.push("trade-sequence-coverage");

    const previous = this.products.get(product) || {
        consecutiveFailures: 0,
        consecutiveHealthy: 0,
        quarantined: false,
      },
      eligible = reasons.length === 0,
      consecutiveFailures = eligible ? 0 : previous.consecutiveFailures + 1,
      consecutiveHealthy = eligible ? previous.consecutiveHealthy + 1 : 0;
    let quarantined = previous.quarantined;
    if (!quarantined && consecutiveFailures >= this.policy.quarantineAfter) {
      quarantined = true;
      this.metrics.quarantines++;
    } else if (quarantined && consecutiveHealthy >= this.policy.recoverAfter) {
      quarantined = false;
      this.metrics.recoveries++;
    }
    this.metrics.evaluations++;
    if (!eligible) this.metrics.failures++;
    const result = {
      product,
      status: quarantined ? "quarantined" : eligible ? "healthy" : "degraded",
      eligible: eligible && !quarantined,
      quarantined,
      reasons,
      evaluatedAt: new Date(now).toISOString(),
      referencePrice,
      sources: deviations,
      maxSourceDeviationBps,
      maxDivergenceBps,
      book: {
        bestBid,
        bestAsk,
        spreadBps,
        bids: bids.length,
        asks: asks.length,
      },
      trades: coverage,
      consecutiveFailures,
      consecutiveHealthy,
    };
    this.products.set(product, result);
    return structuredClone(result);
  }

  product(product) {
    const result = this.products.get(product);
    return result ? structuredClone(result) : null;
  }

  snapshot() {
    const products = Object.fromEntries(
        [...this.products].map(([product, state]) => [
          product,
          structuredClone(state),
        ]),
      ),
      values = Object.values(products);
    return {
      status: values.some((state) => state.quarantined)
        ? "quarantined"
        : values.some((state) => !state.eligible)
          ? "degraded"
          : values.length
            ? "healthy"
            : "unassessed",
      products,
      metrics: { ...this.metrics },
      policy: { ...this.policy },
    };
  }
}

module.exports = { MarketReconciliation, median, tradeCoverage };
