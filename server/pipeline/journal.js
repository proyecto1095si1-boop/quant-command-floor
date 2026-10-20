"use strict";

const crypto = require("node:crypto"),
  { stable } = require("./audit.js");

const ZERO_HASH = "0".repeat(64),
  ATOMS = /^(0|[1-9]\d*)$/;

function sha256(value) {
  return crypto.createHash("sha256").update(stable(value)).digest("hex");
}

function fillFingerprint(fill) {
  const { journal: ignored, ...content } = fill;
  return sha256(content);
}

function posting(account, signedAtoms) {
  const amount = BigInt(signedAtoms);
  return {
    account,
    debit: String(amount > 0n ? amount : 0n),
    credit: String(amount < 0n ? -amount : 0n),
  };
}

class DoubleEntryJournal {
  constructor() {
    this.rows = [];
    this.legacyAnchor = null;
    this.ids = new Set();
  }

  head() {
    return this.rows.at(-1)?.hash || this.legacyAnchor?.hash || ZERO_HASH;
  }

  append(fill, { cash, inventory, realizedPnl, fees }) {
    if (this.ids.has(fill.id)) throw new Error("journal-duplicate-fill");
    const postings = [
        posting("cash", cash),
        posting(`inventory:${fill.symbol}`, inventory),
        posting("realized-pnl", -BigInt(realizedPnl)),
        posting("fees", fees),
      ],
      seq = this.rows.length + 1,
      body = {
        seq,
        fillId: fill.id,
        fillHash: fillFingerprint(fill),
        prev: this.head(),
        at: fill.at,
        postings,
      },
      row = { ...body, hash: sha256(body) };
    this.rows.push(row);
    this.ids.add(fill.id);
    const check = this.verifyPostings(row);
    if (!check.valid) {
      this.rows.pop();
      this.ids.delete(fill.id);
      throw new Error(`journal-unbalanced:${fill.id}`);
    }
    return structuredClone(row);
  }

  anchor(fills, balances, initialCash, type) {
    const body = {
      type,
      fillCount: fills.length,
      fillsHash: sha256(fills),
      balances,
      initialCash: String(initialCash),
    };
    this.legacyAnchor = { ...body, hash: sha256(body) };
    this.ids = new Set(fills.map((fill) => fill.id));
    return structuredClone(this.legacyAnchor);
  }

  anchorGenesis(initialCash) {
    return this.anchor([], {}, initialCash, "paper-ledger-genesis");
  }

  anchorLegacy(fills, balances, initialCash) {
    return this.anchor(
      fills,
      balances,
      initialCash,
      "legacy-checkpoint-anchor",
    );
  }

  verifyPostings(row) {
    let debits = 0n,
      credits = 0n;
    if (!Array.isArray(row.postings) || row.postings.length !== 4)
      return { valid: false, reason: "posting-count" };
    for (const entry of row.postings) {
      if (
        typeof entry.account !== "string" ||
        !ATOMS.test(entry.debit) ||
        !ATOMS.test(entry.credit)
      )
        return { valid: false, reason: "posting-format" };
      const debit = BigInt(entry.debit),
        credit = BigInt(entry.credit);
      if (debit > 0n && credit > 0n)
        return { valid: false, reason: "posting-side" };
      debits += debit;
      credits += credit;
    }
    return {
      valid: debits === credits,
      reason: debits === credits ? null : "unbalanced",
      debits: String(debits),
      credits: String(credits),
    };
  }

  verify(fills = []) {
    const fillMap = new Map(fills.map((fill) => [fill.id, fill]));
    if (fillMap.size !== fills.length)
      return { valid: false, reason: "duplicate-fill" };
    let prev = this.legacyAnchor?.hash || ZERO_HASH;
    const seen = new Set(),
      legacyCount = this.legacyAnchor?.fillCount || 0;
    if (this.legacyAnchor) {
      const { hash, ...body } = this.legacyAnchor;
      if (
        sha256(body) !== hash ||
        fills.length < legacyCount ||
        sha256(fills.slice(0, legacyCount)) !== this.legacyAnchor.fillsHash
      )
        return { valid: false, reason: "legacy-anchor" };
      for (const fill of fills.slice(0, legacyCount)) seen.add(fill.id);
    }
    for (let index = 0; index < this.rows.length; index++) {
      const row = this.rows[index],
        fill = fillMap.get(row.fillId),
        { hash, ...body } = row,
        postings = this.verifyPostings(row);
      if (row.seq !== index + 1)
        return { valid: false, reason: "sequence", brokenAt: row.seq };
      if (row.prev !== prev || sha256(body) !== hash)
        return { valid: false, reason: "hash-chain", brokenAt: row.seq };
      if (!postings.valid)
        return {
          valid: false,
          reason: postings.reason,
          brokenAt: row.seq,
        };
      if (
        !fill ||
        seen.has(row.fillId) ||
        fillFingerprint(fill) !== row.fillHash
      )
        return { valid: false, reason: "fill-link", brokenAt: row.seq };
      if (
        fill.journal?.seq !== row.seq ||
        fill.journal?.hash !== row.hash ||
        row.at !== fill.at
      )
        return { valid: false, reason: "fill-reference", brokenAt: row.seq };
      const expectedAccounts = [
        "cash",
        `inventory:${fill.symbol}`,
        "realized-pnl",
        "fees",
      ];
      if (
        row.postings.some(
          (entry, postingIndex) =>
            entry.account !== expectedAccounts[postingIndex],
        )
      )
        return { valid: false, reason: "posting-account", brokenAt: row.seq };
      seen.add(row.fillId);
      prev = hash;
    }
    if (seen.size !== fills.length)
      return { valid: false, reason: "unjournaled-fill" };
    return {
      valid: true,
      count: this.rows.length,
      legacyCount,
      totalFills: seen.size,
      head: prev,
    };
  }

  balances() {
    const balances = new Map(
      Object.entries(this.legacyAnchor?.balances || {}).map(([key, value]) => [
        key,
        BigInt(value),
      ]),
    );
    for (const row of this.rows)
      for (const entry of row.postings)
        balances.set(
          entry.account,
          (balances.get(entry.account) || 0n) +
            BigInt(entry.debit) -
            BigInt(entry.credit),
        );
    return balances;
  }

  export() {
    return {
      version: 1,
      paperOnly: true,
      legacyAnchor: this.legacyAnchor
        ? structuredClone(this.legacyAnchor)
        : null,
      rows: this.rows.map((row) => structuredClone(row)),
    };
  }

  restore(value, fills) {
    if (value?.paperOnly !== true || value?.version !== 1)
      throw new Error("invalid-paper-journal");
    this.legacyAnchor = value.legacyAnchor
      ? structuredClone(value.legacyAnchor)
      : null;
    this.rows = Array.isArray(value.rows)
      ? value.rows.map((row) => structuredClone(row))
      : [];
    this.ids = new Set(fills.map((fill) => fill.id));
    const check = this.verify(fills);
    if (!check.valid)
      throw new Error(`journal-corrupt:${check.reason}:${check.brokenAt || 0}`);
    return check;
  }
}

module.exports = {
  DoubleEntryJournal,
  ZERO_HASH,
  fillFingerprint,
  posting,
  sha256,
};
