"use strict";

const assert = require("node:assert/strict"),
  {
    analyzeCryptoNews,
    assetRelevance,
    canonicalUrl,
    sentimentScore,
  } = require("../server/intelligence/news.js");

const now = Date.parse("2026-10-23T12:00:00Z"),
  row = (overrides = {}) => ({
    id: "1",
    source: "finnhub",
    headline: "Bitcoin adoption surge",
    summary: "Institutional BTC demand is bullish",
    url: "https://news.example/story?utm_source=x",
    publishedAt: now - 60 * 60 * 1000,
    receivedAt: now - 1000,
    ...overrides,
  });

assert.ok(sentimentScore("bullish adoption surge") > 0);
assert.ok(sentimentScore("hack fraud selloff") < 0);
assert.ok(sentimentScore("not bullish") < 0);
assert.equal(assetRelevance(row(), "BTC"), 1);
assert.equal(assetRelevance(row(), "ETH"), 0);
assert.equal(
  canonicalUrl("https://NEWS.example/story/?utm_source=x&gclid=y&id=4#top"),
  "https://news.example/story?id=4",
);

const result = analyzeCryptoNews(
  [
    row(),
    row({ id: "duplicate", url: "https://news.example/story?utm_medium=y" }),
    row({
      id: "negative",
      headline: "Bitcoin exchange hack triggers selloff",
      summary: "BTC loss",
      url: "https://news.example/negative",
      publishedAt: now - 2 * 60 * 60 * 1000,
    }),
    row({
      id: "eth-only",
      headline: "Ethereum upgrade approved",
      summary: "ETH adoption",
      url: "https://news.example/eth",
    }),
    row({
      id: "future",
      url: "https://news.example/future",
      publishedAt: now + 1,
    }),
    row({
      id: "stale",
      url: "https://news.example/stale",
      publishedAt: now - 73 * 60 * 60 * 1000,
    }),
  ],
  { asset: "btc", asOf: now },
);

assert.equal(result.asset, "BTC");
assert.equal(result.paperOnly, true);
assert.equal(result.observations, 2);
assert.equal(result.rejected.duplicate, 1);
assert.equal(result.rejected.irrelevant, 1);
assert.equal(result.rejected.futureOrUnknown, 1);
assert.equal(result.rejected.stale, 1);
assert.ok(result.signal > -1 && result.signal < 1);
assert.ok(result.confidence > 0 && result.confidence < 1);
assert.ok(result.dispersion > 0);
assert.match(result.evidenceHash, /^[a-f0-9]{64}$/);
assert.equal(result.articles[0].url.includes("utm_"), false);
assert.throws(
  () => analyzeCryptoNews([], { asset: "DOGE", asOf: now }),
  /unsupported-news-asset/,
);
assert.throws(
  () => analyzeCryptoNews([], { asset: "BTC", asOf: NaN }),
  /invalid-news-as-of/,
);

console.log("crypto news signal tests: ok");
