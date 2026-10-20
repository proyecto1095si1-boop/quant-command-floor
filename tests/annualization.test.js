"use strict";

const assert = require("node:assert/strict"),
  { PERIODS_PER_YEAR } = require("../server/config/annualization.js"),
  risk = require("../server/risk/math.js"),
  research = require("../server/research/statistics.js"),
  portfolio = require("../server/portfolio/math.js");

const returns = [0.01, -0.004, 0.007, -0.002, 0.013, 0.003],
  daily = PERIODS_PER_YEAR.daily,
  hourly = PERIODS_PER_YEAR.hourly,
  expectedScale = Math.sqrt(hourly / daily),
  close = (actual, expected, message) =>
    assert.ok(
      Math.abs(actual - expected) < 1e-12,
      `${message}: ${actual} !== ${expected}`,
    );

assert.deepEqual(PERIODS_PER_YEAR, { daily: 365, hourly: 365 * 24 });
assert.equal(
  risk.ewmaVolatility(returns),
  risk.ewmaVolatility(returns, 0.94, daily),
);
assert.equal(research.sharpe(returns), research.sharpe(returns, daily));

const riskScale =
    risk.ewmaVolatility(returns, 0.94, hourly) /
    risk.ewmaVolatility(returns, 0.94, daily),
  researchScale =
    research.sharpe(returns, hourly) / research.sharpe(returns, daily),
  portfolioDaily = portfolio.diagnostics([1], [returns], daily),
  portfolioHourly = portfolio.diagnostics([1], [returns], hourly),
  portfolioScale =
    portfolioHourly.annualVolatility / portfolioDaily.annualVolatility;

close(riskScale, expectedScale, "risk volatility scaling");
close(researchScale, expectedScale, "research Sharpe scaling");
close(portfolioScale, expectedScale, "portfolio volatility scaling");
close(riskScale, researchScale, "risk/research scaling consistency");
close(researchScale, portfolioScale, "research/portfolio scaling consistency");

console.log("annualization tests: ok");
