"use strict";

const crypto = require("node:crypto");

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}

function digest(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

function sealCheckpoint(kind, payload) {
  const body = { version: 1, kind, payload: structuredClone(payload) };
  return { ...body, hash: digest(body) };
}

function openCheckpoint(value, kind) {
  if (!value || value.version !== 1 || value.kind !== kind)
    throw new Error(`invalid-${kind}-checkpoint`);
  const { hash, ...body } = value;
  if (hash !== digest(body)) throw new Error(`${kind}-checkpoint-integrity`);
  return structuredClone(value.payload);
}

module.exports = { digest, openCheckpoint, sealCheckpoint };
