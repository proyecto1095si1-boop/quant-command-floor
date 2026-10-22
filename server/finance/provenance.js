"use strict";

const crypto = require("node:crypto"),
  { digest } = require("../config/checkpoint.js"),
  {
    decimalString,
    divideRounded,
    toAtoms,
  } = require("../math/fixed-decimal.js");

const ID = /^[a-z0-9][a-z0-9._:@/-]{0,127}$/i;

function financialError(message, status = 422) {
  return Object.assign(new Error(message), { status });
}

function verifyInvoiceAttestation(invoice, input, trustedIssuers) {
  const attestation = {
      issuerId: String(input?.issuerId || "").trim(),
      algorithm: String(input?.algorithm || ""),
      signature: String(input?.signature || ""),
    },
    invoiceHash = digest(invoice);
  if (
    !ID.test(attestation.issuerId) ||
    attestation.algorithm !== "Ed25519" ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(attestation.signature)
  )
    throw financialError("invalid-invoice-attestation");
  const publicKey = trustedIssuers.get(attestation.issuerId);
  if (!publicKey) throw financialError("untrusted-invoice-issuer", 403);
  let verified = false;
  try {
    verified = crypto.verify(
      null,
      Buffer.from(invoiceHash, "hex"),
      publicKey,
      Buffer.from(attestation.signature, "base64"),
    );
  } catch {
    verified = false;
  }
  if (!verified) throw financialError("invalid-invoice-signature");
  return { invoiceHash, attestation };
}

class FxOracle {
  constructor({ sources = [], clock = () => Date.now(), policy = {} } = {}) {
    this.sources = new Set(sources.map(String));
    this.clock = clock;
    this.policy = {
      minSources: 2,
      maxAgeMs: 86_400_000,
      maxFutureMs: 60_000,
      maxDivergenceBps: 50,
      invoiceToleranceBps: 1,
      ...policy,
    };
    if (
      !Number.isSafeInteger(this.policy.minSources) ||
      this.policy.minSources < 2 ||
      !Number.isSafeInteger(this.policy.maxAgeMs) ||
      this.policy.maxAgeMs < 1 ||
      !Number.isSafeInteger(this.policy.maxFutureMs) ||
      this.policy.maxFutureMs < 0 ||
      !Number.isSafeInteger(this.policy.maxDivergenceBps) ||
      this.policy.maxDivergenceBps < 0 ||
      !Number.isSafeInteger(this.policy.invoiceToleranceBps) ||
      this.policy.invoiceToleranceBps < 0
    )
      throw new Error("invalid-fx-oracle-policy");
  }

  resolve(currency, declaredRate, observations = []) {
    if (currency === "USD") {
      if (toAtoms(declaredRate) !== toAtoms(1))
        throw financialError("invalid-usd-fx-rate");
      const evidence = {
        currency: "USD",
        rateToUsd: decimalString(toAtoms(1)),
        sources: [],
        maximumDivergenceBps: 0,
        invoiceDeviationBps: 0,
      };
      return { ...evidence, evidenceHash: digest(evidence) };
    }
    const now = this.clock(),
      unique = new Map();
    for (const row of observations) {
      const source = String(row?.source || ""),
        observedAt = Number(row?.observedAt),
        rateAtoms = toAtoms(row?.rateToUsd);
      if (
        !this.sources.has(source) ||
        unique.has(source) ||
        !Number.isFinite(observedAt) ||
        observedAt > now + this.policy.maxFutureMs ||
        now - observedAt > this.policy.maxAgeMs ||
        rateAtoms <= 0n
      )
        throw financialError("invalid-fx-observation");
      unique.set(source, { source, observedAt, rateAtoms });
    }
    if (unique.size < this.policy.minSources)
      throw financialError("insufficient-fx-sources");
    const rows = [...unique.values()].sort((a, b) =>
        a.rateAtoms < b.rateAtoms ? -1 : a.rateAtoms > b.rateAtoms ? 1 : 0,
      ),
      middle = Math.floor(rows.length / 2),
      medianAtoms =
        rows.length % 2
          ? rows[middle].rateAtoms
          : divideRounded(
              rows[middle - 1].rateAtoms + rows[middle].rateAtoms,
              2n,
            ),
      maximumDivergenceBps = Number(
        divideRounded(
          (rows.at(-1).rateAtoms - rows[0].rateAtoms) * 10_000n,
          medianAtoms,
        ),
      ),
      invoiceDeviationBps = Number(
        divideRounded(
          (toAtoms(declaredRate) - medianAtoms) * 10_000n,
          medianAtoms,
        ),
      );
    if (maximumDivergenceBps > this.policy.maxDivergenceBps)
      throw financialError("fx-source-divergence");
    if (Math.abs(invoiceDeviationBps) > this.policy.invoiceToleranceBps)
      throw financialError("invoice-fx-mismatch");
    const evidence = {
      currency,
      rateToUsd: decimalString(medianAtoms),
      sources: rows.map(({ source, observedAt, rateAtoms }) => ({
        source,
        observedAt,
        rateToUsd: decimalString(rateAtoms),
      })),
      maximumDivergenceBps,
      invoiceDeviationBps,
    };
    return { ...evidence, evidenceHash: digest(evidence) };
  }

  status() {
    return { sources: [...this.sources].sort(), policy: { ...this.policy } };
  }
}

module.exports = { FxOracle, verifyInvoiceAttestation };
