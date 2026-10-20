"use strict";

const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  { JSDOM } = require("jsdom");

const dist = path.resolve(__dirname, "../dist"),
  html = fs.readFileSync(path.join(dist, "index.html"), "utf8"),
  payload = "<img src=x onerror=alert(1)>",
  dom = new JSDOM(html, {
    url: "http://localhost/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  }),
  { window } = dom;

window.alert = () => {
  throw new Error("alert-must-not-run");
};
for (const file of [
  "platform-config.js",
  "runtime.js",
  "data-plane.js",
  "research.js",
  "operations.js",
  "advanced.js",
  "audit-security.js",
])
  window.eval(fs.readFileSync(path.join(dist, file), "utf8"));

const app = fs
  .readFileSync(path.join(dist, "app.js"), "utf8")
  .replace('"Strategy Miner",', `${JSON.stringify(payload)},`);
window.eval(app);

const agent = window.document.querySelector(".agent-name");
assert.equal(agent.textContent, payload);
assert.equal(window.document.querySelectorAll('#rooms img[src="x"]').length, 0);

window.renderDesk({
  action: "LONG",
  signal: 0.5,
  confidence: 0.8,
  agreement: 0.75,
  agents: [
    {
      agent: payload,
      signal: 0.5,
      confidence: 0.8,
      evidence: [payload],
    },
  ],
  blockers: [],
  policy: { riskClass: "major", maxPortfolioWeight: 0.35 },
});
assert.equal(
  window.document.querySelector("#deskAgents b").textContent,
  payload,
);
assert.match(
  window.document.querySelector("#deskAgents small").textContent,
  /<img/,
);
assert.equal(
  window.document.querySelectorAll('#deskAgents img[src="x"]').length,
  0,
);

const csp = window.document.querySelector(
  'meta[http-equiv="Content-Security-Policy"]',
);
assert.ok(csp, "Content-Security-Policy meta is required");
assert.match(csp.content, /default-src 'self'/);
assert.match(csp.content, /object-src 'none'/);

dom.window.close();
console.log("ui xss tests: ok");
