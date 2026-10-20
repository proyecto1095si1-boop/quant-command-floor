"use strict";

const crypto = require("node:crypto"),
  { fingerprint } = require("./service.js");

const HASH = /^[a-f0-9]{64}$/i,
  ID = /^[a-z0-9][a-z0-9._:@/-]{0,127}$/i,
  MANIFEST_FIELDS = new Set([
    "schemaVersion",
    "owner",
    "license",
    "languages",
    "jurisdictions",
    "createdAt",
    "collectionMethod",
    "samplingMethod",
    "sourceHashes",
    "groundTruthHash",
    "parentDatasetHashes",
  ]),
  ATTESTATION_FIELDS = new Set(["reviewerId", "algorithm", "signature"]);

function invalid(message) {
  return Object.assign(new Error(message), { status: 422 });
}

function exactFields(value, allowed, message) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw invalid(message);
  if (Object.keys(value).some((field) => !allowed.has(field)))
    throw invalid(message);
}

function identifiers(values, allowEmpty = false) {
  if (!Array.isArray(values) || (!allowEmpty && values.length === 0))
    return null;
  const normalized = [
    ...new Set(values.map((value) => String(value).trim())),
  ].sort();
  return normalized.every((value) => ID.test(value)) ? normalized : null;
}

function hashes(values, allowEmpty = false) {
  if (!Array.isArray(values) || (!allowEmpty && values.length === 0))
    return null;
  const normalized = [
    ...new Set(values.map((value) => String(value).toLowerCase())),
  ].sort();
  return normalized.every((value) => HASH.test(value)) ? normalized : null;
}

function validateManifest(input) {
  exactFields(input, MANIFEST_FIELDS, "invalid-provenance-manifest");
  const manifest = {
    schemaVersion: Number(input.schemaVersion),
    owner: String(input.owner || "").trim(),
    license: String(input.license || "").trim(),
    languages: identifiers(input.languages),
    jurisdictions: identifiers(input.jurisdictions),
    createdAt: String(input.createdAt || ""),
    collectionMethod: String(input.collectionMethod || "").trim(),
    samplingMethod: String(input.samplingMethod || "").trim(),
    sourceHashes: hashes(input.sourceHashes),
    groundTruthHash: String(input.groundTruthHash || "").toLowerCase(),
    parentDatasetHashes: hashes(input.parentDatasetHashes || [], true),
  };
  if (
    manifest.schemaVersion !== 1 ||
    !ID.test(manifest.owner) ||
    !ID.test(manifest.license) ||
    !manifest.languages ||
    !manifest.jurisdictions ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(
      manifest.createdAt,
    ) ||
    !Number.isFinite(Date.parse(manifest.createdAt)) ||
    !ID.test(manifest.collectionMethod) ||
    !ID.test(manifest.samplingMethod) ||
    !manifest.sourceHashes ||
    !HASH.test(manifest.groundTruthHash) ||
    !manifest.parentDatasetHashes
  )
    throw invalid("invalid-provenance-manifest");
  return manifest;
}

function validateAttestation(input) {
  exactFields(input, ATTESTATION_FIELDS, "invalid-provenance-attestation");
  const attestation = {
    reviewerId: String(input.reviewerId || "").trim(),
    algorithm: String(input.algorithm || ""),
    signature: String(input.signature || ""),
  };
  if (
    !ID.test(attestation.reviewerId) ||
    attestation.algorithm !== "Ed25519" ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(attestation.signature)
  )
    throw invalid("invalid-provenance-attestation");
  return attestation;
}

function verifyProvenance(
  manifestInput,
  attestationInput,
  trustedReviewers,
  { datasetId, version, casesHash },
) {
  const manifest = validateManifest(manifestInput),
    attestation = validateAttestation(attestationInput),
    manifestHash = fingerprint(manifest),
    attestationHash = fingerprint({
      datasetId,
      version,
      casesHash,
      manifestHash,
    }),
    publicKey = trustedReviewers.get(attestation.reviewerId);
  if (!publicKey)
    throw Object.assign(new Error("untrusted-provenance-reviewer"), {
      status: 403,
    });
  let verified = false;
  try {
    verified = crypto.verify(
      null,
      Buffer.from(attestationHash, "hex"),
      publicKey,
      Buffer.from(attestation.signature, "base64"),
    );
  } catch {
    verified = false;
  }
  if (!verified) throw invalid("invalid-provenance-signature");
  return { manifest, manifestHash, attestationHash, attestation };
}

function parseTrustedReviewers(value) {
  if (!value) return new Map();
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw invalid("invalid-trusted-reviewers-config");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw invalid("invalid-trusted-reviewers-config");
  const reviewers = new Map();
  try {
    for (const [reviewerId, value] of Object.entries(parsed)) {
      if (!ID.test(reviewerId) || typeof value !== "string")
        throw new Error("invalid-reviewer");
      const key = crypto.createPublicKey(value);
      if (key.asymmetricKeyType !== "ed25519")
        throw new Error("invalid-key-type");
      reviewers.set(reviewerId, key);
    }
  } catch {
    throw invalid("invalid-trusted-reviewers-config");
  }
  return reviewers;
}

module.exports = {
  parseTrustedReviewers,
  validateManifest,
  verifyProvenance,
};
