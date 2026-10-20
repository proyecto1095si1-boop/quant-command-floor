(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.QCF = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const now = () => new Date().toISOString();
  class EventBus {
    constructor(limit = 500) {
      this.limit = limit;
      this.events = [];
      this.listeners = new Map();
    }
    emit(type, payload = {}) {
      const event = {
        id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type,
        payload,
        at: now(),
      };
      this.events.push(event);
      if (this.events.length > this.limit) this.events.shift();
      (this.listeners.get(type) || []).forEach((fn) => fn(event));
      (this.listeners.get("*") || []).forEach((fn) => fn(event));
      return event;
    }
    on(type, fn) {
      const list = this.listeners.get(type) || [];
      list.push(fn);
      this.listeners.set(type, list);
      return () =>
        this.listeners.set(
          type,
          list.filter((x) => x !== fn),
        );
    }
    history(type) {
      return type
        ? this.events.filter((e) => e.type === type)
        : [...this.events];
    }
  }
  class StateMachine {
    constructor(initial = "running", store) {
      this.value = initial;
      this.store = store;
      this.allowed = {
        running: ["paused", "halted"],
        paused: ["running", "halted"],
        halted: ["paused"],
      };
      try {
        const saved = store && store.getItem("qcf-system-state");
        if (saved && this.allowed[saved]) this.value = saved;
      } catch (e) {}
    }
    transition(next) {
      if (!(this.allowed[this.value] || []).includes(next))
        throw new Error(`Invalid transition ${this.value} → ${next}`);
      this.value = next;
      try {
        this.store && this.store.setItem("qcf-system-state", next);
      } catch (e) {}
      return this.value;
    }
  }
  const withTimeout = (promise, ms) =>
    new Promise((resolve, reject) => {
      const id = setTimeout(() => reject(new Error(`timeout:${ms}`)), ms);
      promise.then(
        (v) => {
          clearTimeout(id);
          resolve(v);
        },
        (e) => {
          clearTimeout(id);
          reject(e);
        },
      );
    });
  const scoreFrom = (input) => {
    const s = JSON.stringify(input || {});
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (((h >>> 0) % 2001) - 1000) / 1000;
  };
  const adapters = {
    math: async ({ input, agent }) => ({
      signal: scoreFrom({ input, id: agent.id }),
      confidence: 0.91,
      evidence: ["deterministic-model", "validated-input"],
    }),
    ai: async ({ input, agent }) => ({
      signal: scoreFrom({ input, id: agent.id, mode: "ai" }),
      confidence: 0.78,
      evidence: ["simulated-ai-adapter"],
      note: "AI adapter simulated until an approved endpoint is connected",
    }),
    hybrid: async (ctx) => {
      const a = await adapters.math(ctx),
        b = await adapters.ai(ctx);
      return {
        signal: (a.signal + b.signal) / 2,
        confidence: (a.confidence + b.confidence) / 2,
        evidence: [...a.evidence, ...b.evidence],
      };
    },
  };
  class AgentRegistry {
    constructor() {
      this.agents = new Map();
    }
    register(agent) {
      if (!agent || !agent.id) throw new Error("agent.id required");
      this.agents.set(agent.id, {
        version: "1.0.0",
        type: "math",
        weight: 1,
        retries: 1,
        timeoutMs: 1500,
        ...agent,
      });
      return this.agents.get(agent.id);
    }
    get(id) {
      return this.agents.get(id);
    }
    list() {
      return [...this.agents.values()];
    }
  }
  class Runtime {
    constructor(opts = {}) {
      this.bus = opts.bus || new EventBus();
      this.registry = opts.registry || new AgentRegistry();
      this.adapters = { ...adapters, ...opts.adapters };
    }
    register(agent) {
      return this.registry.register(agent);
    }
    async execute(id, input = {}, context = {}) {
      const agent = this.registry.get(id);
      if (!agent) throw new Error(`Unknown agent: ${id}`);
      const adapter = this.adapters[agent.type] || this.adapters.math,
        start = Date.now();
      this.bus.emit("agent.started", { id, inputId: context.inputId });
      let lastError;
      for (let attempt = 0; attempt <= agent.retries; attempt++) {
        try {
          const raw = await withTimeout(
            Promise.resolve(adapter({ agent, input, context })),
            agent.timeoutMs,
          );
          const result = {
            agentId: id,
            version: agent.version,
            status: "ok",
            signal: Math.max(-1, Math.min(1, Number(raw.signal) || 0)),
            confidence: Math.max(0, Math.min(1, Number(raw.confidence) || 0)),
            evidence: raw.evidence || [],
            latencyMs: Date.now() - start,
            at: now(),
          };
          this.bus.emit("agent.completed", result);
          return result;
        } catch (error) {
          lastError = error;
          this.bus.emit("agent.retry", { id, attempt, error: error.message });
        }
      }
      const failed = {
        agentId: id,
        version: agent.version,
        status: "error",
        signal: 0,
        confidence: 0,
        evidence: [],
        latencyMs: Date.now() - start,
        error: lastError.message,
        at: now(),
      };
      this.bus.emit("agent.failed", failed);
      return failed;
    }
    async executeDAG(nodes, input = {}) {
      const results = {};
      for (const node of nodes) {
        const deps = node.dependsOn || [];
        const blocked = deps.some(
          (id) => !results[id] || results[id].status !== "ok",
        );
        results[node.id] = blocked
          ? {
              agentId: node.id,
              status: "blocked",
              signal: 0,
              confidence: 0,
              evidence: ["dependency-failed"],
              at: now(),
            }
          : await this.execute(
              node.id,
              { ...input, dependencies: deps.map((id) => results[id]) },
              { inputId: `dag_${Date.now()}` },
            );
      }
      return results;
    }
  }
  return {
    EventBus,
    StateMachine,
    AgentRegistry,
    Runtime,
    adapters,
    withTimeout,
  };
});
