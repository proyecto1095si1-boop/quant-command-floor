"use strict";

const SCENARIOS = Object.freeze([
  {
    id: "covid-2020",
    version: 1,
    name: "COVID liquidity shock",
    horizon: "5d",
    source: "historical-calibration",
    factorShocks: {
      "crypto-core": -0.38,
      "high-beta-l1": -0.48,
      "venue-linked": -0.44,
    },
    liquidity: { spreadMultiplier: 6, depthMultiplier: 0.25 },
  },
  {
    id: "crypto-may-2021",
    version: 1,
    name: "Crypto deleveraging May 2021",
    horizon: "3d",
    source: "historical-calibration",
    factorShocks: {
      "crypto-core": -0.31,
      "high-beta-l1": -0.43,
      "venue-linked": -0.36,
    },
    liquidity: { spreadMultiplier: 5, depthMultiplier: 0.35 },
  },
  {
    id: "terra-2022",
    version: 1,
    name: "Terra ecosystem collapse",
    horizon: "7d",
    source: "historical-calibration",
    factorShocks: {
      "crypto-core": -0.24,
      "high-beta-l1": -0.55,
      "venue-linked": -0.3,
      stablecoin: -0.18,
    },
    liquidity: { spreadMultiplier: 8, depthMultiplier: 0.15 },
  },
  {
    id: "ftx-2022",
    version: 1,
    name: "Centralized venue insolvency",
    horizon: "5d",
    source: "historical-calibration",
    factorShocks: {
      "crypto-core": -0.24,
      "high-beta-l1": -0.38,
      "venue-linked": -0.55,
    },
    liquidity: { spreadMultiplier: 8, depthMultiplier: 0.2 },
    unavailableVenues: ["failed-venue"],
  },
  {
    id: "usdc-depeg-2023",
    version: 1,
    name: "Stablecoin reserve impairment",
    horizon: "2d",
    source: "historical-calibration",
    factorShocks: {
      stablecoin: -0.08,
      "crypto-core": -0.09,
      "high-beta-l1": -0.14,
      "venue-linked": -0.12,
    },
    liquidity: { spreadMultiplier: 10, depthMultiplier: 0.2 },
  },
  {
    id: "hypothetical-systemic",
    version: 1,
    name: "Systemic crypto and liquidity shock",
    horizon: "5d",
    source: "hypothetical",
    factorShocks: {
      "crypto-core": -0.3,
      "high-beta-l1": -0.45,
      "venue-linked": -0.5,
      stablecoin: -0.07,
    },
    liquidity: { spreadMultiplier: 10, depthMultiplier: 0.2 },
  },
]);

function listScenarios() {
  return SCENARIOS.map((scenario) => structuredClone(scenario));
}

function scenarioById(id) {
  const scenario = SCENARIOS.find((candidate) => candidate.id === id);
  if (!scenario)
    throw Object.assign(new Error("unknown-stress-scenario"), { status: 404 });
  return structuredClone(scenario);
}

function composeScenario(base, overrides = {}) {
  const allowed = [
    "factorShocks",
    "assetShocks",
    "liquidity",
    "unavailableVenues",
    "counterpartyHaircuts",
  ];
  if (Object.keys(overrides).some((key) => !allowed.includes(key)))
    throw Object.assign(new Error("unsupported-stress-override"), {
      status: 422,
    });
  return {
    ...structuredClone(base),
    factorShocks: { ...base.factorShocks, ...overrides.factorShocks },
    assetShocks: { ...base.assetShocks, ...overrides.assetShocks },
    liquidity: { ...base.liquidity, ...overrides.liquidity },
    unavailableVenues:
      overrides.unavailableVenues || base.unavailableVenues || [],
    counterpartyHaircuts: {
      ...base.counterpartyHaircuts,
      ...overrides.counterpartyHaircuts,
    },
  };
}

module.exports = { SCENARIOS, listScenarios, scenarioById, composeScenario };
