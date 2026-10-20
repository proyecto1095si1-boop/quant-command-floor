"use strict";
const assert = require("node:assert/strict"),
  { SecurityManager } = require("../server/security/manager.js");
(() => {
  let now = 1000000;
  const s = new SecurityManager({
      environment: "production",
      secret: "x".repeat(32),
      rateLimit: 2,
      windowMs: 1000,
      now: () => now,
    }),
    token = s.issue({ sub: "alice", role: "risk", ttlSec: 60 }),
    claims = s.authenticate(`Bearer ${token}`);
  assert.equal(claims.sub, "alice");
  assert.equal(claims.role, "risk");
  assert.equal(s.authorize(claims, "operator"), true);
  assert.throws(() => s.authorize(claims, "admin"), /forbidden/);
  assert.equal(s.requiredRole("GET", "/v1/governance/models"), "viewer");
  assert.equal(s.requiredRole("POST", "/v1/governance/evaluate"), "admin");
  assert.throws(() => s.authenticate(token + "x"), /invalid-token/);
  assert.equal(s.consume("ip").allowed, true);
  assert.equal(s.consume("ip").allowed, true);
  assert.equal(s.consume("ip").allowed, false);
  now += 1001;
  assert.equal(s.consume("ip").allowed, true);
  assert.throws(
    () => new SecurityManager({ environment: "production", secret: "short" }),
    /AUTH_SECRET/,
  );
  assert.equal(new SecurityManager().authenticate().local, true);
  console.log("security manager tests: ok");
})();
