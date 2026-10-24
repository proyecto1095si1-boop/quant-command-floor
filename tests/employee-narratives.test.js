"use strict";

const assert = require("node:assert/strict"),
  { EMPLOYEE_REGISTRY } = require("../server/employees/registry.js"),
  { EmployeeCards } = require("../server/employees/service.js"),
  { DeskRegistry } = require("../server/desks/registry.js"),
  profiles = require("../dist/agent-profiles.js"),
  fixtures = require("./fixtures/employee-events.json"),
  { captureEmployeeEvents } = require("./helpers/capture-employee-events.js"),
  get = (row, path) =>
    path.split(".").reduce((value, key) => value?.[key], row),
  number = (value) =>
    value.toLocaleString("es-AR", { maximumFractionDigits: 8 });

(async () => {
  const ids = EMPLOYEE_REGISTRY.map((row) => row.id).sort();
  assert.deepEqual([...profiles.narrativeIds].sort(), ids);
  assert.deepEqual(fixtures.map((row) => row.id).sort(), ids);
  const meanings = new Set(),
    regenerated = await captureEmployeeEvents(),
    desks = new DeskRegistry(),
    cards = new EmployeeCards({ sources: () => ({ desks }) });
  for (const fixture of fixtures) {
    const narrative = profiles.narrate(fixture.id, fixture),
      captured = regenerated.find((row) => row.id === fixture.id);
    assert.ok(fixture.source.length > 10, `${fixture.id}: capture provenance`);
    assert.equal(captured.observed, fixture.observed);
    assert.ok(
      !meanings.has(narrative.meaning),
      `${fixture.id}: distinct meaning`,
    );
    meanings.add(narrative.meaning);
    assert.doesNotMatch(
      narrative.activity,
      /actualización relacionada con su responsabilidad|campos registrados/,
    );
    assert.ok(narrative.activity.length <= 1000);
    assert.ok(narrative.meaning.length <= 1000);
    assert.ok(
      narrative.activity.includes(fixture.asset || "activo no informado"),
      fixture.id,
    );
    if (fixture.observed) {
      assert.ok(
        fixture.expectedPaths.length > 0,
        `${fixture.id}: expected real values`,
      );
      for (const path of fixture.expectedPaths) {
        const value = get(fixture.raw, path),
          actual = get(captured.raw, path);
        assert.ok(
          Number.isFinite(value),
          `${fixture.id}.${path}: captured numeric value`,
        );
        assert.ok(
          Math.abs(value - actual) < 1e-12,
          `${fixture.id}.${path}: matches engine recapture`,
        );
        assert.ok(
          narrative.activity.includes(number(value)) ||
            narrative.activity.includes(number(value * 100)),
          `${fixture.id}.${path}: value ${value} in narrative: ${narrative.activity}`,
        );
      }
      cards.observe(fixture.id, {
        raw: fixture.raw,
        asset: fixture.asset,
        source: fixture.source,
        at: Date.now(),
      });
      const card = cards.card(fixture.id, {
        asset: fixture.asset,
        refresh: false,
      });
      assert.ok(
        card.latest.summary.includes(fixture.asset || "activo no informado"),
      );
      for (const path of fixture.expectedPaths) {
        const value = get(fixture.raw, path);
        assert.ok(
          card.latest.summary.includes(number(value)) ||
            card.latest.summary.includes(number(value * 100)),
          `${fixture.id}.${path}: backend card includes the real value`,
        );
      }
      assert.doesNotMatch(card.meaning.scale, /completará|pendiente.*E2/);
      assert.equal(card.reliability.performance.value, null);
    } else {
      assert.equal(fixture.id, "research.miner");
      assert.match(narrative.activity, /no tiene motor implementado/);
      assert.equal(Object.keys(fixture.raw).length, 0);
    }
  }
  const technical = fixtures.find((row) => row.id === "consensus.technical"),
    positive = profiles.narrate(technical.id, {
      ...technical,
      raw: { ...technical.raw, signal: 0.32, confidence: 0.61 },
    }),
    negative = profiles.narrate(technical.id, {
      ...technical,
      raw: { ...technical.raw, signal: -0.05, confidence: 0.2 },
    });
  assert.match(positive.activity, /\+0,32.*compradora.*0,61/);
  assert.match(negative.activity, /-0,05.*vendedora.*0,2/);
  assert.notEqual(positive.activity, negative.activity);
  assert.notEqual(positive.meaning, negative.meaning);
  assert.match(positive.meaning, /\+0,32.*compradora/);
  assert.match(negative.meaning, /-0,05.*vendedora/);
  assert.match(positive.activity, /EMA12.*EMA26.*RSI.*ATR/);
  const changed = profiles.narrate(technical.id, {
    ...technical,
    parameters: technical.parameters.map((row) => ({
      ...row,
      value:
        row.name === "fastPeriod"
          ? 17
          : row.name === "consensusWeight"
            ? 0.77
            : row.value,
    })),
  });
  assert.match(changed.activity, /EMA17/);
  assert.match(changed.consequence, /0,77/);
  const empty = profiles.narrate("consensus.technical", {
    asset: "BNB",
    observed: false,
  });
  assert.doesNotMatch(empty.activity, /Calculó|\+0/);
  assert.match(empty.activity, /BNB.*Todavía no recibió/);
  const priceOnly = profiles.describe("desk.btc", {
    input: { asset: "BTC" },
    output: { price: 60000 },
  });
  assert.match(priceOnly.activity, /60\.000 USD.*todavía no hay análisis/);
  assert.doesNotMatch(priceOnly.activity, /señal/);
  const noZone = profiles.narrate("consensus.orderblock", {
    raw: { signal: 0, confidence: 0.25, metrics: { atr: 3 } },
    asset: "SOL",
  });
  assert.match(noZone.activity, /No hay zona válida.*3 USD/);
  const reconciled = profiles.narrate("execution.broker", {
    raw: {
      processed: 3,
      filled: 1,
      partial: 1,
      rejected: 1,
      portfolio: { equity: 1000 },
    },
  });
  assert.match(
    reconciled.activity,
    /3 órdenes paper.*1 completas.*1 parciales.*1 rechazadas/,
  );
  assert.match(reconciled.activity, /No incluye precios individuales/);
  const microFill = profiles.narrate("execution.broker", {
    asset: "BTC",
    raw: {
      fill: { qty: 0.00000001, price: 200.02, fee: 0.20002 },
      remainingQty: 0,
    },
  });
  assert.match(microFill.activity, /0,00000001 unidades/);
  assert.match(microFill.activity, /0,20002 USD/);
  const operational = profiles.narrate("sre.anomaly", {
    raw: { message: "feed offline" },
  });
  assert.match(operational.activity, /error operativo.*0 mediciones/);
  const staleError = profiles.narrate("intake.news", {
    error: "provider unavailable",
    asset: "BTC",
  });
  assert.match(staleError.activity, /error.*No hay resultado nuevo/);
  assert.doesNotMatch(staleError.activity, /Revisó/);
  assert.ok(
    profiles.narrate("unregistered", {}).meaning.includes("no utilizar"),
  );
  console.log(
    "employee narratives: 33 unique meanings, real engine recaptures, numbers/units, explicit absent miner and bounded text OK",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
