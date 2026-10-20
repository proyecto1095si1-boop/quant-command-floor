"use strict";
function schedule(
  parent,
  {
    algorithm = "TWAP",
    slices = 6,
    volumeProfile = [],
    participationRate = 0.1,
    intervalMs = 60000,
  } = {},
) {
  slices = Math.max(1, Math.min(100, Math.floor(slices)));
  const profile =
      algorithm === "VWAP" && volumeProfile.length
        ? sliceProfile(volumeProfile, slices)
        : Array(slices).fill(1 / slices),
    children = [];
  let allocated = 0;
  for (let i = 0; i < slices; i++) {
    let notional =
        i === slices - 1
          ? parent.notional - allocated
          : parent.notional * profile[i],
      capacity =
        Number(parent.marketVolumes?.[i] || Infinity) *
        Number(parent.price || 1) *
        participationRate;
    if (Number.isFinite(capacity)) notional = Math.min(notional, capacity);
    allocated += notional;
    children.push({
      id: `${parent.id}:${i + 1}`,
      parentId: parent.id,
      symbol: parent.symbol,
      side: parent.side,
      notional,
      qty: notional / parent.price,
      scheduledAt: new Date(Date.now() + i * intervalMs).toISOString(),
      state: notional > 0 ? "queued" : "skipped",
      algorithm,
      participationRate,
    });
  }
  return {
    children,
    scheduledNotional: allocated,
    residualNotional: Math.max(0, parent.notional - allocated),
    profile,
  };
}
function sliceProfile(xs, n) {
  const buckets = Array(n).fill(0);
  xs.forEach(
    (x, i) =>
      (buckets[Math.min(n - 1, Math.floor((i * n) / xs.length))] += Math.max(
        0,
        Number(x) || 0,
      )),
  );
  const total = buckets.reduce((a, b) => a + b, 0);
  return total ? buckets.map((x) => x / total) : Array(n).fill(1 / n);
}
module.exports = { schedule, sliceProfile };
