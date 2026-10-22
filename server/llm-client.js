"use strict";
const ALLOWED_AGENTS = new Set([
  "Social Sentiment Scanner",
  "Macro News Reader",
]);
const SYSTEM = `You are a financial classification node in a paper-trading research system. Return JSON only with keys signal, confidence, evidence. signal must be -1..1, confidence 0..1, evidence an array of short source-grounded strings. Never propose or execute a real order. If evidence is insufficient, return signal 0 and low confidence.`;
function safeBase(value) {
  if (!value) return null;
  const u = new URL(value);
  if (!["http:", "https:"].includes(u.protocol))
    throw new Error("invalid-llm-protocol");
  if (u.username || u.password) throw new Error("credentials-in-url");
  return u.toString().replace(/\/$/, "");
}
function extract(content) {
  const text = String(content || "").replace(/^```(?:json)?\s*|\s*```$/g, "");
  const x = JSON.parse(text);
  return {
    signal: Math.max(-1, Math.min(1, Number(x.signal) || 0)),
    confidence: Math.max(0, Math.min(1, Number(x.confidence) || 0)),
    evidence: Array.isArray(x.evidence)
      ? x.evidence.slice(0, 20).map(String)
      : [],
  };
}
async function executeLLM(
  payload,
  {
    fetcher = fetch,
    baseUrl = process.env.LLM_BASE_URL,
    apiKey = process.env.LLM_API_KEY,
    defaultModel = process.env.LLM_MODEL || "local-model",
    providerHealth = null,
    clock = () => Date.now(),
  } = {},
) {
  if (!ALLOWED_AGENTS.has(payload.agent_id)) return null;
  const base = safeBase(baseUrl);
  if (!base) return null;
  const permit = (await providerHealth?.acquire()) || { allowed: true };
  if (!permit.allowed)
    throw Object.assign(new Error(permit.reason), {
      providerUnavailable: true,
    });
  const model = payload.model || {},
    startedAt = clock(),
    controller = new AbortController(),
    timeout = Math.max(
      500,
      Math.min(60000, Number(payload.policy?.timeout_ms) || 8000),
    ),
    timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetcher(base + "/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: model.name || defaultModel,
        temperature: Math.max(0, Math.min(0.5, Number(model.temperature) || 0)),
        top_p: Math.max(0.1, Math.min(1, Number(model.top_p) || 0.2)),
        max_tokens: Math.max(
          64,
          Math.min(2000, Number(model.max_tokens) || 500),
        ),
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: JSON.stringify({
              agent_id: payload.agent_id,
              input: payload.input,
            }),
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`llm-http-${response.status}`);
    const data = await response.json(),
      normalized = extract(data.choices?.[0]?.message?.content);
    await providerHealth?.success(clock() - startedAt);
    return {
      agent_id: payload.agent_id,
      version: `llm:${model.name || defaultModel}`,
      status: "ok",
      ...normalized,
      usage: {
        promptTokens: Number(data.usage?.prompt_tokens) || 0,
        completionTokens: Number(data.usage?.completion_tokens) || 0,
        totalTokens: Number(data.usage?.total_tokens) || 0,
        reported: Number.isSafeInteger(Number(data.usage?.total_tokens)),
      },
      latency_ms: 0,
      at: new Date().toISOString(),
    };
  } catch (error) {
    let providerError = error;
    if (!error.providerHealthPersistence)
      try {
        await providerHealth?.failure(error, clock() - startedAt);
      } catch (persistenceError) {
        providerError = persistenceError;
      }
    throw Object.assign(providerError, { providerUnavailable: true });
  } finally {
    clearTimeout(timer);
  }
}
module.exports = { executeLLM, safeBase, extract, ALLOWED_AGENTS };
