"use strict";

function levelValue(level, name, index) {
  if (Array.isArray(level)) return Number(level[index]);
  return Number(level?.[name]);
}

function walkBook(levels, qty, limit = null, used = new Map()) {
  const requestedQty = Math.max(0, Number(qty) || 0),
    rows = (levels || [])
      .map((level, index) => ({
        price: levelValue(level, "price", 0),
        size: levelValue(level, "size", 1),
        side: Array.isArray(level) ? null : level.side,
        index,
      }))
      .filter((level) => level.price > 0 && level.size > 0),
    ascending = rows.length < 2 || rows[0].price <= rows.at(-1).price,
    limitPrice = Number(limit),
    hasLimit = Number.isFinite(limitPrice) && limitPrice > 0;
  let filledQty = 0,
    notional = 0;
  const fills = [];
  for (const level of rows) {
    if (filledQty >= requestedQty) break;
    const isAsk = level.side
        ? level.side === "ask" || level.side === "sell"
        : ascending,
      crosses =
        !hasLimit ||
        (isAsk ? level.price <= limitPrice : level.price >= limitPrice);
    if (!crosses) continue;
    const key = `${isAsk ? "ask" : "bid"}:${level.price}:${level.index}`,
      available = Math.max(0, level.size - Number(used.get(key) || 0)),
      take = Math.min(available, requestedQty - filledQty);
    if (!(take > 0)) continue;
    used.set(key, Number(used.get(key) || 0) + take);
    filledQty += take;
    notional += take * level.price;
    fills.push({ price: level.price, qty: take, key });
  }
  return {
    requestedQty,
    filledQty,
    remainingQty: Math.max(0, requestedQty - filledQty),
    notional,
    averagePrice: filledQty ? notional / filledQty : 0,
    complete: filledQty >= requestedQty,
    fills,
    used,
  };
}

module.exports = { walkBook };
