"use strict";

const {
  decimalString,
  divideRounded,
  multiplyAtoms,
  toAtoms,
} = require("../math/fixed-decimal.js");
const {
  digest,
  openCheckpoint,
  sealCheckpoint,
} = require("../config/checkpoint.js");
const {
  FxOracle,
  verifyInvoiceAttestation,
} = require("../finance/provenance.js");

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function nonNegativeInteger(value, field) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error(`invalid-${field}`);
  return value;
}

function normalizeRate(row) {
  const normalized = {
    providerId: String(row?.providerId || "").trim(),
    model: String(row?.model || "").trim(),
    effectiveFrom: String(row?.effectiveFrom || ""),
    effectiveTo: row?.effectiveTo == null ? null : String(row.effectiveTo),
    inputPer1kUsd: decimalString(toAtoms(row?.inputPer1kUsd)),
    outputPer1kUsd: decimalString(toAtoms(row?.outputPer1kUsd)),
  };
  if (
    !normalized.providerId ||
    !normalized.model ||
    !ISO_DAY.test(normalized.effectiveFrom) ||
    (normalized.effectiveTo !== null &&
      (!ISO_DAY.test(normalized.effectiveTo) ||
        normalized.effectiveTo < normalized.effectiveFrom)) ||
    toAtoms(normalized.inputPer1kUsd) < 0n ||
    toAtoms(normalized.outputPer1kUsd) < 0n
  )
    throw new Error("invalid-ai-price-rate");
  return normalized;
}

class AiPriceCatalog {
  constructor(rows = []) {
    this.rows = rows
      .map(normalizeRate)
      .sort((a, b) =>
        `${a.providerId}\0${a.model}\0${a.effectiveFrom}`.localeCompare(
          `${b.providerId}\0${b.model}\0${b.effectiveFrom}`,
        ),
      );
    for (let i = 0; i < this.rows.length; i++) {
      const row = this.rows[i],
        next = this.rows[i + 1];
      if (
        next?.providerId === row.providerId &&
        next.model === row.model &&
        (row.effectiveTo === null || row.effectiveTo >= next.effectiveFrom)
      )
        throw new Error("overlapping-ai-price-rate");
    }
    this.hash = digest(this.rows);
  }

  rate(providerId, model, day) {
    const matches = this.rows.filter(
      (row) =>
        row.providerId === providerId &&
        row.model === model &&
        row.effectiveFrom <= day &&
        (row.effectiveTo === null || row.effectiveTo >= day),
    );
    if (matches.length !== 1) throw new Error("ai-price-rate-not-found");
    return matches[0];
  }

  quote({ providerId, model, day, promptTokens, completionTokens }) {
    const rate = this.rate(providerId, model, day),
      inputAtoms = divideRounded(
        toAtoms(rate.inputPer1kUsd) *
          BigInt(nonNegativeInteger(promptTokens, "prompt-tokens")),
        1000n,
      ),
      outputAtoms = divideRounded(
        toAtoms(rate.outputPer1kUsd) *
          BigInt(nonNegativeInteger(completionTokens, "completion-tokens")),
        1000n,
      );
    return {
      inputUsd: decimalString(inputAtoms),
      outputUsd: decimalString(outputAtoms),
      totalAtoms: inputAtoms + outputAtoms,
      rate: { ...rate },
    };
  }

  status() {
    return { hash: this.hash, rates: structuredClone(this.rows) };
  }
}

function normalizeInvoice(invoice) {
  const value = {
    invoiceId: String(invoice?.invoiceId || "").trim(),
    providerId: String(invoice?.providerId || "").trim(),
    currency: String(invoice?.currency || "")
      .trim()
      .toUpperCase(),
    periodStart: String(invoice?.periodStart || ""),
    periodEnd: String(invoice?.periodEnd || ""),
    issuedAt: String(invoice?.issuedAt || ""),
    fxRateToUsd: decimalString(toAtoms(invoice?.fxRateToUsd)),
    subtotal: decimalString(toAtoms(invoice?.subtotal)),
    tax: decimalString(toAtoms(invoice?.tax || 0)),
    lines: Array.isArray(invoice?.lines)
      ? invoice.lines.map((line) => ({
          model: String(line?.model || "").trim(),
          day: String(line?.day || ""),
          promptTokens: nonNegativeInteger(line?.promptTokens, "prompt-tokens"),
          completionTokens: nonNegativeInteger(
            line?.completionTokens,
            "completion-tokens",
          ),
        }))
      : [],
  };
  if (
    !value.invoiceId ||
    !value.providerId ||
    !/^[A-Z]{3}$/.test(value.currency) ||
    !ISO_DAY.test(value.periodStart) ||
    !ISO_DAY.test(value.periodEnd) ||
    value.periodEnd < value.periodStart ||
    !Number.isFinite(Date.parse(value.issuedAt)) ||
    toAtoms(value.fxRateToUsd) <= 0n ||
    toAtoms(value.subtotal) < 0n ||
    toAtoms(value.tax) < 0n ||
    value.lines.length < 1 ||
    value.lines.some(
      (line) =>
        !line.model ||
        !ISO_DAY.test(line.day) ||
        line.day < value.periodStart ||
        line.day > value.periodEnd,
    )
  )
    throw new Error("invalid-ai-invoice");
  return value;
}

function calculate(invoice, catalog, varianceAlertBps) {
  let expectedAtoms = 0n;
  for (const line of invoice.lines)
    expectedAtoms += catalog.quote({
      providerId: invoice.providerId,
      model: line.model,
      day: line.day,
      promptTokens: line.promptTokens,
      completionTokens: line.completionTokens,
    }).totalAtoms;
  const billedNativeAtoms = toAtoms(invoice.subtotal) + toAtoms(invoice.tax),
    billedUsdAtoms = multiplyAtoms(
      billedNativeAtoms,
      toAtoms(invoice.fxRateToUsd),
    ),
    varianceAtoms = billedUsdAtoms - expectedAtoms,
    varianceBps =
      expectedAtoms === 0n
        ? billedUsdAtoms === 0n
          ? 0
          : 1_000_000_000
        : Number(divideRounded(varianceAtoms * 10_000n, expectedAtoms));
  return {
    expectedUsd: decimalString(expectedAtoms),
    billedUsd: decimalString(billedUsdAtoms),
    varianceUsd: decimalString(varianceAtoms),
    varianceBps,
    alert: Math.abs(varianceBps) > varianceAlertBps,
  };
}

class AiCostReconciliation {
  constructor({
    catalog,
    record = async () => {},
    trustedIssuers = new Map(),
    fxOracle = new FxOracle(),
    policy = {},
    requireRecovery = false,
  } = {}) {
    if (!(catalog instanceof AiPriceCatalog))
      throw new Error("invalid-ai-price-catalog");
    this.catalog = catalog;
    this.record = record;
    this.trustedIssuers = trustedIssuers;
    this.fxOracle = fxOracle;
    this.policy = {
      varianceAlertBps: 500,
      requireSignedInvoices: false,
      requireDualApproval: false,
      requireFxEvidence: false,
      ...policy,
    };
    if (
      !Number.isSafeInteger(this.policy.varianceAlertBps) ||
      this.policy.varianceAlertBps < 0 ||
      typeof this.policy.requireSignedInvoices !== "boolean" ||
      typeof this.policy.requireDualApproval !== "boolean" ||
      typeof this.policy.requireFxEvidence !== "boolean"
    )
      throw new Error("invalid-ai-reconciliation-policy");
    this.policyHash = digest({
      catalogHash: catalog.hash,
      fxOracle: fxOracle.status(),
      trustedIssuers: [...trustedIssuers.keys()].sort(),
      ...this.policy,
    });
    this.invoices = new Map();
    this.revision = 0;
    this.lastId = null;
    this.recoveryReady = !requireRecovery;
  }

  async importInvoice(raw, context = "system") {
    if (!this.recoveryReady) throw new Error("ai-reconciliation-not-recovered");
    const invoice = normalizeInvoice(raw),
      sourceDigest = digest(invoice),
      importedBy =
        typeof context === "string"
          ? context
          : String(context?.importedBy || "unknown"),
      approvers =
        typeof context === "object" && Array.isArray(context.approvers)
          ? [...new Set(context.approvers.map(String).filter(Boolean))]
          : [],
      provenance = this.policy.requireSignedInvoices
        ? verifyInvoiceAttestation(
            invoice,
            raw.attestation,
            this.trustedIssuers,
          )
        : null,
      fxBody = this.policy.requireFxEvidence
        ? this.fxOracle.resolve(
            invoice.currency,
            invoice.fxRateToUsd,
            raw.fxObservations,
          )
        : {
            currency: invoice.currency,
            rateToUsd: invoice.fxRateToUsd,
            sources: [],
            maximumDivergenceBps: null,
            invoiceDeviationBps: null,
          },
      fxEvidence = {
        ...fxBody,
        evidenceHash: fxBody.evidenceHash || digest(fxBody),
      },
      existing = this.invoices.get(invoice.invoiceId);
    if (this.policy.requireDualApproval && approvers.length !== 2)
      throw new Error("independent-accounting-approval-required");
    if (existing) {
      if (existing.sourceDigest !== sourceDigest)
        throw new Error("ai-invoice-id-conflict");
      return { ...structuredClone(existing), idempotent: true };
    }
    const result = {
      invoice,
      sourceDigest,
      importedBy,
      approvers,
      importedAt: Date.now(),
      catalogHash: this.catalog.hash,
      provenance,
      fxEvidence,
      ...calculate(invoice, this.catalog, this.policy.varianceAlertBps),
    };
    this.invoices.set(invoice.invoiceId, result);
    try {
      await this.persist();
    } catch (error) {
      this.invoices.delete(invoice.invoiceId);
      this.recoveryReady = false;
      throw Object.assign(new Error("ai-reconciliation-persistence-failed"), {
        cause: error,
      });
    }
    return structuredClone(result);
  }

  async persist() {
    const body = {
        version: 1,
        at: Date.now(),
        revision: this.revision + 1,
        previousId: this.lastId,
        policyHash: this.policyHash,
        invoices: Object.fromEntries(this.invoices),
      },
      payload = { id: digest(body), ...body };
    await this.record(
      "sre.ai-cost-reconciliation",
      sealCheckpoint("ai-cost-reconciliation", payload),
    );
    this.revision = body.revision;
    this.lastId = payload.id;
  }

  recover(checkpoints = []) {
    this.recoveryReady = false;
    let previous = null;
    for (const checkpoint of checkpoints) {
      const payload = openCheckpoint(checkpoint, "ai-cost-reconciliation"),
        { id, ...body } = payload;
      if (
        body.version !== 1 ||
        body.policyHash !== this.policyHash ||
        digest(body) !== id ||
        !Number.isSafeInteger(body.revision) ||
        body.revision < 1 ||
        !Number.isFinite(body.at) ||
        !body.invoices ||
        typeof body.invoices !== "object" ||
        Array.isArray(body.invoices) ||
        (previous &&
          (body.revision !== previous.revision + 1 ||
            body.previousId !== previous.id ||
            body.at < previous.at))
      )
        throw new Error("invalid-ai-reconciliation-checkpoint");
      for (const [invoiceId, result] of Object.entries(body.invoices)) {
        const invoice = normalizeInvoice(result?.invoice),
          expected = calculate(
            invoice,
            this.catalog,
            this.policy.varianceAlertBps,
          );
        if (
          invoice.invoiceId !== invoiceId ||
          result.sourceDigest !== digest(invoice) ||
          result.catalogHash !== this.catalog.hash ||
          typeof result.importedBy !== "string" ||
          !Array.isArray(result.approvers) ||
          !Number.isFinite(result.importedAt) ||
          (this.policy.requireDualApproval && result.approvers.length !== 2) ||
          (this.policy.requireSignedInvoices &&
            verifyInvoiceAttestation(
              invoice,
              result.provenance?.attestation,
              this.trustedIssuers,
            ).invoiceHash !== result.provenance?.invoiceHash) ||
          result.fxEvidence?.evidenceHash !==
            digest(
              Object.fromEntries(
                Object.entries(result.fxEvidence || {}).filter(
                  ([key]) => key !== "evidenceHash",
                ),
              ),
            ) ||
          Object.entries(expected).some(([key, value]) => result[key] !== value)
        )
          throw new Error("invalid-ai-reconciliation-checkpoint");
      }
      previous = { id, ...body };
    }
    if (previous) {
      this.invoices = new Map(
        Object.entries(structuredClone(previous.invoices)),
      );
      this.revision = previous.revision;
      this.lastId = previous.id;
    }
    this.recoveryReady = true;
    return {
      recovered: true,
      checkpoints: checkpoints.length,
      revision: this.revision,
    };
  }

  status() {
    const invoices = [...this.invoices.values()].map((item) =>
        structuredClone(item),
      ),
      alerts = invoices.filter((item) => item.alert).length;
    return {
      paperOnly: true,
      liveTrading: false,
      recovered: this.recoveryReady,
      policy: { ...this.policy },
      catalog: this.catalog.status(),
      fxOracle: this.fxOracle.status(),
      trustedIssuers: [...this.trustedIssuers.keys()].sort(),
      invoices,
      summary: { invoices: invoices.length, alerts },
    };
  }
}

module.exports = {
  AiCostReconciliation,
  AiPriceCatalog,
  normalizeInvoice,
};
