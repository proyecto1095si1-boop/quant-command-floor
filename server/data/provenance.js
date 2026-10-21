"use strict";

const crypto = require("node:crypto");

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}

function fingerprint(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

function payload(event) {
  const copy = structuredClone(event);
  delete copy.provenance;
  return copy;
}

function partitionAt(value) {
  const milliseconds = Date.parse(String(value || ""));
  if (!Number.isFinite(milliseconds))
    throw new Error("market-event-received-time-required");
  return new Date(milliseconds).toISOString().slice(0, 10);
}

function numericSequence(value) {
  return /^\d+$/.test(String(value || ""));
}

function provenanceContent(stream, event, head, ingestedAt) {
  const clean = payload(event),
    partition = partitionAt(ingestedAt),
    sourceSequence =
      event.sequence == null
        ? event.tradeId == null
          ? null
          : String(event.tradeId)
        : String(event.sequence);
  if (
    stream.startsWith("trades.") &&
    head &&
    numericSequence(head.sourceSequence) &&
    numericSequence(sourceSequence) &&
    BigInt(sourceSequence) <= BigInt(head.sourceSequence)
  )
    throw new Error("market-source-sequence-regression");
  return {
    version: 1,
    stream,
    partition,
    sequence: (head?.sequence || 0) + 1,
    previousHash: head?.hash || null,
    payloadHash: fingerprint(clean),
    source: String(event.source || "unknown"),
    symbol: String(event.symbol || ""),
    sourceSequence,
    sourceGap:
      stream.startsWith("trades.") &&
      head &&
      numericSequence(head.sourceSequence) &&
      numericSequence(sourceSequence)
        ? BigInt(sourceSequence) > BigInt(head.sourceSequence) + 1n
        : false,
    eventAt: event.exchangeAt || event.receivedAt,
    receivedAt: event.receivedAt,
    ingestedAt,
  };
}

class MarketDataProvenance {
  constructor({ clock, maxEventFutureMs = 2_000 } = {}) {
    if (!clock || typeof clock.now !== "function")
      throw new Error("trusted-clock-required");
    if (!Number.isFinite(maxEventFutureMs) || maxEventFutureMs < 0)
      throw new Error("invalid-market-provenance-policy");
    this.clock = clock;
    this.maxEventFutureMs = maxEventFutureMs;
    this.heads = new Map();
    this.metrics = { sealed: 0, sourceGaps: 0 };
  }

  key(stream, partition) {
    return `${stream}:${partition}`;
  }

  seal(stream, event) {
    if (!event || typeof event !== "object" || event.provenance)
      throw new Error("invalid-market-event");
    const receivedMs = Date.parse(String(event.receivedAt || "")),
      eventMs = Date.parse(String(event.exchangeAt || event.receivedAt || ""));
    if (!Number.isFinite(receivedMs) || !Number.isFinite(eventMs))
      throw new Error("market-event-time-required");
    if (eventMs - receivedMs > this.maxEventFutureMs)
      throw new Error("market-event-clock-skew");
    const ingestedAt = this.clock.now().toISOString(),
      partition = partitionAt(ingestedAt),
      key = this.key(stream, partition),
      content = provenanceContent(
        stream,
        event,
        this.heads.get(key),
        ingestedAt,
      ),
      provenance = { ...content, hash: fingerprint(content) };
    this.metrics.sealed++;
    if (provenance.sourceGap) this.metrics.sourceGaps++;
    this.heads.set(key, provenance);
    return { ...structuredClone(event), provenance };
  }

  verify(stream, rows, { restore = false } = {}) {
    const trusted = [],
      groups = new Map();
    for (const row of rows) {
      const day = row.provenance?.partition || partitionAt(row.receivedAt);
      if (!groups.has(day)) groups.set(day, []);
      groups.get(day).push(row);
    }
    for (const [day, events] of groups) {
      const firstSealed = events.findIndex((row) => row.provenance);
      if (firstSealed < 0) continue;
      if (events.slice(firstSealed).some((row) => !row.provenance))
        throw new Error("unsigned-market-event-after-trust-boundary");
      let head = null;
      for (const row of events.slice(firstSealed)) {
        const provenance = row.provenance,
          { hash, ...content } = provenance,
          expected = provenanceContent(
            stream,
            row,
            head,
            provenance.ingestedAt,
          );
        if (
          provenance.partition !== day ||
          fingerprint(content) !== fingerprint(expected) ||
          hash !== fingerprint(content)
        )
          throw new Error("invalid-market-provenance-chain");
        head = provenance;
        trusted.push(row);
      }
      if (restore && head) this.heads.set(this.key(stream, day), head);
    }
    return trusted;
  }

  status() {
    return {
      algorithm: "SHA-256",
      scope: "daily-local-chain",
      metrics: { ...this.metrics },
      heads: [...this.heads.values()].map((head) => ({
        stream: head.stream,
        partition: head.partition,
        sequence: head.sequence,
        hash: head.hash,
      })),
      clock: this.clock.status(),
    };
  }
}

module.exports = { MarketDataProvenance, fingerprint };
