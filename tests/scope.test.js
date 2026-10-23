"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ASSETS } = require("../server/desks/registry.js");
const { IntelligenceService } = require("../server/intelligence/connectors.js");

const ROOT = path.resolve(__dirname, "..");
const ALLOWED_ASSETS = new Set(["BTC", "ETH", "SOL", "BNB"]);
const ALLOWED_PRODUCTS = new Set(
  [...ALLOWED_ASSETS].map((asset) => `${asset}-USD`),
);
const ALLOWED_PROVIDERS = new Set(["finnhub", "fred"]);

function configuredProducts() {
  const source = fs.readFileSync(path.join(ROOT, ".env.example"), "utf8");
  const match = source.match(/^MARKET_PRODUCTS=(.*)$/m);
  return (match?.[1] || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function cryptoNewsOnly() {
  const source = fs.readFileSync(
    path.join(ROOT, "server/intelligence/connectors.js"),
    "utf8",
  );
  return (
    /news\(\{ category = "crypto", minId = 0 \} = \{\}\)/.test(source) &&
    /if \(category !== "crypto"\)/.test(source)
  );
}

function scopeViolations() {
  const violations = [];
  for (const [asset, spec] of Object.entries(ASSETS)) {
    if (!ALLOWED_ASSETS.has(asset))
      violations.push(`universo: activo fuera de alcance: ${asset}`);
    if (!ALLOWED_PRODUCTS.has(spec.product))
      violations.push(`universo: símbolo fuera de alcance: ${spec.product}`);
  }
  for (const product of configuredProducts())
    if (!ALLOWED_PRODUCTS.has(product))
      violations.push(`configuración: símbolo fuera de alcance: ${product}`);

  const service = new IntelligenceService();
  for (const provider of Object.keys(service.connectors)) {
    if (!ALLOWED_PROVIDERS.has(provider))
      violations.push(`proveedor fuera de alcance: ${provider}`);
  }
  if (!cryptoNewsOnly())
    violations.push("categoría de noticias: solo crypto debe estar habilitada");

  return violations.sort();
}

const violations = scopeViolations();
assert.deepEqual(
  violations,
  [],
  `Incumplimientos de alcance (${violations.length}):\n- ${violations.join("\n- ")}`,
);

console.log("scope tests: ok");
