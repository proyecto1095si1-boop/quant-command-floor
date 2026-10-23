"use strict";

const { environmentFetch } = require("../data/http-client.js");
const { analyzeCryptoNews } = require("./news.js");

const SERIES = /^[A-Z0-9][A-Z0-9._-]{0,79}$/,
  DAY = /^\d{4}-\d{2}-\d{2}$/;

function bounded(value, fallback, minimum, maximum) {
  const number = Number(value ?? fallback);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum)
    throw Object.assign(new Error("invalid-query-limit"), { status: 422 });
  return number;
}

function identifier(value, pattern, field) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();
  if (!pattern.test(normalized))
    throw Object.assign(new Error(`invalid-${field}`), { status: 422 });
  return normalized;
}

function finite(value, provider) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${provider}-invalid-response`);
  return number;
}

class ReadOnlyConnector {
  constructor({
    id,
    baseUrl,
    apiKey,
    fetcher = environmentFetch,
    timeoutMs = 8000,
    retries = 1,
    maxRequestsPerMinute = 60,
    keyMode,
    requiresKey = true,
  }) {
    this.id = id;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey || "";
    this.fetcher = fetcher;
    this.timeoutMs = bounded(timeoutMs, 8000, 100, 60000);
    this.retries = bounded(retries, 1, 0, 5);
    this.maxRequestsPerMinute = bounded(maxRequestsPerMinute, 60, 1, 10000);
    this.keyMode = keyMode;
    this.requiresKey = requiresKey;
    this.requests = [];
    this.stats = {
      attempts: 0,
      successes: 0,
      failures: 0,
      lastSuccessAt: null,
      lastLatencyMs: null,
      lastError: null,
    };
  }

  prune(now = Date.now()) {
    this.requests = this.requests.filter((at) => at > now - 60000);
  }

  async get(path, query = {}) {
    if (this.requiresKey && !this.apiKey)
      throw Object.assign(new Error(`${this.id}-not-configured`), {
        status: 503,
      });
    this.prune();
    if (this.requests.length >= this.maxRequestsPerMinute)
      throw Object.assign(new Error(`${this.id}-rate-limit`), { status: 429 });
    const url = new URL(this.baseUrl + path),
      headers = { accept: "application/json" };
    for (const [key, value] of Object.entries(query))
      if (value !== undefined && value !== null && value !== "")
        url.searchParams.set(key, String(value));
    if (!this.requiresKey) {
      // Public read-only provider; no credential is sent.
    } else if (this.keyMode === "finnhub")
      headers["x-finnhub-token"] = this.apiKey;
    else if (this.keyMode === "bearer")
      headers.authorization = `Bearer ${this.apiKey}`;
    else url.searchParams.set(this.keyMode, this.apiKey);
    let lastError;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      const controller = new AbortController(),
        timer = setTimeout(() => controller.abort(), this.timeoutMs),
        started = Date.now();
      this.requests.push(started);
      this.stats.attempts++;
      try {
        const response = await this.fetcher(url, {
          headers,
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`http-${response.status}`);
        const data = await response.json();
        this.stats.successes++;
        this.stats.lastSuccessAt = Date.now();
        this.stats.lastLatencyMs = Date.now() - started;
        this.stats.lastError = null;
        return data;
      } catch (error) {
        lastError = error;
        this.stats.failures++;
        this.stats.lastError =
          error?.name === "AbortError" ? "timeout" : "upstream-failure";
      } finally {
        clearTimeout(timer);
      }
    }
    throw Object.assign(new Error(`${this.id}-upstream-failure`), {
      status: 502,
      cause: lastError,
    });
  }

  health() {
    this.prune();
    const configured = !this.requiresKey || Boolean(this.apiKey),
      observed = this.stats.attempts > 0,
      errorRate = observed ? this.stats.failures / this.stats.attempts : 0;
    return {
      id: this.id,
      configured,
      readOnly: true,
      healthy: configured && (!observed || errorRate < 0.5),
      requestsLastMinute: this.requests.length,
      limitPerMinute: this.maxRequestsPerMinute,
      errorRate,
      ...this.stats,
    };
  }
}

class FinnhubConnector extends ReadOnlyConnector {
  constructor(options = {}) {
    super({
      id: "finnhub",
      baseUrl: "https://finnhub.io/api/v1",
      keyMode: "finnhub",
      ...options,
    });
  }

  async news({ category = "crypto", minId = 0 } = {}) {
    if (category !== "crypto")
      throw Object.assign(new Error("invalid-news-category"), { status: 422 });
    const rows = await this.get("/news", {
      category,
      minId: bounded(minId, 0, 0, 2_147_483_647),
    });
    if (!Array.isArray(rows)) throw new Error("finnhub-invalid-response");
    return rows.slice(0, 100).map((row) => ({
      source: "finnhub",
      id: String(row.id || ""),
      headline: String(row.headline || ""),
      summary: String(row.summary || ""),
      url: String(row.url || ""),
      category: String(row.category || category),
      publishedAt: finite(row.datetime, "finnhub") * 1000,
      receivedAt: Date.now(),
    }));
  }
}

class FredConnector extends ReadOnlyConnector {
  constructor(options = {}) {
    super({
      id: "fred",
      baseUrl: "https://api.stlouisfed.org/fred",
      keyMode: "api_key",
      ...options,
    });
  }

  async series({
    seriesId,
    observationStart,
    observationEnd,
    limit = 100,
  } = {}) {
    const id = identifier(seriesId, SERIES, "series-id");
    if (observationStart && !DAY.test(observationStart))
      throw Object.assign(new Error("invalid-observation-start"), {
        status: 422,
      });
    if (observationEnd && !DAY.test(observationEnd))
      throw Object.assign(new Error("invalid-observation-end"), {
        status: 422,
      });
    const raw = await this.get("/series/observations", {
      series_id: id,
      observation_start: observationStart,
      observation_end: observationEnd,
      limit: bounded(limit, 100, 1, 1000),
      sort_order: "desc",
      file_type: "json",
    });
    if (!Array.isArray(raw.observations))
      throw new Error("fred-invalid-response");
    return raw.observations.map((row) => ({
      source: "fred",
      seriesId: id,
      date: String(row.date || ""),
      value: row.value === "." ? null : finite(row.value, "fred"),
      realtimeStart: String(row.realtime_start || ""),
      realtimeEnd: String(row.realtime_end || ""),
      receivedAt: Date.now(),
    }));
  }
}

class IntelligenceService {
  constructor({ connectors = {} } = {}) {
    this.connectors = {
      finnhub: connectors.finnhub || new FinnhubConnector(),
      fred: connectors.fred || new FredConnector(),
    };
    this.operations = {
      finnhub: new Set(["news"]),
      fred: new Set(["series"]),
    };
  }

  async query({ provider, operation, params = {} } = {}) {
    if (!this.operations[provider]?.has(operation))
      throw Object.assign(new Error("unsupported-intelligence-operation"), {
        status: 422,
      });
    const data = await this.connectors[provider][operation](params);
    return {
      provider,
      operation,
      readOnly: true,
      paperOnly: true,
      receivedAt: Date.now(),
      data,
    };
  }

  async newsSignal({ asset, asOf, limit = 100 } = {}) {
    const now = Date.now(),
      requestedAsOf = asOf === undefined ? null : Number(asOf);
    if (
      requestedAsOf !== null &&
      (!Number.isFinite(requestedAsOf) || requestedAsOf > now)
    )
      throw Object.assign(new Error("invalid-news-as-of"), { status: 422 });
    const rows = await this.connectors.finnhub.news({ category: "crypto" });
    const decisionAt = requestedAsOf ?? Date.now();
    return analyzeCryptoNews(rows, { asset, asOf: decisionAt, limit });
  }

  status() {
    return {
      paperOnly: true,
      liveTrading: false,
      providers: Object.fromEntries(
        Object.entries(this.connectors).map(([id, connector]) => [
          id,
          connector.health(),
        ]),
      ),
    };
  }
}

module.exports = {
  FinnhubConnector,
  FredConnector,
  IntelligenceService,
};
