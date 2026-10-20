"use strict";
class CoinbaseStream {
  constructor({
    products = ["BTC-USD"],
    url = "wss://ws-feed.exchange.coinbase.com",
    socketFactory = (u) => new WebSocket(u),
    onEvent = () => {},
    onState = () => {},
    minBackoffMs = 500,
    maxBackoffMs = 30000,
    random = Math.random,
  } = {}) {
    this.products = products;
    this.url = url;
    this.socketFactory = socketFactory;
    this.onEvent = onEvent;
    this.onState = onState;
    this.minBackoffMs = minBackoffMs;
    this.maxBackoffMs = maxBackoffMs;
    this.random = random;
    this.socket = null;
    this.closed = true;
    this.attempt = 0;
    this.timer = null;
    this.lastMessageAt = 0;
    this.stats = { connections: 0, reconnects: 0, messages: 0, errors: 0 };
  }
  start() {
    if (!this.closed) return;
    this.closed = false;
    this.connect();
  }
  connect() {
    if (this.closed) return;
    this.onState({ status: "connecting", attempt: this.attempt });
    try {
      const ws = (this.socket = this.socketFactory(this.url));
      ws.onopen = () => {
        this.attempt = 0;
        this.stats.connections++;
        ws.send(
          JSON.stringify({
            type: "subscribe",
            product_ids: this.products,
            channels: ["heartbeat", "ticker", "matches", "level2"],
          }),
        );
        this.onState({ status: "open" });
      };
      ws.onmessage = (e) => {
        this.stats.messages++;
        this.lastMessageAt = Date.now();
        try {
          const x = JSON.parse(e.data);
          this.onEvent(x);
        } catch (error) {
          this.stats.errors++;
        }
      };
      ws.onerror = () => {
        this.stats.errors++;
      };
      ws.onclose = () => {
        this.socket = null;
        if (!this.closed) this.schedule();
      };
    } catch (e) {
      this.stats.errors++;
      this.schedule();
    }
  }
  schedule() {
    if (this.closed) return;
    const wait =
      Math.min(this.maxBackoffMs, this.minBackoffMs * 2 ** this.attempt) *
      (0.75 + this.random() * 0.5);
    this.attempt++;
    this.stats.reconnects++;
    this.onState({
      status: "reconnecting",
      waitMs: Math.round(wait),
      attempt: this.attempt,
    });
    this.timer = setTimeout(() => this.connect(), wait);
  }
  stop() {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.socket && this.socket.readyState < 2) this.socket.close();
    this.socket = null;
    this.onState({ status: "closed" });
  }
  health() {
    const age = this.lastMessageAt ? Date.now() - this.lastMessageAt : Infinity;
    return {
      status:
        this.socket?.readyState === 1 && age < 15000
          ? "healthy"
          : this.closed
            ? "stopped"
            : "degraded",
      ageMs: age,
      ...this.stats,
    };
  }
}
module.exports = { CoinbaseStream };
