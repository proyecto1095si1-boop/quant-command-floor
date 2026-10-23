"use strict";

const assert = require("node:assert/strict"),
  crypto = require("node:crypto"),
  {
    AiCostReconciliation,
    AiPriceCatalog,
    normalizeInvoice,
  } = require("../server/ai/cost-reconciliation.js"),
  { digest } = require("../server/config/checkpoint.js"),
  {
    FxOracle,
    parseTrustedIssuers,
  } = require("../server/finance/provenance.js");

(async () => {
  const now = Date.parse("2026-10-22T12:00:00Z"),
    { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519"),
    trustedIssuers = new Map([["provider-finance", publicKey]]),
    catalog = new AiPriceCatalog([
      {
        providerId: "primary",
        model: "model-a",
        effectiveFrom: "2026-01-01",
        inputPer1kUsd: 1.5,
        outputPer1kUsd: 3,
      },
    ]),
    fxOracle = new FxOracle({
      sources: ["central-bank", "market-data"],
      clock: () => now,
      policy: { maxDivergenceBps: 20, invoiceToleranceBps: 1 },
    }),
    checkpoints = [],
    service = new AiCostReconciliation({
      catalog,
      trustedIssuers,
      fxOracle,
      record: async (_stream, checkpoint) => checkpoints.push(checkpoint),
      policy: {
        requireSignedInvoices: true,
        requireFxEvidence: true,
        requireDualApproval: true,
      },
    }),
    base = {
      invoiceId: "signed-1",
      providerId: "primary",
      currency: "EUR",
      periodStart: "2026-10-01",
      periodEnd: "2026-10-31",
      issuedAt: "2026-10-22T10:00:00Z",
      fxRateToUsd: 1.2,
      subtotal: 2.5,
      tax: 0,
      lines: [
        {
          model: "model-a",
          day: "2026-10-22",
          promptTokens: 1000,
          completionTokens: 500,
        },
      ],
      fxObservations: [
        { source: "central-bank", observedAt: now - 1000, rateToUsd: 1.199 },
        { source: "market-data", observedAt: now - 2000, rateToUsd: 1.201 },
      ],
    },
    sign = (invoice, key = privateKey, issuerId = "provider-finance") => ({
      ...invoice,
      attestation: {
        issuerId,
        algorithm: "Ed25519",
        signature: crypto
          .sign(
            null,
            Buffer.from(digest(normalizeInvoice(invoice)), "hex"),
            key,
          )
          .toString("base64"),
      },
    });

  assert.equal(parseTrustedIssuers().size, 0);
  assert.equal(
    parseTrustedIssuers(
      JSON.stringify({
        "provider-finance": publicKey.export({ type: "spki", format: "pem" }),
      }),
    ).get("provider-finance").asymmetricKeyType,
    "ed25519",
  );
  assert.throws(
    () => parseTrustedIssuers("{"),
    /invalid-trusted-issuers-config/,
  );

  await assert.rejects(
    service.importInvoice(sign(base), {
      importedBy: "accountant",
      approvers: ["accountant"],
    }),
    /independent-accounting-approval-required/,
  );
  const result = await service.importInvoice(sign(base), {
    importedBy: "accountant",
    approvers: ["finance-director", "controller"],
  });
  assert.equal(result.provenance.attestation.issuerId, "provider-finance");
  assert.equal(result.fxEvidence.rateToUsd, "1.20000000");
  assert.equal(result.fxEvidence.maximumDivergenceBps, 17);
  assert.equal(result.approvers.length, 2);
  const recovered = new AiCostReconciliation({
    catalog,
    trustedIssuers,
    fxOracle,
    policy: {
      requireSignedInvoices: true,
      requireFxEvidence: true,
      requireDualApproval: true,
    },
    requireRecovery: true,
  });
  recovered.recover(checkpoints);
  assert.equal(recovered.status().summary.invoices, 1);

  const rogue = crypto.generateKeyPairSync("ed25519").privateKey;
  await assert.rejects(
    service.importInvoice(
      sign({ ...base, invoiceId: "bad-signature" }, rogue),
      {
        importedBy: "accountant",
        approvers: ["finance-director", "controller"],
      },
    ),
    /invalid-invoice-signature/,
  );
  await assert.rejects(
    service.importInvoice(
      sign({
        ...base,
        invoiceId: "stale-fx",
        fxObservations: base.fxObservations.map((row) => ({
          ...row,
          observedAt: now - 90_000_000,
        })),
      }),
      {
        importedBy: "accountant",
        approvers: ["finance-director", "controller"],
      },
    ),
    /invalid-fx-observation/,
  );
  await assert.rejects(
    service.importInvoice(
      sign({
        ...base,
        invoiceId: "divergent-fx",
        fxObservations: [
          base.fxObservations[0],
          { ...base.fxObservations[1], rateToUsd: 1.3 },
        ],
      }),
      {
        importedBy: "accountant",
        approvers: ["finance-director", "controller"],
      },
    ),
    /fx-source-divergence/,
  );
  assert.equal(service.status().trustedIssuers[0], "provider-finance");
  assert.equal(service.status().paperOnly, true);
  console.log("financial provenance tests: ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
