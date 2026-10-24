"use strict";

const assert = require("node:assert/strict"),
  { FLOOR_TOPOLOGY } = require("../server/floor/topology.js"),
  profiles = require("../dist/agent-profiles.js");
const nodes = FLOOR_TOPOLOGY.areas.flatMap((area) => area.nodes);
assert.deepEqual(
  new Set(profiles.ids),
  new Set(nodes.map((node) => node.id)),
  "every employee has a specific profile",
);
assert.equal(
  new Set(nodes.map((node) => profiles.profile(node.id).mission)).size,
  nodes.length,
  "employee missions are individual",
);
assert.match(
  profiles.describe("desk.btc", { output: { price: 100 } }).meaning,
  /cotización y propuesta son estados distintos/,
);
assert.match(
  profiles.describe("risk.manager", { output: { approved: false } }).activity,
  /vetada/,
);
assert.match(
  profiles.describe("risk.manager", { output: { halted: true } }).activity,
  /detenido/,
);
assert.match(
  profiles.describe("intake.news", {
    input: { observations: 3, asset: "SOL" },
    output: { signal: 0.5 },
  }).activity,
  /SOL:.*3 noticias/,
);
assert.match(
  profiles.describe("research.miner", null).activity,
  /Todavía no recibió/,
);
const unknown = profiles.describe("intake.news", {
  output: { unknown: "<img src=x onerror=alert(1)>" },
});
assert.doesNotMatch(JSON.stringify(unknown), /<img|unknown|onerror/);
console.log("personal employee profiles tests: ok");
