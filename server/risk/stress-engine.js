"use strict";

const crypto = require("node:crypto"),
  { listScenarios, scenarioById, composeScenario } = require("./scenarios.js"),
  { liquidationCost } = require("./liquidity.js"),
  {
    ridgeFactorLoadings,
    stressCorrelation,
    lowerTailDependence,
  } = require("./dependency.js"),
  { reverseMarketShock } = require("./reverse-stress.js");

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stable(value[key])]),
    );
  return value;
}

function digest(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(stable(value)))
    .digest("hex");
}

function validatePlan(plan) {
  if (!plan || !(Number(plan.equity) > 0) || !Array.isArray(plan.allocations))
    throw Object.assign(new Error("invalid-stress-portfolio"), { status: 422 });
  if (
    plan.allocations.some(
      (row) =>
        !Number.isFinite(Number(row.targetWeight)) ||
        !Number.isFinite(Number(row.tradeNotional)),
    )
  )
    throw Object.assign(new Error("invalid-stress-allocation"), {
      status: 422,
    });
}

class StressEngine {
  constructor({ record = async () => {}, policy = {} } = {}) {
    this.record = record;
    this.policy = {
      impactCoefficient: 0.5,
      participationRate: 0.1,
      missingLiquidityHaircut: 0.05,
      operationalReserveRatio: 0.01,
      ...policy,
    };
    this.runs = [];
    this.reverseRuns = [];
  }

  scenarios() {
    return { paperOnly: true, engineVersion: 1, scenarios: listScenarios() };
  }

  status() {
    return {
      paperOnly: true,
      engineVersion: 1,
      runs: this.runs.length,
      reverseRuns: this.reverseRuns.length,
      lastRun: this.runs.at(-1) || null,
      lastReverseRun: this.reverseRuns.at(-1) || null,
    };
  }

  evaluateScenario(plan, scenario, input = {}) {
    const liquidityData = input.liquidityData || {},
      rows = plan.allocations.map((allocation) => {
        const product = allocation.product,
          factor =
            allocation.factor || allocation.riskClass || allocation.asset,
          notional = Math.abs(allocation.targetWeight * plan.equity),
          shock = Number(
            scenario.assetShocks?.[product] ??
              scenario.factorShocks?.[factor] ??
              0,
          ),
          venue = allocation.venue || "unclassified",
          venueUnavailable = scenario.unavailableVenues?.includes(venue),
          liquidity = liquidationCost(
            { notional },
            liquidityData[product],
            { ...scenario.liquidity, venueUnavailable },
            this.policy,
          ),
          marketLoss = -notional * shock,
          counterpartyRate = Number(
            scenario.counterpartyHaircuts?.[venue] || 0,
          ),
          counterpartyLoss = notional * Math.max(0, counterpartyRate);
        return {
          asset: allocation.asset,
          product,
          factor,
          venue,
          notional,
          shock,
          marketLoss,
          liquidityCost: liquidity.cost,
          counterpartyLoss,
          totalLoss: marketLoss + liquidity.cost + counterpartyLoss,
          liquidity,
        };
      }),
      marketLoss = rows.reduce((sum, row) => sum + row.marketLoss, 0),
      liquidityCost = rows.reduce((sum, row) => sum + row.liquidityCost, 0),
      counterpartyLoss = rows.reduce(
        (sum, row) => sum + row.counterpartyLoss,
        0,
      ),
      totalLoss = marketLoss + liquidityCost + counterpartyLoss,
      missingFields = rows.reduce(
        (sum, row) => sum + row.liquidity.missing.length,
        0,
      ),
      expectedFields = rows.length * 2;
    return {
      scenario: {
        id: scenario.id,
        version: scenario.version,
        name: scenario.name,
        horizon: scenario.horizon,
        source: scenario.source,
      },
      rows,
      marketLoss,
      liquidityCost,
      counterpartyLoss,
      totalLoss,
      lossRatio: totalLoss / plan.equity,
      equityAfter: plan.equity - totalLoss,
      completeness: expectedFields
        ? Math.max(0, 1 - missingFields / expectedFields)
        : 1,
      warnings: rows
        .filter((row) => !row.liquidity.complete)
        .map((row) => ({
          product: row.product,
          missing: row.liquidity.missing,
          fallbackHaircutApplied: true,
        })),
    };
  }

  async run(plan, input = {}) {
    validatePlan(plan);
    const ids = input.scenarioIds?.length
        ? input.scenarioIds
        : listScenarios().map((scenario) => scenario.id),
      scenarios = ids.map((id) =>
        composeScenario(scenarioById(id), input.overrides?.[id] || {}),
      ),
      results = scenarios.map((scenario) =>
        this.evaluateScenario(plan, scenario, input),
      ),
      worst = results.reduce(
        (selected, result) =>
          !selected || result.totalLoss > selected.totalLoss
            ? result
            : selected,
        null,
      ),
      tailExpectedShortfall = Number(
        plan.diagnostics?.tailRisk?.conservative?.expectedShortfall || 0,
      ),
      capitalBuffer = {
        expectedShortfall: tailExpectedShortfall * plan.equity,
        liquidityCost: worst?.liquidityCost || 0,
        counterpartyHaircut: worst?.counterpartyLoss || 0,
        operationalReserve: plan.equity * this.policy.operationalReserveRatio,
      },
      dependency = input.returnsMatrix
        ? {
            correlation: stressCorrelation(input.returnsMatrix),
            lowerTail: lowerTailDependence(input.returnsMatrix, 0.1),
            factorLoadings: input.factorReturns
              ? Object.fromEntries(
                  plan.allocations.map((allocation, index) => [
                    allocation.product,
                    ridgeFactorLoadings(
                      input.returnsMatrix[index] || [],
                      input.factorReturns,
                      Number(input.ridgePenalty ?? 1e-4),
                    ),
                  ]),
                )
              : null,
          }
        : { correlation: { available: false, reason: "returns-not-provided" } },
      payload = {
        paperOnly: true,
        engineVersion: 1,
        portfolioPlanId: plan.id,
        equity: plan.equity,
        results,
        worstScenario: worst?.scenario || null,
        worstLoss: worst?.totalLoss || 0,
        worstLossRatio: worst?.lossRatio || 0,
        equityAfterWorst: worst?.equityAfter ?? plan.equity,
        completeness: results.length
          ? Math.min(...results.map((result) => result.completeness))
          : 1,
        dependency,
        capitalBuffer: {
          ...capitalBuffer,
          total: Object.values(capitalBuffer).reduce(
            (sum, value) => sum + value,
            0,
          ),
        },
      },
      run = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        ...payload,
        integrity: { algorithm: "sha256", hash: digest(payload) },
      };
    this.runs.push(run);
    if (this.runs.length > 100) this.runs.shift();
    await this.record("risk.stress", run);
    return run;
  }

  async reverse(plan, input = {}) {
    validatePlan(plan);
    const exposures = plan.allocations.map(
        (allocation) => allocation.targetWeight * plan.equity,
      ),
      payload = {
        paperOnly: true,
        engineVersion: 1,
        portfolioPlanId: plan.id,
        market: reverseMarketShock(exposures, {
          equity: plan.equity,
          targetLossRatio: Number(input.targetLossRatio ?? 0.1),
          fixedCosts: Number(input.fixedCosts || 0),
        }),
      },
      run = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        ...payload,
        integrity: { algorithm: "sha256", hash: digest(payload) },
      };
    this.reverseRuns.push(run);
    if (this.reverseRuns.length > 100) this.reverseRuns.shift();
    await this.record("risk.reverse-stress", run);
    return run;
  }
}

module.exports = { StressEngine, digest, validatePlan };
