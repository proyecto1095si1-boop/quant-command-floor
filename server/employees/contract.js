"use strict";

const CARD_LIMITS = Object.freeze({
  history: 20,
  inputs: 16,
  parameters: 48,
  text: 1000,
  rawBytes: 6000,
  cardBytes: 24000,
  marketAgeMs: 30000,
});
const STATES = Object.freeze(["live", "stale", "missing", "error"]);
function validateEmployeeCard(card) {
  const errors = [],
    text = (value) =>
      typeof value === "string" &&
      value.length > 0 &&
      value.length <= CARD_LIMITS.text,
    timestamp = (value) =>
      typeof value === "string" && Number.isFinite(Date.parse(value)),
    object = (value) =>
      value && typeof value === "object" && !Array.isArray(value),
    fail = (ok, field) => {
      if (!ok) errors.push(field);
    };
  fail(object(card), "card");
  if (!object(card)) return { valid: false, errors };
  fail(card.version === 1 && card.paperOnly === true, "version/paperOnly");
  const i = card.identity;
  fail(
    object(i) &&
      [i.id, i.name, i.role, i.area?.id, i.area?.name].every(text) &&
      ["deterministic", "ai", "hybrid"].includes(i.type),
    "identity",
  );
  const w = card.work;
  fail(
    object(w) &&
      text(w.function) &&
      text(w.method) &&
      text(w.parameterStatus) &&
      Array.isArray(w.parameters) &&
      w.parameters.length <= CARD_LIMITS.parameters &&
      w.parameters.every(
        (p) =>
          object(p) &&
          text(p.name) &&
          text(p.source) &&
          text(p.unit) &&
          (typeof p.value === "boolean" ||
            (typeof p.value === "string" && p.value.length <= 300) ||
            (typeof p.value === "number" && Number.isFinite(p.value))),
      ),
    "work",
  );
  fail(
    Array.isArray(card.inputs) &&
      card.inputs.length > 0 &&
      card.inputs.length <= CARD_LIMITS.inputs &&
      card.inputs.every(
        (p) =>
          object(p) &&
          text(p.name) &&
          text(p.source) &&
          STATES.includes(p.state) &&
          (p.ageMs === null || (Number.isFinite(p.ageMs) && p.ageMs >= 0)) &&
          Number.isFinite(p.maxAgeMs) &&
          p.maxAgeMs > 0 &&
          p.lastValue !== undefined &&
          (p.state !== "live" ||
            (p.lastValue !== null &&
              p.ageMs !== null &&
              p.ageMs <= p.maxAgeMs)) &&
          (p.state !== "stale" || (p.ageMs !== null && p.ageMs > p.maxAgeMs)),
      ),
    "inputs",
  );
  const l = card.latest;
  fail(
    object(l) &&
      (l.at === null || timestamp(l.at)) &&
      (l.asset === null || ["BTC", "ETH", "SOL", "BNB"].includes(l.asset)) &&
      text(l.summary) &&
      object(l.raw),
    "latest",
  );
  const m = card.meaning;
  fail(
    object(m) && text(m.scale) && text(m.consequence) && text(m.userAction),
    "meaning",
  );
  const r = card.reliability;
  fail(
    object(r) &&
      object(r.performance) &&
      r.performance.status === "not_measured" &&
      r.performance.sampleSize === 0 &&
      r.performance.value === null &&
      text(r.performance.reason) &&
      Array.isArray(r.limits) &&
      r.limits.length > 0 &&
      r.limits.every(text) &&
      Array.isArray(r.whenNotToTrust) &&
      r.whenNotToTrust.length > 0 &&
      r.whenNotToTrust.every(text),
    "reliability",
  );
  const h = card.history;
  fail(
    object(h) &&
      h.capacity === CARD_LIMITS.history &&
      Array.isArray(h.items) &&
      h.items.length <= h.capacity &&
      h.items.every((p) => object(p) && timestamp(p.at) && text(p.title)) &&
      object(h.trend) &&
      text(h.trend.status),
    "history",
  );
  const rel = card.relations;
  fail(
    object(rel) &&
      Array.isArray(rel.receivesFrom) &&
      Array.isArray(rel.deliversTo) &&
      rel.receivesFrom.length <= 33 &&
      rel.deliversTo.length <= 33 &&
      [...rel.receivesFrom, ...rel.deliversTo].every(text) &&
      text(rel.status),
    "relations",
  );
  fail(
    object(card.empty) &&
      typeof card.empty.active === "boolean" &&
      text(card.empty.reason) &&
      text(card.empty.solution),
    "empty",
  );
  try {
    fail(
      Buffer.byteLength(JSON.stringify(l?.raw)) <= CARD_LIMITS.rawBytes,
      "raw-size",
    );
    fail(
      Buffer.byteLength(JSON.stringify(card)) <= CARD_LIMITS.cardBytes,
      "card-size",
    );
  } catch {
    errors.push("serialization");
  }
  return { valid: errors.length === 0, errors };
}
function assertEmployeeCard(card) {
  const check = validateEmployeeCard(card);
  if (!check.valid)
    throw new Error(`invalid-employee-card:${check.errors.join(",")}`);
  return card;
}
module.exports = {
  CARD_LIMITS,
  STATES,
  validateEmployeeCard,
  assertEmployeeCard,
};
