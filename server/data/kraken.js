"use strict";
const { environmentFetch } = require("./http-client.js");
const PAIRS = {
  "BTC-USD": "XBTUSD",
  "ETH-USD": "ETHUSD",
  "SOL-USD": "SOLUSD",
  "BNB-USD": "BNBUSD",
};
class KrakenConnector {
  constructor({
    baseUrl = "https://api.kraken.com",
    fetcher = environmentFetch,
    timeoutMs = 8000,
    retries = 2,
  } = {}) {
    this.baseUrl = baseUrl;
    this.fetcher = fetcher;
    this.timeoutMs = timeoutMs;
    this.retries = retries;
    this.stats = { requests: 0, errors: 0, lastSuccessAt: 0, lastLatencyMs: 0 };
  }
  async ticker(product) {
    const pair = PAIRS[product] || product.replace("-", ""),
      started = Date.now();
    let last;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      const controller = new AbortController(),
        timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        this.stats.requests++;
        const response = await this.fetcher(
          `${this.baseUrl}/0/public/Ticker?pair=${encodeURIComponent(pair)}`,
          {
            headers: { accept: "application/json" },
            signal: controller.signal,
          },
        );
        if (!response.ok) throw new Error(`kraken-http-${response.status}`);
        const raw = await response.json();
        if (raw.error?.length) throw new Error(`kraken:${raw.error.join(",")}`);
        const value = Object.values(raw.result || {})[0];
        if (!value) throw new Error("kraken-empty");
        const out = {
          type: "ticker",
          source: "kraken",
          symbol: product,
          price: Number(value.c[0]),
          bid: Number(value.b[0]),
          ask: Number(value.a[0]),
          size: Number(value.c[1]),
          volume24h: Number(value.v[1]),
          exchangeAt: null,
          receivedAt: new Date().toISOString(),
        };
        this.stats.lastSuccessAt = Date.now();
        this.stats.lastLatencyMs = Date.now() - started;
        return out;
      } catch (e) {
        last = e;
        this.stats.errors++;
        if (attempt < this.retries)
          await new Promise((r) => setTimeout(r, 100 * 2 ** attempt));
      } finally {
        clearTimeout(timer);
      }
    }
    throw last;
  }
  health() {
    const age = this.stats.lastSuccessAt
        ? Date.now() - this.stats.lastSuccessAt
        : Infinity,
      errorRate = this.stats.requests
        ? this.stats.errors / this.stats.requests
        : 0;
    return {
      source: "kraken",
      status:
        age < 30000 && errorRate < 0.2
          ? "healthy"
          : age < 120000
            ? "degraded"
            : "down",
      ageMs: age,
      errorRate,
      ...this.stats,
    };
  }
}
module.exports = { KrakenConnector, PAIRS };
