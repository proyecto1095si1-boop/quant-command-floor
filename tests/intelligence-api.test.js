"use strict";

const assert = require("node:assert/strict"),
  { createGateway } = require("../server/gateway.js");

(async () => {
  const calls = [],
    intelligence = {
      status: () => ({ paperOnly: true, providers: {} }),
      query: async (request) => {
        calls.push(request);
        return { paperOnly: true, readOnly: true, data: [] };
      },
    },
    intelligenceDag = {
      status: () => ({ paperOnly: true, assets: {} }),
      refresh: async (asset) => ({
        asset,
        paperOnly: true,
        consensus: { status: "blocked" },
      }),
    },
    gateway = createGateway({ intelligence, intelligenceDag }),
    address = await gateway.listen(0),
    base = `http://127.0.0.1:${address.port}`;
  try {
    const status = await fetch(`${base}/v1/intelligence/status`);
    assert.equal(status.status, 200);
    assert.equal((await status.json()).paperOnly, true);
    const query = await fetch(`${base}/v1/intelligence/query`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: "fred",
        operation: "series",
        params: { seriesId: "CPIAUCSL" },
      }),
    });
    assert.equal(query.status, 200);
    assert.equal((await query.json()).readOnly, true);
    assert.equal(calls[0].params.seriesId, "CPIAUCSL");
    const dagStatus = await fetch(`${base}/v1/intelligence/dag/status`);
    assert.equal(dagStatus.status, 200);
    assert.equal((await dagStatus.json()).paperOnly, true);
    const refresh = await fetch(`${base}/v1/intelligence/dag/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ asset: "BTC" }),
    });
    assert.equal(refresh.status, 200);
    assert.equal((await refresh.json()).asset, "BTC");
  } finally {
    await gateway.close();
  }
  console.log("intelligence API tests: ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
