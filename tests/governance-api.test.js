"use strict";

const assert = require("node:assert/strict"),
  { createGateway } = require("../server/gateway.js");

(async () => {
  const calls = [],
    governance = {
      status: () => ({ paperOnly: true, models: 1 }),
      list: () => ({ paperOnly: true, models: [{ modelId: "risk" }] }),
      register: async (input, actor) => {
        calls.push(["register", actor, input]);
        return { ...input, stage: "challenger" };
      },
      evaluate: async (input, actor) => {
        calls.push(["evaluate", actor, input]);
        return { eligible: true };
      },
      promote: async (input, approvals) => {
        calls.push(["promote", approvals, input]);
        return { paperOnly: true, model: { stage: "champion" } };
      },
    },
    gateway = createGateway({ governance }),
    address = await gateway.listen(0),
    base = `http://127.0.0.1:${address.port}`,
    getStatus = await fetch(`${base}/v1/governance/status`);
  assert.equal((await getStatus.json()).models, 1);
  const models = await fetch(`${base}/v1/governance/models`);
  assert.equal((await models.json()).paperOnly, true);
  const register = await fetch(`${base}/v1/governance/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ modelId: "risk", version: "1", kind: "math" }),
  });
  assert.equal(register.status, 200);
  assert.equal((await register.json()).stage, "challenger");
  const evaluate = await fetch(`${base}/v1/governance/evaluate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ modelId: "risk", version: "1" }),
  });
  assert.equal((await evaluate.json()).eligible, true);
  const promote = await fetch(`${base}/v1/governance/promote`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-second-approver": "risk-reviewer",
    },
    body: JSON.stringify({ modelId: "risk", version: "1" }),
  });
  assert.equal(promote.status, 200);
  assert.equal((await promote.json()).model.stage, "champion");
  assert.deepEqual(calls.at(-1)[1], {
    primary: "local-development",
    secondary: "risk-reviewer",
  });
  await gateway.close();
  console.log("governance API tests: ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
