"use strict";
const crypto = require("node:crypto");
const LEVEL = { viewer: 1, operator: 2, risk: 3, admin: 4 };
function b64(x) {
  return Buffer.from(x).toString("base64url");
}
class SecurityManager {
  constructor({
    environment = process.env.NODE_ENV || "development",
    secret = process.env.AUTH_SECRET,
    rateLimit = 120,
    windowMs = 60000,
    now = () => Date.now(),
  } = {}) {
    this.environment = environment;
    this.secret = secret;
    this.enforced = environment === "production";
    this.rateLimit = rateLimit;
    this.windowMs = windowMs;
    this.now = now;
    this.buckets = new Map();
    if (this.enforced && (!secret || secret.length < 32))
      throw new Error("production-requires-AUTH_SECRET-min-32");
  }
  issue({ sub, role = "viewer", ttlSec = 3600 }) {
    if (!this.secret) throw new Error("auth-secret-missing");
    if (!LEVEL[role]) throw new Error("invalid-role");
    const payload = b64(
        JSON.stringify({
          sub,
          role,
          iat: Math.floor(this.now() / 1000),
          exp: Math.floor(this.now() / 1000) + ttlSec,
        }),
      ),
      signature = crypto
        .createHmac("sha256", this.secret)
        .update(payload)
        .digest("base64url");
    return `${payload}.${signature}`;
  }
  authenticate(header) {
    if (!this.enforced && !header)
      return { sub: "local-development", role: "admin", local: true };
    const token = String(header || "").replace(/^Bearer\s+/i, ""),
      [payload, signature] = token.split(".");
    if (!payload || !signature)
      throw Object.assign(new Error("authentication-required"), {
        status: 401,
      });
    const expected = crypto
        .createHmac("sha256", this.secret)
        .update(payload)
        .digest(),
      actual = Buffer.from(signature, "base64url");
    if (
      actual.length !== expected.length ||
      !crypto.timingSafeEqual(actual, expected)
    )
      throw Object.assign(new Error("invalid-token"), { status: 401 });
    let claims;
    try {
      claims = JSON.parse(Buffer.from(payload, "base64url"));
    } catch (e) {
      throw Object.assign(new Error("invalid-token"), { status: 401 });
    }
    if (!LEVEL[claims.role] || claims.exp <= Math.floor(this.now() / 1000))
      throw Object.assign(new Error("expired-or-invalid-token"), {
        status: 401,
      });
    return claims;
  }
  requiredRole(method, url) {
    if (method === "GET") return "viewer";
    if (
      url === "/v1/pipeline/halt" ||
      url === "/v1/pipeline/resume" ||
      url.startsWith("/v1/risk/")
    )
      return "risk";
    if (
      url.includes("/promote") ||
      url.startsWith("/v1/sre/") ||
      url.startsWith("/v1/governance/")
    )
      return "admin";
    return "operator";
  }
  authorize(claims, required) {
    if ((LEVEL[claims.role] || 0) < LEVEL[required])
      throw Object.assign(new Error("forbidden"), { status: 403 });
    return true;
  }
  consume(key) {
    const now = this.now(),
      row = this.buckets.get(key) || { start: now, count: 0 };
    if (now - row.start >= this.windowMs) {
      row.start = now;
      row.count = 0;
    }
    row.count++;
    this.buckets.set(key, row);
    return {
      allowed: row.count <= this.rateLimit,
      remaining: Math.max(0, this.rateLimit - row.count),
      resetMs: row.start + this.windowMs - now,
    };
  }
  status() {
    return {
      environment: this.environment,
      enforced: this.enforced,
      secretConfigured: !!this.secret,
      algorithm: "HMAC-SHA256",
      roles: Object.keys(LEVEL),
      rateLimit: { requests: this.rateLimit, windowMs: this.windowMs },
      fourEyes: process.env.REQUIRE_FOUR_EYES === "true",
    };
  }
}
module.exports = { SecurityManager, LEVEL };
