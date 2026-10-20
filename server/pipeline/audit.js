"use strict";
const crypto = require("node:crypto");
const stable = (x) =>
  x && typeof x === "object"
    ? Array.isArray(x)
      ? `[${x.map(stable).join(",")}]`
      : `{${Object.keys(x)
          .sort()
          .map((k) => JSON.stringify(k) + ":" + stable(x[k]))
          .join(",")}}`
    : JSON.stringify(x);
class Sha256AuditChain {
  constructor() {
    this.rows = [];
  }
  append(type, payload) {
    const prev = this.rows.at(-1)?.hash || "0".repeat(64),
      seq = this.rows.length + 1,
      at = new Date().toISOString(),
      body = { seq, type, payload, prev, at },
      hash = crypto.createHash("sha256").update(stable(body)).digest("hex"),
      row = { ...body, hash };
    this.rows.push(row);
    return row;
  }
  verify() {
    let prev = "0".repeat(64);
    for (const row of this.rows) {
      const { hash, ...body } = row,
        actual = crypto.createHash("sha256").update(stable(body)).digest("hex");
      if (row.prev !== prev || actual !== hash)
        return { valid: false, brokenAt: row.seq };
      prev = hash;
    }
    return { valid: true, count: this.rows.length, head: prev };
  }
  export() {
    return this.rows.map((x) => structuredClone(x));
  }
  restore(rows = []) {
    this.rows = rows.map((x) => structuredClone(x));
    const check = this.verify();
    if (!check.valid) throw new Error(`audit-corrupt:${check.brokenAt}`);
    return check;
  }
}
module.exports = { Sha256AuditChain, stable };
