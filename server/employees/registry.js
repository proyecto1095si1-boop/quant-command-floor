"use strict";

const { FLOOR_TOPOLOGY } = require("../floor/topology.js");

// Canonical inventory, not a claim that every visual node has its own executor.
// The only list of IDs remains the backend floor topology.
const EMPLOYEE_REGISTRY = Object.freeze(
  FLOOR_TOPOLOGY.areas.flatMap((area) =>
    area.nodes.map((node) =>
      Object.freeze({
        ...node,
        name: node.label,
        areaId: area.key,
        areaName: area.name,
      }),
    ),
  ),
);

module.exports = { EMPLOYEE_REGISTRY };
