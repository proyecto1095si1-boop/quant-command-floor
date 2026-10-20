const assert = require("node:assert/strict");
const { RiskEngine, PaperBroker } = require("../dist/operations.js");
const A = require("../dist/advanced.js");
const {
  AuditChain,
  TokenBucket,
  validateEndpoint,
} = require("../dist/audit-security.js");
const risk = new RiskEngine(),
  broker = new PaperBroker({ cash: 100000, risk });
let r = broker.submit(
  { id: "o1", symbol: "BTC", side: "buy", qty: 0.1 },
  { price: 60000 },
  {
    equity: 100000,
    var: 0.02,
    drawdown: 0.01,
    exposure: 0,
    correlation: 0.3,
    liquidityScore: 8,
  },
);
assert.equal(r.status, "filled");
assert.equal(
  broker.submit(
    { id: "o1", symbol: "BTC", side: "buy", qty: 0.1 },
    { price: 60000 },
    {},
  ).reason,
  "duplicate-id",
);
risk.halt();
assert.equal(
  broker.submit(
    { id: "o2", symbol: "BTC", side: "buy", qty: 0.1 },
    { price: 60000 },
    {},
  ).status,
  "veto",
);
const opt = A.blackScholes({
  spot: 100,
  strike: 100,
  time: 1,
  vol: 0.2,
  type: "put",
});
assert.ok(opt.price > 0);
assert.ok(
  A.triangularArbitrage({ USDT_ETH: 0.0005, ETH_UNI: 3000, UNI_USDT: 0.7 })
    .valid,
);
assert.equal(A.reconcile({ USDT: 10 }, { USDT: 10 })[0].ok, true);
const chain = new AuditChain();
chain.append("signal", { x: 1 });
chain.append("veto", { ok: false });
assert.equal(chain.verify().valid, true);
chain.rows[0].payload.x = 2;
assert.equal(chain.verify().valid, false);
const bucket = new TokenBucket(1, 1);
assert.equal(bucket.take(), true);
assert.equal(bucket.take(), false);
assert.equal(
  validateEndpoint("https://api.example.com", ["api.example.com"]).valid,
  true,
);
console.log("operations + security tests: ok");
