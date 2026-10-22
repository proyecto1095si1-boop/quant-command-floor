"use strict";

const { executeLLM } = require("../llm-client.js");

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

class AiProviderPool {
  constructor({ providers = [], clock = () => Date.now(), policy = {} } = {}) {
    this.clock = clock;
    this.recoveryReady = false;
    this.policy = {
      maxAttempts: 2,
      maxRequestsPerMinute: 60,
      latencyWeight: 1,
      costWeight: 1,
      priorityWeight: 0.1,
      ...policy,
    };
    if (
      !Number.isInteger(this.policy.maxAttempts) ||
      this.policy.maxAttempts < 1 ||
      !Number.isInteger(this.policy.maxRequestsPerMinute) ||
      this.policy.maxRequestsPerMinute < 1 ||
      ["latencyWeight", "costWeight", "priorityWeight"].some(
        (key) => !Number.isFinite(this.policy[key]) || this.policy[key] < 0,
      )
    )
      throw new Error("invalid-ai-provider-pool-policy");
    const ids = new Set();
    this.providers = providers.map((provider) => {
      if (
        !provider ||
        typeof provider.id !== "string" ||
        ids.has(provider.id) ||
        typeof provider.health?.status !== "function" ||
        typeof provider.health?.recover !== "function" ||
        provider.health.status().providerId !== provider.id
      )
        throw new Error("invalid-ai-provider-pool-entry");
      ids.add(provider.id);
      const maxConcurrent = Number(provider.maxConcurrent ?? 2);
      if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1)
        throw new Error("invalid-ai-provider-pool-entry");
      return {
        id: provider.id,
        baseUrl: provider.baseUrl || null,
        apiKey: provider.apiKey,
        model: provider.model || "local-model",
        fetcher: provider.fetcher,
        health: provider.health,
        priority: finite(provider.priority, 0),
        costPer1kTokens: Math.max(0, finite(provider.costPer1kTokens, 0)),
        maxConcurrent,
        inFlight: 0,
        requests: [],
        totals: { attempts: 0, successes: 0, failures: 0 },
      };
    });
  }

  prune(provider) {
    const cutoff = this.clock() - 60000;
    provider.requests = provider.requests.filter((at) => at > cutoff);
  }

  score(provider) {
    const health = provider.health.status(),
      latencyRatio =
        health.p95LatencyMs === null
          ? 1
          : health.p95LatencyMs / health.policy.latencyP95Ms,
      statePenalty = health.healthy ? 0 : health.observed ? 10 : 1;
    return (
      statePenalty +
      latencyRatio * this.policy.latencyWeight +
      provider.costPer1kTokens * this.policy.costWeight +
      provider.priority * this.policy.priorityWeight
    );
  }

  candidates(excluded = new Set()) {
    if (!this.recoveryReady) return [];
    return this.providers
      .filter((provider) => {
        this.prune(provider);
        const health = provider.health.status(),
          circuitAvailable =
            health.state !== "OPEN" || health.cooldownRemainingMs === 0;
        return (
          !excluded.has(provider.id) &&
          health.configured &&
          health.recovery.recovered &&
          circuitAvailable &&
          provider.inFlight < provider.maxConcurrent &&
          provider.requests.length < this.policy.maxRequestsPerMinute
        );
      })
      .sort((left, right) => {
        const difference = this.score(left) - this.score(right);
        return difference || left.id.localeCompare(right.id);
      });
  }

  async execute(payload) {
    const attempted = new Set(),
      failures = [];
    while (attempted.size < this.policy.maxAttempts) {
      const provider = this.candidates(attempted)[0];
      if (!provider) break;
      attempted.add(provider.id);
      provider.inFlight++;
      provider.requests.push(this.clock());
      provider.totals.attempts++;
      try {
        const result = await executeLLM(
          {
            ...payload,
            model: { ...(payload.model || {}), name: provider.model },
          },
          {
            baseUrl: provider.baseUrl,
            apiKey: provider.apiKey,
            defaultModel: provider.model,
            fetcher: provider.fetcher,
            providerHealth: provider.health,
            clock: this.clock,
          },
        );
        if (result) provider.totals.successes++;
        return result
          ? {
              ...result,
              provider: provider.id,
              routing: { attempts: attempted.size },
            }
          : null;
      } catch (error) {
        provider.totals.failures++;
        failures.push(error.message);
        if (!error.providerUnavailable) throw error;
      } finally {
        provider.inFlight--;
      }
    }
    throw Object.assign(new Error("provider-pool-exhausted"), {
      providerUnavailable: true,
      attempts: attempted.size,
      failures,
    });
  }

  recover(histories = {}) {
    this.recoveryReady = false;
    const providers = {};
    for (const provider of this.providers)
      providers[provider.id] = provider.health.recover(
        histories[provider.id] || [],
      );
    this.recoveryReady = true;
    return { recovered: true, providers };
  }

  status() {
    const providers = this.providers.map((provider) => {
        this.prune(provider);
        const health = provider.health.status();
        return {
          id: provider.id,
          configured: health.configured,
          state: health.state,
          healthy: health.healthy,
          observed: health.observed,
          p95LatencyMs: health.p95LatencyMs,
          failureRate: health.failureRate,
          cooldownRemainingMs: health.cooldownRemainingMs,
          recovery: health.recovery,
          inFlight: provider.inFlight,
          maxConcurrent: provider.maxConcurrent,
          requestBudget: {
            used: provider.requests.length,
            limit: this.policy.maxRequestsPerMinute,
          },
          costPer1kTokens: provider.costPer1kTokens,
          priority: provider.priority,
          totals: { ...provider.totals },
        };
      }),
      configured = providers.some((provider) => provider.configured),
      healthy = providers.some((provider) => provider.healthy),
      recovered =
        this.recoveryReady &&
        providers.every(
          (provider) => !provider.configured || provider.recovery.recovered,
        );
    return {
      configured,
      healthy: healthy && recovered,
      observed: providers.some((provider) => provider.observed),
      state: healthy && recovered ? "AVAILABLE" : "UNAVAILABLE",
      providers,
      recovery: { recovered },
      policy: { ...this.policy },
    };
  }
}

module.exports = { AiProviderPool };
