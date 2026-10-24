"use strict";

function createIntelligenceRefresh({
  dag,
  service,
  assets = ["BTC", "ETH", "SOL", "BNB"],
  intervalMs = 300000,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 60000)
    throw new Error("invalid-intelligence-refresh-interval");
  let running = false,
    timer = null,
    pending = null;
  const refresh = () => {
    if (pending) return pending;
    pending = (async () => {
      const providers = service.status().providers;
      if (!Object.values(providers).some((provider) => provider.configured))
        return { status: "not-configured", refreshed: 0 };
      const results = await Promise.allSettled(
        assets.map((asset) => dag.refresh(asset)),
      );
      return {
        status: "completed",
        refreshed: results.filter((result) => result.status === "fulfilled")
          .length,
      };
    })().finally(() => {
      pending = null;
    });
    return pending;
  };
  const tick = async () => {
    try {
      await refresh();
    } finally {
      if (running) {
        timer = setTimer(() => {
          tick().catch(() => {});
        }, intervalMs);
        timer?.unref?.();
      }
    }
  };
  return {
    refresh,
    start() {
      if (running) return;
      running = true;
      tick().catch(() => {});
    },
    async stop() {
      running = false;
      clearTimer(timer);
      await pending;
    },
  };
}

module.exports = { createIntelligenceRefresh };
