"use strict";

const assert = require("node:assert/strict"),
  {
    AiCostReconciliation,
    AiPriceCatalog,
  } = require("../server/ai/cost-reconciliation.js");

(async () => {
  assert.throws(
    () =>
      new AiPriceCatalog([
        {
          providerId: "p",
          model: "m",
          effectiveFrom: "2026-01-01",
          effectiveTo: "2026-12-31",
          inputPer1kUsd: 1,
          outputPer1kUsd: 2,
        },
        {
          providerId: "p",
          model: "m",
          effectiveFrom: "2026-06-01",
          inputPer1kUsd: 1.5,
          outputPer1kUsd: 2.5,
        },
      ]),
    /overlapping-ai-price-rate/,
  );
  const catalog = new AiPriceCatalog([
      {
        providerId: "primary",
        model: "model-a",
        effectiveFrom: "2026-01-01",
        effectiveTo: "2026-06-30",
        inputPer1kUsd: 1,
        outputPer1kUsd: 2,
      },
      {
        providerId: "primary",
        model: "model-a",
        effectiveFrom: "2026-07-01",
        inputPer1kUsd: 1.5,
        outputPer1kUsd: 3,
      },
    ]),
    quote = catalog.quote({
      providerId: "primary",
      model: "model-a",
      day: "2026-10-22",
      promptTokens: 1000,
      completionTokens: 500,
    });
  assert.equal(quote.inputUsd, "1.50000000");
  assert.equal(quote.outputUsd, "1.50000000");

  const written = [],
    service = new AiCostReconciliation({
      catalog,
      record: async (stream, event) => written.push([stream, event]),
      requireRecovery: true,
      policy: { varianceAlertBps: 500 },
    }),
    invoice = {
      invoiceId: "inv-2026-10",
      providerId: "primary",
      currency: "EUR",
      periodStart: "2026-10-01",
      periodEnd: "2026-10-31",
      issuedAt: "2026-11-01T00:00:00Z",
      fxRateToUsd: 1.2,
      subtotal: 2.4,
      tax: 0.1,
      lines: [
        {
          model: "model-a",
          day: "2026-10-22",
          promptTokens: 1000,
          completionTokens: 500,
        },
      ],
    };
  await assert.rejects(
    service.importInvoice(invoice, "finance"),
    /ai-reconciliation-not-recovered/,
  );
  service.recover([]);
  const result = await service.importInvoice(invoice, "finance");
  assert.equal(result.expectedUsd, "3.00000000");
  assert.equal(result.billedUsd, "3.00000000");
  assert.equal(result.varianceUsd, "0.00000000");
  assert.equal(result.varianceBps, 0);
  assert.equal(result.alert, false);
  assert.equal(written[0][0], "sre.ai-cost-reconciliation");
  assert.equal(
    (await service.importInvoice(invoice, "finance")).idempotent,
    true,
  );
  await assert.rejects(
    service.importInvoice({ ...invoice, tax: 0.2 }, "finance"),
    /ai-invoice-id-conflict/,
  );

  const restored = new AiCostReconciliation({
    catalog,
    requireRecovery: true,
    policy: { varianceAlertBps: 500 },
  });
  restored.recover(written.map(([, checkpoint]) => checkpoint));
  assert.equal(restored.status().summary.invoices, 1);
  assert.equal(restored.status().recovered, true);
  const tampered = structuredClone(written[0][1]);
  tampered.payload.invoices["inv-2026-10"].varianceBps = 999;
  assert.throws(
    () =>
      new AiCostReconciliation({
        catalog,
        requireRecovery: true,
        policy: { varianceAlertBps: 500 },
      }).recover([tampered]),
    /checkpoint-integrity/,
  );

  const failing = new AiCostReconciliation({
    catalog,
    record: async () => {
      throw new Error("disk-offline");
    },
  });
  await assert.rejects(
    failing.importInvoice({ ...invoice, invoiceId: "inv-fail" }),
    /ai-reconciliation-persistence-failed/,
  );
  assert.equal(failing.status().recovered, false);
  assert.equal(failing.status().summary.invoices, 0);

  const alerting = new AiCostReconciliation({
      catalog,
      policy: { varianceAlertBps: 100 },
    }),
    alert = await alerting.importInvoice(
      { ...invoice, invoiceId: "inv-high", subtotal: 3, tax: 0 },
      "finance",
    );
  assert.equal(alert.billedUsd, "3.60000000");
  assert.equal(alert.varianceBps, 2000);
  assert.equal(alert.alert, true);
  assert.equal(alerting.status().paperOnly, true);
  console.log("AI cost reconciliation tests: ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
