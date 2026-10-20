"use strict";

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function liquidationCost(position, market = {}, stress = {}, policy = {}) {
  const notional = Math.abs(Number(position.notional) || 0),
    missing = [],
    volatility = positive(
      market.volatility,
      positive(policy.missingVolatility, 0.08),
    ),
    dailyVolume = positive(market.dailyVolume, null),
    spreadBps = positive(market.spreadBps, null),
    depthMultiplier = positive(stress.depthMultiplier, 1),
    spreadMultiplier = positive(stress.spreadMultiplier, 1),
    participationRate = positive(policy.participationRate, 0.1),
    impactCoefficient = positive(policy.impactCoefficient, 0.5),
    missingLiquidityHaircut = positive(policy.missingLiquidityHaircut, 0.05);
  if (dailyVolume === null) missing.push("dailyVolume");
  if (spreadBps === null) missing.push("spreadBps");

  const effectiveVolume =
      dailyVolume === null ? null : dailyVolume * depthMultiplier,
    participation = effectiveVolume ? notional / effectiveVolume : null,
    impactRate = effectiveVolume
      ? volatility * impactCoefficient * Math.sqrt(participation)
      : missingLiquidityHaircut,
    spreadRate =
      spreadBps === null
        ? missingLiquidityHaircut / 2
        : (spreadBps * spreadMultiplier) / 20000,
    costRate = impactRate + spreadRate,
    daysToLiquidate = effectiveVolume
      ? notional / (effectiveVolume * participationRate)
      : null;
  return {
    notional,
    cost: notional * costRate,
    costRate,
    impactRate,
    spreadRate,
    participation,
    daysToLiquidate,
    liquidatable: !stress.venueUnavailable,
    liquidatableFractions: Object.fromEntries(
      [1, 3, 5].map((days) => [
        `${days}d`,
        stress.venueUnavailable
          ? 0
          : effectiveVolume
            ? Math.min(
                1,
                (effectiveVolume * participationRate * days) / (notional || 1),
              )
            : 0,
      ]),
    ),
    complete: missing.length === 0,
    missing,
    assumptions: {
      volatility,
      dailyVolume,
      spreadBps,
      depthMultiplier,
      spreadMultiplier,
      participationRate,
      impactCoefficient,
      missingLiquidityHaircut,
    },
  };
}

module.exports = { liquidationCost };
