"use strict";

const { DESK_PARAMETERS } = require("../desks/parameters.js"),
  { DAY_MS, NEWS_MAX_AGE_MS, NODE_WEIGHTS } = require("../intelligence/dag.js"),
  descriptions = require("../../dist/agent-profiles.js");

function parametersFor(employee, sources) {
  const rows = [],
    add = (name, value, source, unit = null) => {
      if (
        typeof value === "boolean" ||
        typeof value === "string" ||
        (typeof value === "number" && Number.isFinite(value))
      )
        rows.push({
          name,
          value,
          source,
          unit:
            unit ||
            (/Ms$/.test(name)
              ? "ms"
              : /Bps$/.test(name)
                ? "puntos básicos"
                : source.startsWith("server/desks/parameters") &&
                    /Period$|Window$|^window$/.test(name)
                  ? "velas"
                  : /Atr$/.test(name)
                    ? "múltiplos de ATR"
                    : name === "depthScale"
                      ? "unidades del activo"
                      : "sin unidad"),
        });
    },
    policy = (values, source) => {
      for (const [key, value] of Object.entries(values || {}))
        add(key, value, `${source}.${key}`);
    },
    desks = sources.desks || sources.pipeline?.desks,
    backendName = employee.agent || employee.label;
  policy(
    DESK_PARAMETERS[backendName],
    `server/desks/parameters.js:DESK_PARAMETERS.${backendName}`,
  );
  if (desks?.weights?.[backendName] !== undefined)
    add("consensusWeight", desks.weights[backendName], "DeskRegistry.weights");
  if (desks?.weights?.[backendName] !== undefined) {
    add("minCandles", desks.minCandles, "DeskRegistry.minCandles", "velas");
    add(
      "minTrades",
      desks.minTrades,
      "DeskRegistry.minTrades",
      "transacciones",
    );
  }
  if (employee.asset && desks?.assets?.[employee.asset]) {
    policy(
      desks.assets[employee.asset],
      `DeskRegistry.assets.${employee.asset}`,
    );
    add("minCandles", desks.minCandles, "DeskRegistry.minCandles", "velas");
    add(
      "minTrades",
      desks.minTrades,
      "DeskRegistry.minTrades",
      "transacciones",
    );
  }
  if (employee.id.startsWith("risk.")) {
    policy(sources.pipeline?.risk?.limits, "RiskGate.limits");
    add(
      "periodsPerYear",
      sources.pipeline?.risk?.periodsPerYear,
      "RiskGate.periodsPerYear",
      "períodos/año",
    );
  }
  if (employee.id.startsWith("portfolio."))
    policy(sources.portfolio?.policy, "PortfolioService.policy");
  if (employee.id.startsWith("research.") && employee.id !== "research.miner")
    policy(sources.research?.policy, "ResearchLab.policy");
  if (employee.id.startsWith("execution."))
    policy(sources.execution?.policy, "ExecutionService.policy");
  if (employee.id === "execution.broker")
    for (const name of [
      "makerFeeRate",
      "takerFeeRate",
      "latencyMs",
      "minNotional",
      "lotSize",
      "baseSlippageBps",
      "impactBps",
    ])
      add(name, sources.pipeline?.ledger?.[name], `PaperLedger.${name}`);
  if (employee.id === "consensus.signal")
    policy(desks?.consensus?.policy, "ConsensusEngine.policy");
  if (employee.id === "intake.news" || employee.id === "intake.intel") {
    add(
      "maxSnapshotAgeMs",
      sources.intelligenceDag?.maxSnapshotAgeMs,
      "IntelligenceDag.maxSnapshotAgeMs",
      "ms",
    );
    add(
      "minimumSources",
      sources.intelligenceDag?.minimumSources,
      "IntelligenceDag.minimumSources",
      "fuentes",
    );
    if (employee.id === "intake.news") {
      add(
        "newsMaxAgeMs",
        NEWS_MAX_AGE_MS,
        "server/intelligence/dag.js:NEWS_MAX_AGE_MS",
        "ms",
      );
      add("newsHalfLifeMs", DAY_MS, "server/intelligence/dag.js:DAY_MS", "ms");
    } else policy(NODE_WEIGHTS, "server/intelligence/dag.js:NODE_WEIGHTS");
  }
  if (employee.id === "intake.data" || employee.id === "sre.feeds") {
    add(
      "pollMs",
      sources.dataService?.pollMs,
      "MarketDataService.pollMs",
      "ms",
    );
    for (const name of ["maxAgeMs", "maxGapMs", "zLimit", "window"])
      add(
        name,
        sources.dataService?.quality?.[name],
        `DataQualityMonitor.${name}`,
      );
  }
  if (employee.id === "sre.api") policy(sources.sre?.slos, "SreService.slos");
  return rows;
}
function specificationFor(employee, sources) {
  const description = descriptions.profile(employee.id),
    parameters = parametersFor(employee, sources);
  return {
    identity: {
      id: employee.id,
      name: employee.name,
      role: description.role,
      area: { id: employee.areaId, name: employee.areaName },
      type:
        employee.engine === "ai"
          ? "ai"
          : employee.engine === "ensemble"
            ? "hybrid"
            : "deterministic",
    },
    work: {
      function: description.mission,
      method: description.method,
      parameters,
      parameterStatus: parameters.length
        ? "Parámetros obtenidos del código o de la instancia activa indicada en source."
        : "No hay parámetros públicos de un ejecutor conectado para este empleado; no se copiaron valores de otro motor.",
    },
    contribution: description.delivers,
  };
}
module.exports = { parametersFor, specificationFor };
