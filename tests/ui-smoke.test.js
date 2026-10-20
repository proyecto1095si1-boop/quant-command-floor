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

const document = window.document,
  rooms = document.querySelectorAll(".room");
assert.equal(rooms.length, 9, "the floor loads all nine areas");
assert.equal(document.querySelector("#engineState").textContent, "RUNNING");

document.querySelector('.room[data-id="2"]').click();
assert.equal(
  document.querySelector("#detailName").textContent,
  "Trading Floor",
);
assert.equal(
  document.querySelector("#detail").classList.contains("open"),
  true,
);
assert.equal(
  document.querySelector('.room[data-id="2"]').classList.contains("selected"),
  true,
);

document.querySelector("#engineToggle").click();
assert.equal(document.querySelector("#engineState").textContent, "PAUSED");
assert.equal(
  document.querySelector("#floor").classList.contains("paused"),
  true,
);
assert.equal(document.querySelector("#engineToggle").textContent, "▶ REANUDAR");

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

dom.window.close();
console.log("ui smoke tests: ok");
