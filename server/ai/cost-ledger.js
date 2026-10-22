"use strict";

const {
  decimalString,
  divideRounded,
  fromAtoms,
  toAtoms,
} = require("../math/fixed-decimal.js");
const {
  digest,
  openCheckpoint,
  sealCheckpoint,
} = require("../config/checkpoint.js");

function dayKey(at) {
  return new Date(at).toISOString().slice(0, 10);
}

function tokenCount(usage, fallback) {
  if (usage?.reported === false) return fallback;
  const value = Number(usage?.total_tokens ?? usage?.totalTokens);
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

function validRows(table) {
  return (
    table &&
    typeof table === "object" &&
    !Array.isArray(table) &&
    Object.values(table).every(
      (row) =>
        Number.isSafeInteger(row?.requests) &&
        row.requests >= 0 &&
        Number.isSafeInteger(row.tokens) &&
        row.tokens >= 0 &&
        /^\d+$/.test(row.costAtoms),
    )
  );
}

class AiCostLedger {
  constructor({
    record = async () => {},
    clock = () => Date.now(),
    policy = {},
    requireRecovery = false,
  } = {}) {
    this.record = record;
    this.clock = clock;
    this.policy = {
      providerDailyUsd: 10,
      agentDailyUsd: 2,
      estimatedTokens: 500,
      ...policy,
    };
    if (
      toAtoms(this.policy.providerDailyUsd) <= 0n ||
      toAtoms(this.policy.agentDailyUsd) <= 0n ||
      !Number.isInteger(this.policy.estimatedTokens) ||
      this.policy.estimatedTokens < 1
    )
      throw new Error("invalid-ai-cost-policy");
    this.policyHash = digest(this.policy);
    this.recoveryReady = !requireRecovery;
    this.day = dayKey(this.clock());
    this.providers = {};
    this.agents = {};
    this.reservations = new Map();
    this.reservationSeq = 0;
    this.revision = 0;
    this.lastId = null;
    this.recovery = { recovered: !requireRecovery, checkpoints: 0 };
  }

  rotate() {
    const day = dayKey(this.clock());
    if (day !== this.day) {
      this.day = day;
      this.providers = {};
      this.agents = {};
      this.reservations.clear();
    }
  }

  reserved(kind, id) {
    let total = 0n;
    for (const item of this.reservations.values())
      if (item[kind] === id) total += item.estimatedAtoms;
    return total;
  }

  authorize({ providerId, agentId, costPer1kTokens, estimatedTokens }) {
    this.rotate();
    if (!this.recoveryReady)
      return { allowed: false, reason: "cost-ledger-not-recovered" };
    const tokens =
        Number.isInteger(estimatedTokens) && estimatedTokens > 0
          ? estimatedTokens
          : this.policy.estimatedTokens,
      costAtoms = divideRounded(
        toAtoms(costPer1kTokens) * BigInt(tokens),
        1000n,
      ),
      providerSpent = BigInt(this.providers[providerId]?.costAtoms || 0),
      agentSpent = BigInt(this.agents[agentId]?.costAtoms || 0),
      providerLimit = toAtoms(this.policy.providerDailyUsd),
      agentLimit = toAtoms(this.policy.agentDailyUsd);
    if (
      providerSpent + this.reserved("providerId", providerId) + costAtoms >
      providerLimit
    )
      return { allowed: false, reason: "provider-daily-budget" };
    if (agentSpent + this.reserved("agentId", agentId) + costAtoms > agentLimit)
      return { allowed: false, reason: "agent-daily-budget" };
    const id = digest({
      providerId,
      agentId,
      at: this.clock(),
      sequence: ++this.reservationSeq,
    });
    this.reservations.set(id, {
      providerId,
      agentId,
      estimatedAtoms: costAtoms,
      estimatedTokens: tokens,
      costPer1kTokens,
    });
    return { allowed: true, reservationId: id };
  }

  async settle(reservationId, usage) {
    const reservation = this.reservations.get(reservationId);
    if (!reservation) throw new Error("invalid-ai-cost-reservation");
    this.reservations.delete(reservationId);
    const tokens = tokenCount(usage, reservation.estimatedTokens),
      costAtoms = divideRounded(
        toAtoms(reservation.costPer1kTokens) * BigInt(tokens),
        1000n,
      ),
      apply = (table, id) => {
        const row = table[id] || { requests: 0, tokens: 0, costAtoms: "0" };
        row.requests++;
        row.tokens += tokens;
        row.costAtoms = String(BigInt(row.costAtoms) + costAtoms);
        table[id] = row;
      };
    apply(this.providers, reservation.providerId);
    apply(this.agents, reservation.agentId);
    await this.persist();
    return {
      tokens,
      cost: decimalString(costAtoms),
      estimated: tokenCount(usage, -1) < 0,
    };
  }

  release(reservationId) {
    this.reservations.delete(reservationId);
  }

  body() {
    return {
      version: 1,
      at: this.clock(),
      day: this.day,
      policyHash: this.policyHash,
      revision: this.revision + 1,
      previousId: this.lastId,
      providers: structuredClone(this.providers),
      agents: structuredClone(this.agents),
    };
  }

  async persist() {
    const body = this.body(),
      payload = { id: digest(body), ...body };
    try {
      await this.record(
        "sre.ai-cost-ledger",
        sealCheckpoint("ai-cost-ledger", payload),
      );
    } catch (error) {
      this.recoveryReady = false;
      throw Object.assign(new Error("ai-cost-persistence-failed"), {
        cause: error,
      });
    }
    this.revision = body.revision;
    this.lastId = payload.id;
  }

  recover(checkpoints = []) {
    this.recoveryReady = false;
    let previous = null;
    for (const checkpoint of checkpoints) {
      const payload = openCheckpoint(checkpoint, "ai-cost-ledger"),
        { id, ...body } = payload;
      if (
        body.version !== 1 ||
        body.policyHash !== this.policyHash ||
        digest(body) !== id ||
        !Number.isInteger(body.revision) ||
        body.revision < 1 ||
        !Number.isFinite(body.at) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(body.day) ||
        !validRows(body.providers) ||
        !validRows(body.agents) ||
        (previous &&
          (body.revision !== previous.revision + 1 ||
            body.previousId !== previous.id ||
            body.at < previous.at))
      )
        throw new Error("invalid-ai-cost-checkpoint");
      previous = { id, ...body };
    }
    if (previous) {
      this.revision = previous.revision;
      this.lastId = previous.id;
      if (previous.day === dayKey(this.clock())) {
        this.day = previous.day;
        this.providers = structuredClone(previous.providers);
        this.agents = structuredClone(previous.agents);
      } else {
        this.day = dayKey(this.clock());
        this.providers = {};
        this.agents = {};
      }
    }
    this.recoveryReady = true;
    this.recovery = {
      recovered: true,
      checkpoints: checkpoints.length,
      revision: this.revision,
      lastId: this.lastId,
      policyHash: this.policyHash,
    };
    return structuredClone(this.recovery);
  }

  status() {
    this.rotate();
    const map = (table, limit) =>
      Object.fromEntries(
        Object.entries(table).map(([id, row]) => [
          id,
          {
            requests: row.requests,
            tokens: row.tokens,
            cost: decimalString(row.costAtoms),
            costValue: fromAtoms(row.costAtoms),
            limit: decimalString(toAtoms(limit)),
            remaining: decimalString(toAtoms(limit) - BigInt(row.costAtoms)),
          },
        ]),
      );
    return {
      day: this.day,
      paperOnly: true,
      liveTrading: false,
      providers: map(this.providers, this.policy.providerDailyUsd),
      agents: map(this.agents, this.policy.agentDailyUsd),
      reservations: this.reservations.size,
      policy: { ...this.policy },
      recovery: { ...this.recovery, recovered: this.recoveryReady },
    };
  }
}

module.exports = { AiCostLedger, dayKey, tokenCount };
