"use strict";

const assert = require("node:assert/strict"),
  {
    FinnhubConnector,
    FredConnector,
    IntelligenceService,
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
            headline: "Crypto adoption surge",
            summary: "Summary",
            url: "https://news.example/7",
            category: "crypto",
            datetime: 1_792_670_400,
          },
        ]);
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
    },
    finnhub = new FinnhubConnector({ apiKey: "test-finnhub", fetcher }),
    fred = new FredConnector({ apiKey: "test-fred", fetcher });

  assert.equal((await finnhub.news())[0].headline, "Crypto adoption surge");
  assert.equal(calls[0].url.searchParams.get("category"), "crypto");
  assert.equal(calls[0].options.headers["x-finnhub-token"], "test-finnhub");
  assert.equal(calls[0].url.searchParams.has("token"), false);
  assert.equal((await fred.series({ seriesId: "CPIAUCSL" }))[0].value, 3.1);
  assert.equal(calls[1].url.searchParams.get("api_key"), "test-fred");

  const service = new IntelligenceService({ connectors: { finnhub, fred } }),
    result = await service.query({
      provider: "fred",
      operation: "series",
      params: { seriesId: "FEDFUNDS" },
    });
  assert.equal(result.readOnly, true);
  assert.equal(result.paperOnly, true);
  const newsSignal = await service.newsSignal({ asset: "BTC" });
  assert.equal(newsSignal.paperOnly, true);
  assert.equal(newsSignal.observations, 1);
  assert.deepEqual(Object.keys(service.status().providers).sort(), [
    "finnhub",
    "fred",
  ]);
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
    finnhub.news({ category: "general" }),
    /invalid-news-category/,
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
