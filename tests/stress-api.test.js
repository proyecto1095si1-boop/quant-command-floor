"use strict";

const assert = require("node:assert/strict"),
  { createGateway } = require("../server/gateway.js");

(async () => {
  const calls = [],
    portfolio = {
      scenarios: () => ({ paperOnly: true, scenarios: [{ id: "scenario" }] }),
      stressStatus: () => ({ paperOnly: true, runs: 1 }),
      stress: async (input) => {
        calls.push(["stress", input]);
        return { paperOnly: true, worstLoss: 100 };
      },
      reverseStress: (input) => {
        calls.push(["reverse", input]);
        return { paperOnly: true, market: { criticalShock: -0.2 } };
      },
    },
    gateway = createGateway({ portfolio }),
    address = await gateway.listen(0),
    base = `http://127.0.0.1:${address.port}`;

  const scenarios = await fetch(`${base}/v1/risk/scenarios`);
  assert.equal(scenarios.status, 200);
  assert.equal((await scenarios.json()).paperOnly, true);
  const status = await fetch(`${base}/v1/risk/stress/status`);
  assert.equal((await status.json()).runs, 1);
  const stress = await fetch(`${base}/v1/risk/stress`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ portfolioPlanId: "plan-1" }),
  });
  assert.equal(stress.status, 200);
  assert.equal((await stress.json()).worstLoss, 100);
  const reverse = await fetch(`${base}/v1/risk/reverse-stress`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ portfolioPlanId: "plan-1" }),
  });
  assert.equal(reverse.status, 200);
  assert.equal((await reverse.json()).market.criticalShock, -0.2);
  assert.deepEqual(calls, [
    ["stress", { portfolioPlanId: "plan-1" }],
    ["reverse", { portfolioPlanId: "plan-1" }],
  ]);
  await gateway.close();
  console.log("stress API tests: ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
