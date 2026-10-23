"use strict";

const assert = require("node:assert/strict"),
  {
    FinnhubConnector,
    FmpConnector,
    FredConnector,
    IntelligenceService,
    PolygonConnector,
    YahooFinanceConnector,
  } = require("../server/intelligence/connectors.js");

function response(data, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}

(async () => {
  const calls = [],
    fetcher = async (url, options) => {
      calls.push({ url: new URL(url), options });
      if (url.pathname.endsWith("/news"))
        return response([
          {
            id: 7,
            headline: "Macro event",
            summary: "Summary",
            url: "https://news.example/7",
            category: "general",
            datetime: 1_792_670_400,
          },
        ]);
      if (url.pathname.endsWith("/series/observations"))
        return response({
          observations: [
            {
              date: "2026-10-01",
              value: "3.1",
              realtime_start: "2026-10-22",
              realtime_end: "2026-10-22",
            },
          ],
        });
      if (url.pathname.endsWith("/profile"))
        return response([
          {
            symbol: "AAPL",
            companyName: "Apple",
            exchange: "NASDAQ",
            sector: "Technology",
            marketCap: 100,
            price: 200,
            currency: "USD",
          },
        ]);
      if (url.pathname.includes("/v8/finance/chart/"))
        return response({
          chart: {
            result: [
              {
                timestamp: [1_792_540_800, 1_792_627_200],
                indicators: {
                  quote: [
                    {
                      open: [100, 101],
                      high: [102, 103],
                      low: [99, 100],
                      close: [101, 102],
                      volume: [1000, 1100],
                    },
                  ],
                  adjclose: [{ adjclose: [100.5, 101.5] }],
                },
              },
            ],
          },
        });
      return response({
        results: [
          { t: 1, o: 10, h: 12, l: 9, c: 11, v: 1000, n: 20, vw: 10.5 },
        ],
      });
    },
    finnhub = new FinnhubConnector({ apiKey: "test-finnhub", fetcher }),
    fred = new FredConnector({ apiKey: "test-fred", fetcher }),
    fmp = new FmpConnector({ apiKey: "test-fmp", fetcher }),
    polygon = new PolygonConnector({ apiKey: "test-polygon", fetcher }),
    yahoo = new YahooFinanceConnector({ fetcher });

  assert.equal((await finnhub.news())[0].headline, "Macro event");
  assert.equal(calls[0].options.headers["x-finnhub-token"], "test-finnhub");
  assert.equal(calls[0].url.searchParams.has("token"), false);
  assert.equal((await fred.series({ seriesId: "CPIAUCSL" }))[0].value, 3.1);
  assert.equal(calls[1].url.searchParams.get("api_key"), "test-fred");
  assert.equal((await fmp.profile({ symbol: "AAPL" }))[0].companyName, "Apple");
  assert.equal(calls[2].url.searchParams.get("apikey"), "test-fmp");
  assert.equal(
    (
      await polygon.aggregates({
        ticker: "SPY",
        from: "2026-10-01",
        to: "2026-10-22",
      })
    )[0].close,
    11,
  );
  assert.equal(calls[3].options.headers.authorization, "Bearer test-polygon");
  assert.equal(calls[3].url.searchParams.has("apiKey"), false);
  const yahooRows = await yahoo.chart({
    symbol: "BTC-USD",
    from: "2026-10-01",
    to: "2026-10-22",
  });
  assert.equal(yahooRows.length, 2);
  assert.equal(yahooRows[1].close, 102);
  assert.equal(calls[4].url.searchParams.get("interval"), "1d");
  assert.equal(calls[4].options.headers.authorization, undefined);
  assert.equal(yahoo.health().configured, true);

  const service = new IntelligenceService({
    connectors: { finnhub, fred, fmp, polygon, yahoo },
  });
  const result = await service.query({
    provider: "fred",
    operation: "series",
    params: { seriesId: "FEDFUNDS" },
  });
  assert.equal(result.readOnly, true);
  assert.equal(result.paperOnly, true);
  assert.equal(service.status().liveTrading, false);
  await assert.rejects(
    service.query({ provider: "fred", operation: "delete" }),
    /unsupported-intelligence-operation/,
  );
  await assert.rejects(
    new FredConnector({ fetcher }).series({ seriesId: "FEDFUNDS" }),
    /fred-not-configured/,
  );
  await assert.rejects(
    yahoo.chart({
      symbol: "BTC-USD",
      from: "2026-10-22",
      to: "2026-10-01",
    }),
    /invalid-yahoo-chart-range/,
  );
  const limited = new FinnhubConnector({
    apiKey: "test",
    fetcher,
    retries: 0,
    maxRequestsPerMinute: 1,
  });
  await limited.news();
  await assert.rejects(limited.news(), /finnhub-rate-limit/);
  assert.equal(limited.health().readOnly, true);
  console.log("intelligence connector tests: ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
