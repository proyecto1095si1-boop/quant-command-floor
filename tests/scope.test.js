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
const OUT_OF_SCOPE_PROVIDERS = new Map([
  ["fmp", "acciones"],
  ["polygon", "acciones/forex"],
  ["yahoo", "acciones/ETFs/forex"],
]);
const OUT_OF_SCOPE_CATEGORIES = new Set(["general", "forex", "merger"]);

function configuredProducts() {
  const source = fs.readFileSync(path.join(ROOT, ".env.example"), "utf8");
  const match = source.match(/^MARKET_PRODUCTS=(.*)$/m);
  return (match?.[1] || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function configuredNewsCategories() {
  const source = fs.readFileSync(
    path.join(ROOT, "server/intelligence/connectors.js"),
    "utf8",
  );
  const match = source.match(
    /const allowed = new Set\(\[([^\]]*)\]\);\s*if \(!allowed\.has\(category\)\)/,
  );
  return [...(match?.[1] || "").matchAll(/["']([^"']+)["']/g)].map(
    ([, category]) => category,
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
    const market = OUT_OF_SCOPE_PROVIDERS.get(provider);
    if (market)
      violations.push(`proveedor fuera de alcance: ${provider} (${market})`);
  }
  for (const category of configuredNewsCategories())
    if (OUT_OF_SCOPE_CATEGORIES.has(category))
      violations.push(`categoría de noticias fuera de alcance: ${category}`);

  return violations.sort();
}

const violations = scopeViolations();
assert.deepEqual(
  violations,
  [],
  `Incumplimientos de alcance (${violations.length}):\n- ${violations.join("\n- ")}`,
);

console.log("scope tests: ok");
