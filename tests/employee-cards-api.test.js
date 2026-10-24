"use strict";

const assert = require("node:assert/strict"),
  net = require("node:net"),
  { createGateway } = require("../server/gateway.js"),
  { SecurityManager } = require("../server/security/manager.js"),
  {
    validateEmployeeCard,
    CARD_LIMITS,
  } = require("../server/employees/contract.js");

(async () => {
  const security = new SecurityManager({
      environment: "production",
      secret: "e".repeat(32),
    }),
    token = security.issue({ sub: "employee-reader", role: "viewer" }),
    gateway = createGateway({
      security,
      allowedOrigin: "http://localhost:8080",
      llm: {
        fetcher: () => {
          throw new Error("card-must-not-invoke-ai");
        },
      },
    }),
    address = await gateway.listen(0),
    base = `http://127.0.0.1:${address.port}`,
    headers = { authorization: `Bearer ${token}` };
  let socket;
  try {
    assert.equal((await fetch(base + "/v1/employees")).status, 401);
    assert.equal(
      (await fetch(base + "/v1/employees/desk.btc/card")).status,
      401,
    );
    const listResponse = await fetch(base + "/v1/employees", { headers });
    assert.equal(listResponse.status, 200);
    const list = await listResponse.json();
    assert.equal(list.paperOnly, true);
    assert.equal(list.employees.length, 33);
    for (const employee of list.employees) {
      const response = await fetch(`${base}/v1/employees/${employee.id}/card`, {
        headers,
      });
      assert.equal(response.status, 200, employee.id);
      const body = await response.json();
      assert.equal(validateEmployeeCard(body).valid, true, employee.id);
      assert.ok(
        Buffer.byteLength(JSON.stringify(body)) <= CARD_LIMITS.cardBytes,
      );
    }
    assert.equal(
      (await fetch(base + "/v1/employees/no.such.employee/card", { headers }))
        .status,
      404,
    );
    assert.equal(
      (await fetch(base + "/v1/employees/desk.btc/card?asset=ADA", { headers }))
        .status,
      422,
    );
    const floor = await (
      await fetch(base + "/v1/floor/snapshot", { headers })
    ).json();
    assert.equal(floor.employees.length, 33);
    socket = net.connect(address.port, "127.0.0.1");
    await new Promise((resolve, reject) => {
      socket.once("error", reject);
      socket.once("data", (chunk) => {
        assert.match(chunk.toString(), /^HTTP\/1\.1 101/);
        resolve();
      });
      socket.write(
        [
          "GET /v1/stream HTTP/1.1",
          "Host: localhost",
          "Connection: Upgrade",
          "Upgrade: websocket",
          "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
          "Sec-WebSocket-Version: 13",
          "Origin: http://localhost:8080",
          `Authorization: Bearer ${token}`,
          "",
          "",
        ].join("\r\n"),
      );
    });
    const updated = new Promise((resolve, reject) => {
      let data = "";
      const timer = setTimeout(
        () => reject(new Error("missing-employee-update")),
        2000,
      );
      socket.on("data", (chunk) => {
        data += chunk.toString();
        if (
          data.includes('"type":"employee.updated"') &&
          data.includes('"id":"consensus.technical"')
        ) {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    gateway.publish({
      type: "desk.analysis",
      report: {
        asset: "BTC",
        at: new Date().toISOString(),
        status: "ok",
        signal: 0.32,
        confidence: 0.61,
        agents: [
          {
            agent: "Technical",
            signal: 0.32,
            confidence: 0.61,
            metrics: { fast: 100, slow: 99, rsi: 54, atr: 1 },
          },
        ],
        inputSummary: { candles: 60 },
      },
    });
    await updated;
    const card = await (
      await fetch(base + "/v1/employees/consensus.technical/card?asset=BTC", {
        headers,
      })
    ).json();
    assert.equal(card.latest.raw.signal, 0.32);
    assert.equal(card.latest.asset, "BTC");
    const health = await (await fetch(base + "/v1/health")).json();
    assert.equal(
      health.metrics.executions,
      0,
      "reading cards never executes an agent or LLM",
    );
    console.log(
      "employee card API: 33 validated cards, auth, floor summary and WebSocket update OK; no executions",
    );
  } finally {
    socket?.destroy();
    await gateway.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
