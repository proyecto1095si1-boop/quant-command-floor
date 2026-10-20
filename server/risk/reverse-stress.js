"use strict";

function portfolioLoss(exposures, shock, fixedCosts = 0) {
  return (
    exposures.reduce(
      (sum, exposure) => sum + Math.abs(Number(exposure) || 0) * -shock,
      0,
    ) + fixedCosts
  );
}

function reverseMarketShock(
  exposures,
  {
    equity,
    targetLossRatio = 0.1,
    fixedCosts = 0,
    lower = 0,
    upper = -0.95,
    tolerance = 1e-10,
    maxIterations = 100,
  } = {},
) {
  if (!(Number(equity) > 0))
    throw Object.assign(new Error("invalid-reverse-stress-equity"), {
      status: 422,
    });
  if (!(targetLossRatio > 0 && targetLossRatio < 1))
    throw Object.assign(new Error("invalid-reverse-stress-target"), {
      status: 422,
    });
  const targetLoss = equity * targetLossRatio,
    initialLoss = portfolioLoss(exposures, lower, fixedCosts),
    maximumLoss = portfolioLoss(exposures, upper, fixedCosts);
  if (initialLoss >= targetLoss)
    return {
      reachable: true,
      targetLoss,
      targetLossRatio,
      criticalShock: lower,
      lossAtCriticalShock: initialLoss,
      fixedCosts,
      iterations: 0,
      tolerance,
    };
  if (maximumLoss < targetLoss)
    return {
      reachable: false,
      targetLoss,
      maximumShock: upper,
      maximumLoss,
    };

  let safe = lower,
    breached = upper,
    iterations = 0;
  while (iterations < maxIterations && Math.abs(breached - safe) > tolerance) {
    const candidate = (safe + breached) / 2,
      loss = portfolioLoss(exposures, candidate, fixedCosts);
    if (loss >= targetLoss) breached = candidate;
    else safe = candidate;
    iterations++;
  }
  return {
    reachable: true,
    targetLoss,
    targetLossRatio,
    criticalShock: breached,
    lossAtCriticalShock: portfolioLoss(exposures, breached, fixedCosts),
    fixedCosts,
    iterations,
    tolerance,
  };
}

module.exports = { portfolioLoss, reverseMarketShock };
