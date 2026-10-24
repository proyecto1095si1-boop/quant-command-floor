"use strict";

const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  { JSDOM } = require("jsdom"),
  { EMPLOYEE_REGISTRY } = require("../server/employees/registry.js"),
  { FLOOR_TOPOLOGY } = require("../server/floor/topology.js"),
  { DeskRegistry } = require("../server/desks/registry.js"),
  profiles = require("../dist/agent-profiles.js");

const sorted = (ids) => [...ids].sort(),
  expected = sorted(EMPLOYEE_REGISTRY.map((employee) => employee.id)),
  dist = path.resolve(__dirname, "../dist");

(async () => {
  assert.equal(expected.length, 33, "the canonical inventory has 33 employees");
  assert.equal(new Set(expected).size, expected.length);
  assert.deepEqual(
    sorted(profiles.ids),
    expected,
    "profiles and server registry must have exactly the same IDs",
  );
  const desks = new DeskRegistry().list();
  assert.deepEqual(
    sorted(
      EMPLOYEE_REGISTRY.filter((row) => row.asset).map((row) => row.asset),
    ),
    sorted(desks.map((row) => row.asset)),
  );
  for (const desk of desks) {
    const connected = EMPLOYEE_REGISTRY.filter(
      (row) => row.event === "desk.analysis" && !row.asset,
    ).map((row) => row.agent || row.label);
    assert.deepEqual(
      sorted(connected),
      sorted(desk.agents),
      `all actual agents of ${desk.asset} must be represented once`,
    );
  }
  const dom = new JSDOM(
      fs.readFileSync(path.join(dist, "index.html"), "utf8"),
      {
        url: "http://localhost/",
        runScripts: "outside-only",
        pretendToBeVisual: true,
      },
    ),
    requests = [];
  const { window } = dom;
  window.WebSocket = class {
    close() {}
  };
  window.fetch = async (url, options = {}) => {
    requests.push({ url, method: options.method || "GET" });
    return {
      ok: true,
      json: async () =>
        url.endsWith("/v1/floor/topology")
          ? FLOOR_TOPOLOGY
          : { paperOnly: true, markets: [], events: [], intelligence: [] },
    };
  };
  try {
    for (const script of window.document.querySelectorAll("script[src]"))
      window.eval(
        fs.readFileSync(path.join(dist, script.getAttribute("src")), "utf8"),
      );
    // Check the offline fallback before the asynchronous backend load.
    const uiIds = () =>
      sorted(
        [...window.document.querySelectorAll(".agent[data-node-id]")].map(
          (node) => node.dataset.nodeId,
        ),
      );
    assert.deepEqual(
      uiIds(),
      expected,
      "offline map fallback must use canonical IDs",
    );
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(
      uiIds(),
      expected,
      "the backend-driven map must use canonical IDs",
    );
    for (const node of window.document.querySelectorAll(".agent[data-node-id]"))
      node.click();
    assert.ok(
      requests.every((request) => request.method === "GET"),
      "loading and selecting employees must never execute agents or orders",
    );
  } finally {
    window.close();
  }
  const document = fs.readFileSync(
    path.resolve(__dirname, "../docs/INVENTARIO_EMPLEADOS.md"),
    "utf8",
  );
  assert.match(document, /Total canónico: \*\*33\*\*/);
  const documentedIds = [...document.matchAll(/^\| `([^`]+)` \|/gm)].map(
    (match) => match[1],
  );
  assert.deepEqual(
    sorted(documentedIds),
    expected,
    "the inventory document must list every ID exactly once",
  );
  console.log(
    "employee inventory: 33 registry = 33 profiles = 33 map nodes; all desk agents mapped; no mutations on selection",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
