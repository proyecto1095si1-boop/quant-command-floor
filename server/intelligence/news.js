"use strict";

const crypto = require("node:crypto");

const HOUR_MS = 60 * 60 * 1000,
  SUPPORTED_ASSETS = Object.freeze({
    BTC: ["btc", "bitcoin"],
    ETH: ["eth", "ether", "ethereum"],
    SOL: ["sol", "solana"],
    BNB: ["bnb", "binance coin"],
  }),
  CRYPTO_TERMS = new Set([
    "blockchain",
    "crypto",
    "cryptocurrency",
    "token",
    "tokens",
  ]),
  POSITIVE = new Map([
    ["adoption", 1],
    ["approval", 1],
    ["approved", 1],
    ["bullish", 1],
    ["breakout", 0.75],
    ["gain", 0.5],
    ["gains", 0.5],
    ["record", 0.5],
    ["rally", 0.75],
    ["surge", 0.75],
    ["upgrade", 0.5],
  ]),
  NEGATIVE = new Map([
    ["ban", 1],
    ["bearish", 1],
    ["decline", 0.5],
    ["downgrade", 0.5],
    ["exploit", 1],
    ["fraud", 1],
    ["hack", 1],
    ["hacked", 1],
    ["lawsuit", 0.75],
    ["loss", 0.5],
    ["selloff", 0.75],
  ]),
  NEGATIONS = new Set(["no", "not", "never", "without"]),
  TRACKING_QUERY = new Set([
    "fbclid",
    "gclid",
    "ref",
    "source",
    "utm_campaign",
    "utm_content",
    "utm_medium",
    "utm_source",
    "utm_term",
  ]);

function clamp(value, minimum = -1, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function words(value) {
  return (
    String(value || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .match(/[a-z0-9]+/g) || []
  );
}

function normalizedText(value) {
  return words(value).join(" ");
}

function sentimentScore(value) {
  const tokens = words(value);
  let signed = 0,
    magnitude = 0;
  for (let index = 0; index < tokens.length; index++) {
    const positive = POSITIVE.get(tokens[index]) || 0,
      negative = NEGATIVE.get(tokens[index]) || 0,
      weight = positive || negative;
    if (!weight) continue;
    const negated = tokens
      .slice(Math.max(0, index - 3), index)
      .some((token) => NEGATIONS.has(token));
    const direction = positive ? 1 : -1;
    signed += direction * weight * (negated ? -1 : 1);
    magnitude += weight;
  }
  return magnitude ? clamp(signed / magnitude) : 0;
}

function canonicalUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (!new Set(["http:", "https:"]).has(url.protocol)) return "";
    url.hash = "";
    for (const key of [...url.searchParams.keys()])
      if (TRACKING_QUERY.has(key.toLowerCase())) url.searchParams.delete(key);
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/$/, "") || "/";
    return url.toString();
  } catch {
    return "";
  }
}

function observedAt(row) {
  const candidate = row?.publishedAt ?? row?.timestamp ?? row?.datetime,
    numeric = Number(candidate);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = Date.parse(candidate || "");
  return Number.isFinite(parsed) ? parsed : NaN;
}

function assetRelevance(row, asset) {
  const aliases = SUPPORTED_ASSETS[asset],
    headline = normalizedText(row?.headline || row?.title),
    summary = normalizedText(row?.summary || row?.text),
    includesAlias = (text) =>
      aliases.some(
        (alias) =>
          text === alias ||
          text.startsWith(`${alias} `) ||
          text.endsWith(` ${alias}`) ||
          text.includes(` ${alias} `),
      );
  if (includesAlias(headline)) return 1;
  if (includesAlias(summary)) return 0.7;
  const generic = [...CRYPTO_TERMS].some(
    (term) => headline.includes(term) || summary.includes(term),
  );
  return generic ? 0.25 : 0;
}

function dedupeKey(row) {
  const url = canonicalUrl(row?.url);
  if (url) return `url:${url}`;
  const headline = normalizedText(row?.headline || row?.title);
  return headline ? `headline:${headline}` : "";
}

function analyzeCryptoNews(
  rows,
  {
    asset,
    asOf = Date.now(),
    maxAgeMs = 72 * HOUR_MS,
    halfLifeMs = 24 * HOUR_MS,
    limit = 100,
  } = {},
) {
  const symbol = String(asset || "")
      .trim()
      .toUpperCase(),
    decisionAt = Number(asOf);
  if (!SUPPORTED_ASSETS[symbol])
    throw Object.assign(new Error("unsupported-news-asset"), { status: 422 });
  if (!Number.isFinite(decisionAt) || decisionAt < 0)
    throw Object.assign(new Error("invalid-news-as-of"), { status: 422 });
  if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0)
    throw Object.assign(new Error("invalid-news-max-age"), { status: 422 });
  if (!Number.isFinite(halfLifeMs) || halfLifeMs <= 0)
    throw Object.assign(new Error("invalid-news-half-life"), { status: 422 });
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw Object.assign(new Error("invalid-news-limit"), { status: 422 });

  const seen = new Set(),
    articles = [];
  let rejectedFuture = 0,
    rejectedStale = 0,
    rejectedIrrelevant = 0,
    duplicates = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    const publishedAt = observedAt(row),
      receivedAt = Number(row?.receivedAt);
    if (
      !Number.isFinite(publishedAt) ||
      !Number.isFinite(receivedAt) ||
      publishedAt > decisionAt ||
      receivedAt > decisionAt
    ) {
      rejectedFuture++;
      continue;
    }
    const ageMs = decisionAt - publishedAt;
    if (ageMs > maxAgeMs) {
      rejectedStale++;
      continue;
    }
    const relevance = assetRelevance(row, symbol);
    if (!relevance) {
      rejectedIrrelevant++;
      continue;
    }
    const key = dedupeKey(row);
    if (!key || seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    const sentiment = sentimentScore(
        `${row?.headline || row?.title || ""} ${row?.summary || row?.text || ""}`,
      ),
      freshness = Math.exp((-Math.log(2) * ageMs) / halfLifeMs),
      weight = relevance * freshness;
    articles.push({
      id: String(row?.id || ""),
      source: String(row?.source || "unknown"),
      headline: String(row?.headline || row?.title || ""),
      url: canonicalUrl(row?.url),
      publishedAt,
      sentiment,
      relevance,
      freshness,
      weight,
    });
  }
  articles.sort(
    (left, right) =>
      right.weight - left.weight || right.publishedAt - left.publishedAt,
  );
  const selected = articles.slice(0, limit),
    weightSum = selected.reduce((sum, article) => sum + article.weight, 0),
    signal = weightSum
      ? selected.reduce(
          (sum, article) => sum + article.sentiment * article.weight,
          0,
        ) / weightSum
      : 0,
    dispersion = weightSum
      ? Math.sqrt(
          selected.reduce(
            (sum, article) =>
              sum + article.weight * (article.sentiment - signal) ** 2,
            0,
          ) / weightSum,
        )
      : 1,
    effectiveObservations = Math.min(selected.length, weightSum),
    confidence = selected.length
      ? clamp(
          (1 - Math.exp(-effectiveObservations / 5)) * Math.exp(-dispersion),
          0,
          1,
        )
      : 0,
    evidenceHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(selected))
      .digest("hex");
  return {
    version: 1,
    asset: symbol,
    asOf: decisionAt,
    paperOnly: true,
    signal: clamp(signal),
    confidence,
    dispersion,
    observations: selected.length,
    rejected: {
      futureOrUnknown: rejectedFuture,
      stale: rejectedStale,
      irrelevant: rejectedIrrelevant,
      duplicate: duplicates,
    },
    evidenceHash,
    articles: selected,
  };
}

module.exports = {
  SUPPORTED_ASSETS,
  analyzeCryptoNews,
  assetRelevance,
  canonicalUrl,
  sentimentScore,
};
