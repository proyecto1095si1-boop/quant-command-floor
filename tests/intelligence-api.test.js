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
    gateway = createGateway({ intelligence }),
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
  } finally {
    await gateway.close();
  }
  console.log("intelligence API tests: ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
