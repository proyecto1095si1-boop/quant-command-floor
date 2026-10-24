"use strict";

const DESK_PARAMETERS = Object.freeze({
  Technical: Object.freeze({
    fastPeriod: 12,
    slowPeriod: 26,
    fastWindow: 60,
    slowWindow: 100,
    rsiPeriod: 14,
    atrPeriod: 14,
  }),
  Volume: Object.freeze({ zWindow: 20, flowWindow: 21 }),
  Whale: Object.freeze({ notionalQuantile: 0.95 }),
  Liquidity: Object.freeze({ spreadPenaltyBps: 20, depthScale: 10 }),
  "Market Structure": Object.freeze({ window: 60 }),
  "Order Block": Object.freeze({
    window: 80,
    atrPeriod: 14,
    displacementAtr: 1.5,
    distanceScaleAtr: 5,
  }),
});

module.exports = { DESK_PARAMETERS };
