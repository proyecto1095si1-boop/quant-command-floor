const assert = require("node:assert/strict");
const P = require("../dist/platform-config.js");
(async () => {
  assert.equal(P.validateUrl("http://localhost:8787").valid, true);
  assert.equal(P.validateUrl("http://example.com").valid, false);
  assert.equal(P.validateUrl("https://api.example.com").valid, true);
  assert.equal(
    P.validate({ ...P.DEFAULTS, environment: "production" }).valid,
    false,
  );
  const config = P.sanitize({
    temperature: 9,
    topP: -1,
    maxTokens: 2,
    retries: 99,
  });
  assert.equal(config.temperature, 2);
  assert.equal(config.topP, 0);
  assert.equal(config.maxTokens, 64);
  assert.equal(config.retries, 5);
  const memory = new Map(),
    storage = {
      getItem: (k) => memory.get(k),
      setItem: (k, v) => memory.set(k, v),
      removeItem: (k) => memory.delete(k),
    };
  const store = new P.ConfigStore(storage),
    saved = store.save({ ...P.DEFAULTS, model: "qwen-local" });
  assert.equal(saved.model, "qwen-local");
  assert.equal(store.load().model, "qwen-local");
  const health = new P.InfraHealth({ window: 9 });
  [40, 41, 39, 40, 42, 41, 40, 39].forEach((x) => health.add(x));
  assert.equal(health.add(400).anomaly, true);
  const breaker = new P.CircuitBreaker({ failures: 2, cooldownMs: 10000 });
  breaker.failure();
  assert.equal(breaker.state, "closed");
  breaker.failure();
  assert.equal(breaker.state, "open");
  breaker.success();
  assert.equal(breaker.state, "closed");
  const req = P.agentRequest(
    saved,
    "Macro News Reader",
    { headline: "CPI" },
    "classification",
  );
  assert.equal(req.body.policy.paper_only, true);
  assert.equal(req.body.model.temperature, saved.temperature);
  assert.ok(!JSON.stringify(req).includes("apiKey"));
  let calls = 0;
  const client = new P.PlatformClient({ ...saved, retries: 1 }, async () => {
    calls++;
    if (calls === 1) return { ok: false, status: 503 };
    return {
      ok: true,
      json: async () => ({
        agent_id: "Macro News Reader",
        status: "ok",
        signal: 0.4,
        confidence: 0.91,
        evidence: ["CPI source"],
      }),
    };
  });
  const external = await client.execute("Macro News Reader", {
    headline: "CPI",
  });
  assert.equal(calls, 2);
  assert.equal(external.source, "gateway");
  assert.equal(external.signal, 0.4);
  assert.equal(client.breaker.state, "closed");
  console.log("platform config tests: ok");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
