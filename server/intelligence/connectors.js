"use strict";

const { environmentFetch } = require("../data/http-client.js");

const SYMBOL = /^[A-Z0-9][A-Z0-9._:-]{0,19}$/,
  YAHOO_SYMBOL = /^[A-Z0-9^][A-Z0-9.^=_:-]{0,29}$/,
  SERIES = /^[A-Z0-9][A-Z0-9._-]{0,79}$/,
  DAY = /^\d{4}-\d{2}-\d{2}$/,
  TIMESPANS = new Set(["minute", "hour", "day", "week", "month"]),
  YAHOO_INTERVALS = new Set([
    "1m",
    "2m",
    "5m",
    "15m",
    "30m",
    "60m",
    "90m",
    "1h",
    "1d",
    "5d",
    "1wk",
    "1mo",
    "3mo",
  ]);

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

class YahooFinanceConnector extends ReadOnlyConnector {
  constructor(options = {}) {
    super({
      id: "yahoo",
      baseUrl: "https://query1.finance.yahoo.com",
      keyMode: null,
      requiresKey: false,
      ...options,
    });
  }

  async chart({ symbol, from, to, interval = "1d", limit = 500 } = {}) {
    const ticker = identifier(symbol, YAHOO_SYMBOL, "yahoo-symbol"),
      start = Date.parse(`${from}T00:00:00Z`),
      end = Date.parse(`${to}T00:00:00Z`);
    if (
      !DAY.test(String(from || "")) ||
      !DAY.test(String(to || "")) ||
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end < start
    )
      throw Object.assign(new Error("invalid-yahoo-chart-range"), {
        status: 422,
      });
    if (!YAHOO_INTERVALS.has(interval))
      throw Object.assign(new Error("invalid-yahoo-interval"), { status: 422 });
    const raw = await this.get(
        `/v8/finance/chart/${encodeURIComponent(ticker)}`,
        {
          period1: Math.floor(start / 1000),
          period2: Math.floor((end + 86400000) / 1000),
          interval,
          events: "div,splits",
          includeAdjustedClose: "true",
        },
      ),
      result = raw?.chart?.result?.[0],
      timestamps = result?.timestamp,
      quote = result?.indicators?.quote?.[0],
      adjusted = result?.indicators?.adjclose?.[0]?.adjclose || [];
    if (!Array.isArray(timestamps) || !quote)
      throw new Error("yahoo-invalid-response");
    return timestamps
      .map((timestamp, index) => ({
        source: "yahoo",
        ticker,
        timestamp: finite(timestamp, "yahoo") * 1000,
        open: Number.isFinite(Number(quote.open?.[index]))
          ? Number(quote.open[index])
          : null,
        high: Number.isFinite(Number(quote.high?.[index]))
          ? Number(quote.high[index])
          : null,
        low: Number.isFinite(Number(quote.low?.[index]))
          ? Number(quote.low[index])
          : null,
        close: Number.isFinite(Number(quote.close?.[index]))
          ? Number(quote.close[index])
          : null,
        adjustedClose: Number.isFinite(Number(adjusted[index]))
          ? Number(adjusted[index])
          : null,
        volume: Number.isFinite(Number(quote.volume?.[index]))
          ? Number(quote.volume[index])
          : null,
        receivedAt: Date.now(),
      }))
      .filter(
        (row) =>
          row.close !== null &&
          row.timestamp >= start &&
          row.timestamp < end + 86400000,
      )
      .slice(-bounded(limit, 500, 1, 5000));
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

  async news({ category = "general", minId = 0 } = {}) {
    const allowed = new Set(["general", "forex", "crypto", "merger"]);
    if (!allowed.has(category))
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

class FmpConnector extends ReadOnlyConnector {
  constructor(options = {}) {
    super({
      id: "fmp",
      baseUrl: "https://financialmodelingprep.com/stable",
      keyMode: "apikey",
      ...options,
    });
  }

  async profile({ symbol } = {}) {
    const ticker = identifier(symbol, SYMBOL, "symbol"),
      rows = await this.get("/profile", { symbol: ticker });
    if (!Array.isArray(rows)) throw new Error("fmp-invalid-response");
    return rows.slice(0, 1).map((row) => ({
      source: "fmp",
      symbol: ticker,
      companyName: String(row.companyName || ""),
      exchange: String(row.exchange || ""),
      sector: String(row.sector || ""),
      industry: String(row.industry || ""),
      marketCap: finite(row.marketCap, "fmp"),
      price: finite(row.price, "fmp"),
      currency: String(row.currency || ""),
      receivedAt: Date.now(),
    }));
  }

  async news({ symbols, limit = 50 } = {}) {
    const normalized = symbols
        ? String(symbols)
            .split(",")
            .map((value) => identifier(value, SYMBOL, "symbol"))
            .join(",")
        : undefined,
      rows = await this.get("/news/stock-latest", {
        symbols: normalized,
        page: 0,
        limit: bounded(limit, 50, 1, 100),
      });
    if (!Array.isArray(rows)) throw new Error("fmp-invalid-response");
    return rows.map((row) => ({
      source: "fmp",
      symbol: String(row.symbol || ""),
      title: String(row.title || ""),
      text: String(row.text || ""),
      url: String(row.url || ""),
      publishedAt: String(row.publishedDate || ""),
      receivedAt: Date.now(),
    }));
  }
}

class PolygonConnector extends ReadOnlyConnector {
  constructor(options = {}) {
    super({
      id: "polygon",
      baseUrl: "https://api.polygon.io",
      keyMode: "bearer",
      ...options,
    });
  }

  async aggregates({
    ticker,
    from,
    to,
    multiplier = 1,
    timespan = "day",
    limit = 500,
  } = {}) {
    const symbol = identifier(ticker, SYMBOL, "ticker");
    if (!DAY.test(from) || !DAY.test(to) || to < from)
      throw Object.assign(new Error("invalid-aggregate-range"), {
        status: 422,
      });
    if (!TIMESPANS.has(timespan))
      throw Object.assign(new Error("invalid-timespan"), { status: 422 });
    const raw = await this.get(
      `/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/${bounded(multiplier, 1, 1, 60)}/${timespan}/${from}/${to}`,
      {
        adjusted: "true",
        sort: "asc",
        limit: bounded(limit, 500, 1, 50000),
      },
    );
    if (!Array.isArray(raw.results))
      throw new Error("polygon-invalid-response");
    return raw.results.map((row) => ({
      source: "polygon",
      ticker: symbol,
      timestamp: finite(row.t, "polygon"),
      open: finite(row.o, "polygon"),
      high: finite(row.h, "polygon"),
      low: finite(row.l, "polygon"),
      close: finite(row.c, "polygon"),
      volume: finite(row.v, "polygon"),
      transactions: finite(row.n ?? 0, "polygon"),
      vwap: finite(row.vw ?? 0, "polygon"),
      receivedAt: Date.now(),
    }));
  }
}

class IntelligenceService {
  constructor({ connectors = {} } = {}) {
    this.connectors = {
      finnhub: connectors.finnhub || new FinnhubConnector(),
      fred: connectors.fred || new FredConnector(),
      fmp: connectors.fmp || new FmpConnector(),
      polygon: connectors.polygon || new PolygonConnector(),
      yahoo: connectors.yahoo || new YahooFinanceConnector(),
    };
    this.operations = {
      finnhub: new Set(["news"]),
      fred: new Set(["series"]),
      fmp: new Set(["profile", "news"]),
      polygon: new Set(["aggregates"]),
      yahoo: new Set(["chart"]),
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
  FmpConnector,
  FredConnector,
  IntelligenceService,
  PolygonConnector,
  YahooFinanceConnector,
};
