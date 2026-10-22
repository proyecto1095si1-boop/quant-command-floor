"use strict";

const assert = require("node:assert/strict"),
  { createGateway } = require("../server/gateway.js"),
  { SecurityManager } = require("../server/security/manager.js");

(async () => {
  const imported = [],
    reconciliation = {
      status: () => ({
        paperOnly: true,
        summary: { invoices: imported.length },
      }),
      importInvoice: async (invoice, importedBy) => {
        imported.push({ invoice, importedBy });
        return { invoiceId: invoice.invoiceId, idempotent: false };
      },
    },
    gateway = createGateway({ aiCostReconciliation: reconciliation }),
    address = await gateway.listen(0),
    base = `http://127.0.0.1:${address.port}`;
  try {
    const status = await fetch(`${base}/v1/ai/cost-reconciliation`);
    assert.equal(status.status, 200);
    assert.equal((await status.json()).paperOnly, true);
    const created = await fetch(
      `${base}/v1/sre/ai-cost-reconciliation/invoices`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invoiceId: "inv-api" }),
      },
    );
    assert.equal(created.status, 201);
    assert.equal(imported[0].importedBy.importedBy, "local-development");
  } finally {
    await gateway.close();
  }
  const secret = "r".repeat(32),
    security = new SecurityManager({ environment: "production", secret }),
    secured = createGateway({ aiCostReconciliation: reconciliation, security }),
    securedAddress = await secured.listen(0);
  try {
    const operator = security.issue({ sub: "operator", role: "operator" }),
      denied = await fetch(
        `http://127.0.0.1:${securedAddress.port}/v1/sre/ai-cost-reconciliation/invoices`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${operator}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ invoiceId: "forbidden" }),
        },
      );
    assert.equal(denied.status, 403);
  } finally {
    await secured.close();
  }
  console.log("AI cost reconciliation API tests: ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
