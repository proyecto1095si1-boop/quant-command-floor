const assert = require("node:assert/strict"),
  { KrakenConnector, PAIRS } = require("../server/data/kraken.js");

function reply({ ok = true, status = 200, body = {} } = {}) {
  return { ok, status, json: async () => body };
}

(async () => {
  assert.equal(PAIRS["BTC-USD"], "XBTUSD");
  assert.equal(PAIRS["BNB-USD"], "BNBUSD");
  let requestedUrl, requestedOptions;
  const connector = new KrakenConnector({
    retries: 0,
    fetcher: async (url, options) => {
      requestedUrl = url;
      requestedOptions = options;
      return reply({
        body: {
          error: [],
          result: {
            XXBTZUSD: {
              c: ["100.5", "0.25"],
              b: ["100.4"],
              a: ["100.6"],
              v: ["10", "20"],
            },
          },
        },
      });
    },
  });
  const ticker = await connector.ticker("BTC-USD");
  assert.match(requestedUrl, /pair=XBTUSD$/);
  assert.equal(requestedOptions.headers.accept, "application/json");
  assert.equal(ticker.source, "kraken");
  assert.equal(ticker.symbol, "BTC-USD");
  assert.equal(ticker.price, 100.5);
  assert.equal(ticker.bid, 100.4);
  assert.equal(ticker.ask, 100.6);
  assert.equal(ticker.size, 0.25);
  assert.equal(ticker.volume24h, 20);
  assert.equal(connector.stats.requests, 1);
  assert.equal(connector.stats.errors, 0);
  assert.equal(connector.health().status, "healthy");

  let attempts = 0;
  const retrying = new KrakenConnector({
    retries: 1,
    fetcher: async () => {
      attempts++;
      if (attempts === 1) return reply({ ok: false, status: 429 });
      return reply({
        body: {
          result: {
            SOLUSD: {
              c: ["50", "1"],
              b: ["49"],
              a: ["51"],
              v: ["2", "3"],
            },
          },
        },
      });
    },
  });
  assert.equal((await retrying.ticker("SOL-USD")).price, 50);
  assert.equal(attempts, 2);
  assert.equal(retrying.stats.errors, 1);
  assert.equal(retrying.health().status, "degraded");

  const cases = [
    [reply({ body: { error: ["EGeneral:Permission denied"] } }), /kraken:/],
    [reply({ body: { error: [], result: {} } }), /kraken-empty/],
  ];
  for (const [result, expected] of cases) {
    const failing = new KrakenConnector({
      retries: 0,
      fetcher: async () => result,
    });
    await assert.rejects(failing.ticker("CUSTOM-USD"), expected);
    assert.equal(failing.stats.errors, 1);
    assert.equal(failing.health().status, "down");
  }

  const timedOut = new KrakenConnector({
    retries: 0,
    timeoutMs: 5,
    fetcher: async (_url, { signal }) =>
      new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason));
      }),
  });
  await assert.rejects(timedOut.ticker("ETH-USD"), { name: "AbortError" });
  assert.equal(timedOut.stats.errors, 1);

  console.log("kraken tests: ok");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
