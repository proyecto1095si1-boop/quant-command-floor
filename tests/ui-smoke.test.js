"use strict";

const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  { JSDOM } = require("jsdom");

const dist = path.resolve(__dirname, "../dist"),
  html = fs.readFileSync(path.join(dist, "index.html"), "utf8"),
  dom = new JSDOM(html, {
    url: "http://localhost/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  }),
  { window } = dom;

const requests = [];
class MockWebSocket {
  static instances = [];
  constructor(url) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }
  close() {}
}
window.WebSocket = MockWebSocket;
window.fetch = async (url, options = {}) => {
  requests.push({ url, options });
  return { ok: true, status: 200, json: async () => ({}) };
};

for (const file of [
  "platform-config.js",
  "runtime.js",
  "data-plane.js",
  "research.js",
  "operations.js",
  "advanced.js",
  "audit-security.js",
  "app.js",
])
  window.eval(fs.readFileSync(path.join(dist, file), "utf8"));

(async () => {
  const document = window.document,
    rooms = document.querySelectorAll(".room");
  assert.equal(rooms.length, 9, "the floor loads all nine areas");
  assert.equal(document.querySelector("#engineState").textContent, "RUNNING");

  document.querySelector('.room[data-id="2"]').click();
  assert.equal(
    document.querySelector("#detailName").textContent,
    "Mesas de Activos",
  );
  assert.equal(
    document.querySelector("#detail").classList.contains("open"),
    true,
  );
  assert.equal(
    document.querySelector('.room[data-id="2"]').classList.contains("selected"),
    true,
  );
  assert.ok(
    document.querySelector('.agent[data-node-id="desk.btc"]'),
    "employees expose stable backend node IDs",
  );
  MockWebSocket.instances[0].onmessage({
    data: JSON.stringify({
      type: "desk.analysis",
      report: {
        asset: "BTC",
        status: "ok",
        action: "BUY",
        signal: 0.7,
        confidence: 0.8,
        inputSummary: { candles: 120, apiKey: "must-not-render" },
        formula: "weighted consensus",
        agents: [{ agent: "Technical", signal: 0.6, confidence: 0.75 }],
      },
    }),
  });
  assert.equal(
    document.querySelector('.agent[data-node-id="desk.btc"]').dataset.state,
    "ok",
    "desk stream events update the corresponding employee",
  );
  assert.equal(
    document
      .querySelector('[data-link-id="desks-consensus"]')
      .classList.contains("live"),
    true,
    "a real event activates its data-flow link",
  );
  assert.equal(document.querySelector("#nodeEventCount").textContent, "1");
  assert.match(document.querySelector("#nodeEventList").textContent, /candles/);
  assert.match(
    document.querySelector("#nodeEventList").textContent,
    /\[redacted\]/,
  );
  assert.doesNotMatch(
    document.querySelector("#nodeEventList").textContent,
    /must-not-render/,
    "sensitive payload fields are redacted",
  );
  assert.equal(
    requests.some(({ url }) => url.endsWith("/v1/floor/topology")),
    true,
    "the map requests its canonical topology from the backend",
  );

  document.querySelector("#engineToggle").click();
  assert.equal(document.querySelector("#engineState").textContent, "PAUSED");
  assert.equal(
    document.querySelector("#floor").classList.contains("paused"),
    true,
  );
  assert.equal(
    document.querySelector("#engineToggle").textContent,
    "▶ REANUDAR",
  );

  document.querySelector("#killSwitch").click();
  assert.equal(document.querySelector("#engineState").textContent, "HALTED");
  assert.equal(
    document.querySelector("#floor").classList.contains("halted"),
    true,
  );
  assert.equal(document.querySelector("#riskGate").textContent, "LOCKED");
  assert.equal(
    document.querySelector("#killSwitch").classList.contains("active"),
    true,
  );
  assert.equal(
    requests.some(
      ({ url, options }) =>
        url.endsWith("/v1/pipeline/halt") && options.method === "POST",
    ),
    true,
    "the primary Kill Switch calls the backend halt endpoint",
  );

  document.querySelector("#aiCostOpen").click();
  assert.equal(
    document.querySelector("#aiCostModal").classList.contains("open"),
    true,
    "the AI cost console opens from the map toolbar",
  );
  assert.equal(
    requests.some(({ url }) => url.endsWith("/v1/ai/costs")),
    true,
    "the AI cost console requests its backend ledger",
  );
  assert.equal(
    requests.some(({ url }) => url.endsWith("/v1/ai/cost-reconciliation")),
    true,
    "the AI cost console requests invoice reconciliation",
  );
  assert.ok(document.querySelector("#aiCostSigned"));

  document.querySelector("#intelligenceOpen").click();
  assert.equal(
    document.querySelector("#intelligenceModal").classList.contains("open"),
    true,
    "the external data API console opens",
  );
  assert.equal(
    requests.some(({ url }) => url.endsWith("/v1/intelligence/status")),
    true,
    "the external data API console requests provider status",
  );
  assert.equal(
    requests.some(({ url }) => url.endsWith("/v1/intelligence/dag/status")),
    true,
    "the external data API console requests intelligence DAG status",
  );
  await new Promise((resolve) => setImmediate(resolve));

  const snapshotAt = Date.now(),
    snapshot = {
      paperOnly: true,
      at: snapshotAt,
      markets: [
        {
          symbol: "SOL-USD",
          ticker: {
            price: 123.45,
            source: "coinbase",
            receivedAt: new Date(snapshotAt).toISOString(),
          },
        },
      ],
      events: [],
      intelligence: [],
      pipeline: {
        halted: true,
        haltReason: "manual",
        risk: { halted: true },
        portfolio: { equity: 100000 },
        audit: { valid: true },
      },
      execution: { queue: 2, metrics: { fills: 1 } },
    };
  window.fetch = async () => ({ ok: true, json: async () => snapshot });
  await window.syncFloor();
  document.querySelector('.agent[data-node-id="desk.sol"]').click();
  assert.match(
    document.querySelector("#nodeLiveActivity").textContent,
    /123.45.*esperando análisis/,
  );
  assert.match(document.querySelector("#modelOutput").textContent, /123.45/);
  assert.equal(
    document.querySelector("#confidenceValue").textContent,
    "—",
    "market prices must not invent analytical confidence",
  );
  assert.equal(document.querySelector("#nodeEventCount").textContent, "1");
  await window.syncFloor();
  assert.equal(
    document.querySelector("#nodeEventCount").textContent,
    "1",
    "unchanged market snapshots are deduplicated",
  );
  document.querySelector('.agent[data-node-id="risk.manager"]').click();
  assert.match(
    document.querySelector("#nodeLiveActivity").textContent,
    /HALT: manual/,
  );
  assert.equal(
    document.querySelector("#nodeLiveStatus").textContent,
    "BLOCKED",
  );
  document.querySelector('.agent[data-node-id="desk.sol"]').click();
  const originalNow = window.Date.now;
  window.Date.now = () => snapshotAt + 60000;
  MockWebSocket.instances[0].onopen();
  window.renderLiveEmployee();
  assert.equal(
    document.querySelector("#nodeLiveStatus").textContent,
    "DATOS ANTIGUOS",
  );
  MockWebSocket.instances[0].onclose();
  window.renderLiveEmployee();
  assert.equal(
    document.querySelector("#nodeLiveStatus").textContent,
    "DESCONECTADO",
  );
  assert.equal(
    document.querySelector('.agent[data-node-id="desk.sol"]').dataset.freshness,
    "offline",
  );

  window.Date.now = originalNow;
  await new Promise((resolve) => setImmediate(resolve));
  window.fetch = async (url) => {
    if (url.includes("api.exchange.coinbase.com"))
      return {
        ok: true,
        status: 200,
        json: async () => ({ price: "100", bid: "99.9", ask: "100.1" }),
      };
    if (url.includes("api.kraken.com"))
      return {
        ok: true,
        status: 200,
        json: async () => ({ result: { XXBTZUSD: { c: ["101"] } } }),
      };
    throw new Error("hosted-backend-unavailable");
  };
  await window.refreshMarketData();
  assert.equal(document.querySelector("#dataStatus").textContent, "HEALTHY");
  assert.equal(
    document.querySelector("#dataSource").textContent,
    "COINBASE + KRAKEN",
  );
  assert.match(document.querySelector("#dataPrice").textContent, /100/);

  dom.window.close();
  console.log("ui smoke tests: ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
