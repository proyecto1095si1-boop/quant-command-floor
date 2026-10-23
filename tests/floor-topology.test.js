"use strict";

const assert = require("node:assert/strict"),
  { FLOOR_TOPOLOGY } = require("../server/floor/topology.js");

assert.equal(FLOOR_TOPOLOGY.paperOnly, true);
assert.deepEqual(FLOOR_TOPOLOGY.assets, ["BTC", "ETH", "SOL", "BNB"]);
assert.equal(FLOOR_TOPOLOGY.areas.length, 9);

const areaKeys = new Set(FLOOR_TOPOLOGY.areas.map((area) => area.key)),
  nodes = FLOOR_TOPOLOGY.areas.flatMap((area) => area.nodes),
  nodeIds = nodes.map((node) => node.id);
assert.equal(
  new Set(nodeIds).size,
  nodeIds.length,
  "floor node IDs are unique",
);
assert.ok(nodes.every((node) => node.id && node.label && node.engine));
assert.ok(
  FLOOR_TOPOLOGY.links.every(
    (link) => areaKeys.has(link.from) && areaKeys.has(link.to),
  ),
  "every visual link references existing areas",
);

const serialized = JSON.stringify(FLOOR_TOPOLOGY).toLowerCase();
for (const forbidden of ["forex", "stock", "etf", "yield farmer", "real order"])
  assert.equal(
    serialized.includes(forbidden),
    false,
    `${forbidden} is out of scope`,
  );

console.log("floor topology tests: ok");
