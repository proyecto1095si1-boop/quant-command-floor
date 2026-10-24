"use strict";

const crypto = require("node:crypto");
const { analyzeCryptoNews } = require("./news.js");

const DAY_MS = 86400000,
  NODE_WEIGHTS = { macro: 0.25, news: 0.35, market: 0.4 },
  NEWS_MAX_AGE_MS = 3 * DAY_MS;

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
  };

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

function validateSnapshot(snapshot, expectedAsset, now) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot))
    throw new Error("invalid-intelligence-snapshot");
  const { hash, ...body } = snapshot;
  const nodeIds = Array.isArray(body.nodes)
      ? body.nodes.map((node) => String(node?.id || "")).sort()
      : [],
    nodesValid =
      nodeIds.join(",") === "macro,market,news" &&
      body.nodes.every(
        (node) =>
          Number.isFinite(node.signal) &&
          node.signal >= -1 &&
          node.signal <= 1 &&
          Number.isFinite(node.confidence) &&
          node.confidence >= 0 &&
          node.confidence <= 1 &&
          Number.isInteger(node.observations) &&
          node.observations >= 0,
      ),
    consensusValid =
      body.consensus &&
      ["ready", "blocked"].includes(body.consensus.status) &&
      Number.isFinite(body.consensus.signal) &&
      body.consensus.signal >= -1 &&
      body.consensus.signal <= 1 &&
      Number.isFinite(body.consensus.confidence) &&
      body.consensus.confidence >= 0 &&
      body.consensus.confidence <= 1,
    provenanceValid =
      Array.isArray(body.provenance) &&
      body.provenance.every(
        (row) =>
          ["finnhub", "fred"].includes(row?.provider) &&
          Number.isInteger(row.records) &&
          row.records >= 0 &&
          /^[a-f0-9]{64}$/.test(String(row.dataHash || "")),
      );
  if (
    body.version !== 1 ||
    body.paperOnly !== true ||
    body.asset !== expectedAsset ||
    !Number.isFinite(body.asOf) ||
    body.asOf < 0 ||
    body.asOf > now ||
    !nodesValid ||
    !consensusValid ||
    !provenanceValid ||
    hash !== fingerprint(body)
  )
    throw new Error("invalid-intelligence-snapshot");
  return structuredClone(snapshot);
}

function newsNode(rows, asOf, asset) {
  const analysis = analyzeCryptoNews(rows, {
    asset,
    asOf,
    maxAgeMs: NEWS_MAX_AGE_MS,
    halfLifeMs: DAY_MS,
  });
  return {
    id: "news",
    employee: "Noticias / Sentimiento",
    method:
      "asset-relevance × lexicon-sentiment × exponential-decay(halfLife=24h)",
    signal: analysis.signal,
    confidence: analysis.confidence,
    observations: analysis.observations,
    metrics: {
      dispersion: analysis.dispersion,
      rejected: analysis.rejected,
      evidenceHash: analysis.evidenceHash,
    },
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

function reconcileMarketRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    const timestamp = observedAt(row),
      close = Number(row.close);
    if (!Number.isFinite(timestamp) || !Number.isFinite(close)) continue;
    const bucket = groups.get(timestamp) || [];
    bucket.push(row);
    groups.set(timestamp, bucket);
  }
  return [...groups.entries()].map(([timestamp, bucket]) => {
    const closes = bucket.map((row) => Number(row.close)).sort((a, b) => a - b),
      middle = Math.floor(closes.length / 2),
      close =
        closes.length % 2
          ? closes[middle]
          : (closes[middle - 1] + closes[middle]) / 2;
    return {
      source: "market-consensus",
      sources: [...new Set(bucket.map((row) => row.source))].sort(),
      timestamp,
      close,
      receivedAt: Math.max(...bucket.map((row) => Number(row.receivedAt))),
    };
  });
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
    this.recovery = { recovered: false, snapshots: 0, assets: 0 };
  }

  async refresh(asset, { asOf } = {}) {
    const symbol = String(asset || "").toUpperCase();
    if (!/^[A-Z0-9]{2,10}$/.test(symbol))
      throw Object.assign(new Error("invalid-intelligence-asset"), {
        status: 422,
      });
    const now = this.clock(),
      requestedAt = asOf === undefined ? null : Number(asOf);
    if (
      requestedAt !== null &&
      (!Number.isFinite(requestedAt) || requestedAt > now)
    )
      throw Object.assign(new Error("invalid-intelligence-as-of"), {
        status: 422,
      });
    const requests = [
        ["finnhub", "news", { category: "crypto" }],
        ["fred", "series", { seriesId: "CPIAUCSL", limit: 13 }],
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
    const decisionAt = requestedAt ?? this.clock(),
      news = settled
        .filter((row) => row.operation === "news")
        .flatMap((row) => row.data),
      macro = settled.find((row) => row.provider === "fred")?.data || [],
      market = [],
      nodes = [
        macroNode(macro, decisionAt),
        newsNode(news, decisionAt, symbol),
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

  recover(histories = {}) {
    if (!histories || typeof histories !== "object" || Array.isArray(histories))
      throw new Error("invalid-intelligence-recovery");
    const restored = new Map(),
      now = this.clock();
    let count = 0;
    for (const [rawAsset, history] of Object.entries(histories)) {
      const asset = String(rawAsset).toUpperCase();
      if (!/^[A-Z0-9]{2,10}$/.test(asset) || !Array.isArray(history))
        throw new Error("invalid-intelligence-recovery");
      let previous = -Infinity,
        latest = null;
      for (const row of history) {
        const snapshot = validateSnapshot(row, asset, now);
        if (snapshot.asOf <= previous)
          throw new Error("invalid-intelligence-snapshot-sequence");
        previous = snapshot.asOf;
        latest = snapshot;
        count++;
      }
      if (latest) restored.set(asset, latest);
    }
    this.snapshots = restored;
    this.recovery = {
      recovered: true,
      snapshots: count,
      assets: restored.size,
    };
    return { ...this.recovery };
  }

  status() {
    return {
      paperOnly: true,
      recovery: { ...this.recovery },
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
  DAY_MS,
  NEWS_MAX_AGE_MS,
  NODE_WEIGHTS,
  IntelligenceDag,
  consensus,
  macroNode,
  marketNode,
  newsNode,
  pointInTime,
  reconcileMarketRows,
  validateSnapshot,
};
