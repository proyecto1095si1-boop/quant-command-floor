"use strict";

const {
  FACTOR,
  divideRounded,
  fromAtoms,
  multiplyAtoms,
  toAtoms,
} = require("../math/fixed-decimal.js");

function levelValue(level, name, index) {
  if (Array.isArray(level)) return Number(level[index]);
  return Number(level?.[name]);
}

function walkBook(levels, qty, limit = null, used = new Map()) {
  const requestedQty = Math.max(0, Number(qty) || 0),
    requestedAtoms = toAtoms(requestedQty),
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
  let filledAtoms = 0n,
    notionalAtoms = 0n;
  const fills = [];
  for (const level of rows) {
    if (filledAtoms >= requestedAtoms) break;
    const isAsk = level.side
        ? level.side === "ask" || level.side === "sell"
        : ascending,
      crosses =
        !hasLimit ||
        (isAsk ? level.price <= limitPrice : level.price >= limitPrice);
    if (!crosses) continue;
    const key = `${isAsk ? "ask" : "bid"}:${level.price}:${level.index}`,
      sizeAtoms = toAtoms(level.size),
      usedAtoms = toAtoms(used.get(key) || 0),
      availableAtoms = sizeAtoms > usedAtoms ? sizeAtoms - usedAtoms : 0n,
      remainingAtoms = requestedAtoms - filledAtoms,
      takeAtoms =
        availableAtoms < remainingAtoms ? availableAtoms : remainingAtoms,
      take = fromAtoms(takeAtoms);
    if (takeAtoms <= 0n) continue;
    used.set(key, fromAtoms(usedAtoms + takeAtoms));
    filledAtoms += takeAtoms;
    notionalAtoms += multiplyAtoms(takeAtoms, toAtoms(level.price));
    fills.push({ price: level.price, qty: take, key });
  }
  const filledQty = fromAtoms(filledAtoms),
    remainingAtoms = requestedAtoms - filledAtoms,
    notional = fromAtoms(notionalAtoms);
  return {
    requestedQty: fromAtoms(requestedAtoms),
    filledQty,
    remainingQty: fromAtoms(remainingAtoms > 0n ? remainingAtoms : 0n),
    notional,
    averagePrice: filledAtoms
      ? fromAtoms(divideRounded(notionalAtoms * FACTOR, filledAtoms))
      : 0,
    complete: filledAtoms >= requestedAtoms,
    fills,
    used,
  };
}

module.exports = { walkBook };
