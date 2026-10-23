"use strict";

const crypto = require("node:crypto");

const DAY_MS = 86400000,
  NODE_WEIGHTS = { macro: 0.25, news: 0.35, market: 0.4 },
  POSITIVE = new Set([
    "adoption",
    "approval",
    "beat",
    "bullish",
    "growth",
    "gain",
    "record",
    "rally",
    "surge",
    "upgrade",
  ]),
  NEGATIVE = new Set([
    "ban",
    "bearish",
    "decline",
    "downgrade",
    "fraud",
    "hack",
    "loss",
    "lawsuit",
    "risk",
    "selloff",
  ]);

const clamp = (value, min = -1, max = 1) =>
    Math.max(min, Math.min(max, Number(value) || 0)),
  fingerprint = (value) =>
    crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"),
  mean = (values) =>
    values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : 0,
  deviation = (values) => {
    const center = mean(values);
    return Math.sqrt(mean(values.map((value) => (value - center) ** 2)));
  },
  isoDay = (timestamp) => new Date(timestamp).toISOString().slice(0, 10);

function observedAt(row) {
  const candidate = row.publishedAt ?? row.timestamp ?? row.date;
  const numeric = Number(candidate);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = Date.parse(candidate || "");
  return Number.isFinite(parsed) ? parsed : NaN;
}

function pointInTime(rows, asOf, maxAgeMs) {
  return rows.filter((row) => {
    const observed = observedAt(row),
      received = Number(row.receivedAt);
    return (
      Number.isFinite(observed) &&
      Number.isFinite(received) &&
      observed <= asOf &&
      received <= asOf &&
      observed >= asOf - maxAgeMs
    );
  });
}

function lexicalScore(text) {
  const words =
    String(text || "")
      .toLowerCase()
      .match(/[a-z]+/g) || [];
  let positive = 0,
    negative = 0;
  for (const word of words) {
    if (POSITIVE.has(word)) positive++;
    if (NEGATIVE.has(word)) negative++;
  }
  return positive + negative
    ? (positive - negative) / (positive + negative)
    : 0;
}

function newsNode(rows, asOf) {
  const eligible = pointInTime(rows, asOf, 3 * DAY_MS),
    weighted = eligible.map((row) => {
      const age = Math.max(0, asOf - observedAt(row)),
        decay = Math.exp((-Math.log(2) * age) / DAY_MS),
        score = lexicalScore(
          `${row.headline || row.title || ""} ${row.summary || row.text || ""}`,
        );
      return { score, decay };
    }),
    denominator = weighted.reduce((sum, row) => sum + row.decay, 0),
    signal = denominator
      ? weighted.reduce((sum, row) => sum + row.score * row.decay, 0) /
        denominator
      : 0;
  return {
    id: "news",
    employee: "Noticias / Sentimiento",
    method: "lexicon-score + exponential-decay(halfLife=24h)",
    signal: clamp(signal),
    confidence: clamp(
      (1 - Math.exp(-eligible.length / 5)) * (denominator ? 1 : 0),
      0,
      1,
    ),
    observations: eligible.length,
  };
}

function macroNode(rows, asOf) {
  const eligible = pointInTime(rows, asOf, 400 * DAY_MS)
      .filter((row) => Number.isFinite(row.value))
      .sort((a, b) => observedAt(a) - observedAt(b)),
    values = eligible.slice(-13).map((row) => row.value),
    changes = values
      .slice(1)
      .map(
        (value, index) =>
          (value - values[index]) / Math.abs(values[index] || 1),
      ),
    latest = changes.at(-1) || 0,
    volatility = deviation(changes) || 0.005,
    z = latest / volatility;
  return {
    id: "macro",
    employee: "Macro",
    method: "robust-change / realized-volatility -> tanh",
    signal: clamp(-Math.tanh(z / 3)),
    confidence: clamp(values.length / 13, 0, 1),
    observations: values.length,
    metrics: { latestChange: latest, changeVolatility: volatility },
  };
}

function marketNode(rows, asOf) {
  const eligible = pointInTime(rows, asOf, 35 * DAY_MS).sort(
      (a, b) => observedAt(a) - observedAt(b),
    ),
    closes = eligible.map((row) => row.close).filter(Number.isFinite),
    returns = closes
      .slice(1)
      .map((close, index) => Math.log(close / closes[index])),
    totalReturn = closes.length > 1 ? Math.log(closes.at(-1) / closes[0]) : 0,
    realized = deviation(returns) * Math.sqrt(Math.max(1, returns.length)),
    normalized = totalReturn / Math.max(realized, 0.01);
  return {
    id: "market",
    employee: "Técnico externo",
    method: "log-return / realized-volatility -> tanh",
    signal: clamp(Math.tanh(normalized / 2)),
    confidence: clamp(closes.length / 30, 0, 1),
    observations: closes.length,
    metrics: { totalReturn, realizedVolatility: realized },
  };
}

function consensus(nodes, minimumSources) {
  const active = nodes.filter(
      (node) => node.observations > 0 && node.confidence > 0,
    ),
    weighted = active.map((node) => ({
      node,
      weight: NODE_WEIGHTS[node.id] * node.confidence,
    })),
    denominator = weighted.reduce((sum, row) => sum + row.weight, 0),
    signal = denominator
      ? weighted.reduce((sum, row) => sum + row.node.signal * row.weight, 0) /
        denominator
      : 0,
    dispersion = denominator
      ? Math.sqrt(
          weighted.reduce(
            (sum, row) => sum + row.weight * (row.node.signal - signal) ** 2,
            0,
          ) / denominator,
        )
      : 1,
    coverage = active.reduce((sum, node) => sum + NODE_WEIGHTS[node.id], 0),
    ready = active.length >= minimumSources;
  return {
    status: ready ? "ready" : "blocked",
    signal: ready ? clamp(signal) : 0,
    confidence: ready ? clamp(coverage * Math.exp(-2 * dispersion), 0, 1) : 0,
    dispersion,
    coverage,
    activeSources: active.map((node) => node.id),
    requiredSources: minimumSources,
  };
}

class IntelligenceDag {
  constructor({
    service,
    clock = () => Date.now(),
    minimumSources = 2,
    maxSnapshotAgeMs = 6 * 60 * 60 * 1000,
    record = async () => {},
  } = {}) {
    if (!service) throw new Error("intelligence-service-required");
    this.service = service;
    this.clock = clock;
    if (
      !Number.isInteger(minimumSources) ||
      minimumSources < 1 ||
      minimumSources > 3
    )
      throw new Error("invalid-intelligence-minimum-sources");
    if (!Number.isFinite(maxSnapshotAgeMs) || maxSnapshotAgeMs <= 0)
      throw new Error("invalid-intelligence-snapshot-age");
    this.minimumSources = minimumSources;
    this.maxSnapshotAgeMs = maxSnapshotAgeMs;
    this.record = record;
    this.snapshots = new Map();
  }

  async refresh(asset, { asOf, from, to } = {}) {
    const symbol = String(asset || "").toUpperCase();
    if (!/^[A-Z0-9]{2,10}$/.test(symbol))
      throw Object.assign(new Error("invalid-intelligence-asset"), {
        status: 422,
      });
    const now = this.clock(),
      decisionAt = Number(asOf ?? now);
    if (!Number.isFinite(decisionAt) || decisionAt > now)
      throw Object.assign(new Error("invalid-intelligence-as-of"), {
        status: 422,
      });
    const end = to || isoDay(decisionAt),
      start = from || isoDay(Date.parse(`${end}T00:00:00Z`) - 30 * DAY_MS),
      requests = [
        ["finnhub", "news", { category: "crypto" }],
        ["fmp", "news", { symbols: symbol, limit: 50 }],
        ["fred", "series", { seriesId: "CPIAUCSL", limit: 13 }],
        [
          "polygon",
          "aggregates",
          { ticker: `X:${symbol}USD`, from: start, to: end },
        ],
      ],
      settled = await Promise.all(
        requests.map(async ([provider, operation, params]) => {
          try {
            const response = await this.service.query({
              provider,
              operation,
              params,
            });
            return { provider, operation, data: response.data, error: null };
          } catch (error) {
            return { provider, operation, data: [], error: error.message };
          }
        }),
      );
    const news = settled
        .filter((row) => row.operation === "news")
        .flatMap((row) => row.data),
      macro = settled.find((row) => row.provider === "fred")?.data || [],
      market = settled.find((row) => row.provider === "polygon")?.data || [],
      nodes = [
        macroNode(macro, decisionAt),
        newsNode(news, decisionAt),
        marketNode(market, decisionAt),
      ],
      combined = consensus(nodes, this.minimumSources),
      provenance = settled.map((row) => ({
        provider: row.provider,
        operation: row.operation,
        records: row.data.length,
        error: row.error,
        dataHash: fingerprint(row.data),
      })),
      body = {
        version: 1,
        asset: symbol,
        asOf: decisionAt,
        paperOnly: true,
        nodes,
        consensus: combined,
        provenance,
      },
      snapshot = { ...body, hash: fingerprint(body) };
    this.snapshots.set(symbol, snapshot);
    await this.record(`intelligence.${symbol}`, snapshot);
    return structuredClone(snapshot);
  }

  snapshot(asset, asOf = this.clock()) {
    const snapshot = this.snapshots.get(String(asset || "").toUpperCase());
    if (
      !snapshot ||
      snapshot.asOf > asOf ||
      asOf - snapshot.asOf > this.maxSnapshotAgeMs
    )
      return null;
    return structuredClone(snapshot);
  }

  status() {
    return {
      paperOnly: true,
      assets: Object.fromEntries(
        [...this.snapshots].map(([asset, snapshot]) => [
          asset,
          {
            asOf: snapshot.asOf,
            status:
              this.clock() - snapshot.asOf > this.maxSnapshotAgeMs
                ? "stale"
                : snapshot.consensus.status,
            confidence: snapshot.consensus.confidence,
            hash: snapshot.hash,
          },
        ]),
      ),
    };
  }
}

module.exports = {
  IntelligenceDag,
  consensus,
  lexicalScore,
  macroNode,
  marketNode,
  newsNode,
  pointInTime,
};
