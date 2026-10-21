"use strict";
const http = require("node:http"),
  crypto = require("node:crypto"),
  { execute } = require("./agent-engine.js"),
  { executeLLM } = require("./llm-client.js"),
  { DeskRegistry } = require("./desks/registry.js"),
  { SecurityManager } = require("./security/manager.js");
const MAX_BODY = 256 * 1024,
  MAX_CLIENTS = 100;
function cors(origin, allowed) {
  const ok = !origin || allowed === "*" || origin === allowed;
  return ok
    ? {
        "access-control-allow-origin": origin || allowed,
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers":
          "content-type,authorization,x-approver,x-second-approver",
        vary: "origin",
      }
    : {};
}
const SECURE_HEADERS = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};
function json(res, status, body, headers = {}) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(data),
    ...SECURE_HEADERS,
    ...headers,
  });
  res.end(data);
}
function textResponse(
  res,
  status,
  body,
  type = "text/plain; charset=utf-8",
  headers = {},
) {
  res.writeHead(status, {
    "content-type": type,
    "content-length": Buffer.byteLength(body),
    ...SECURE_HEADERS,
    ...headers,
  });
  res.end(body);
}
function rejectUpgrade(socket, status, error) {
  const reason =
      {
        401: "Unauthorized",
        403: "Forbidden",
        404: "Not Found",
        429: "Too Many Requests",
        503: "Service Unavailable",
      }[status] || "Bad Request",
    payload = JSON.stringify({ error });
  socket.end(
    `HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: ${Buffer.byteLength(payload)}\r\n\r\n${payload}`,
  );
}
async function body(req) {
  return new Promise((resolve, reject) => {
    let size = 0,
      chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error("payload-too-large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch (e) {
        reject(Object.assign(new Error("invalid-json"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}
function validateRequest(x) {
  const errors = [];
  if (!x || typeof x !== "object") errors.push("body");
  if (typeof x?.agent_id !== "string" || x.agent_id.length > 100)
    errors.push("agent_id");
  if (!x?.input || typeof x.input !== "object" || Array.isArray(x.input))
    errors.push("input");
  if (x?.policy?.paper_only !== true) errors.push("policy.paper_only");
  return errors;
}
function wsFrame(text) {
  const payload = Buffer.from(text),
    header =
      payload.length < 126
        ? Buffer.from([0x81, payload.length])
        : Buffer.from([0x81, 126, payload.length >> 8, payload.length & 255]);
  return Buffer.concat([header, payload]);
}
function fourEyes(req) {
  if (process.env.REQUIRE_FOUR_EYES !== "true") return;
  const a = String(req.headers["x-approver"] || ""),
    b = String(req.headers["x-second-approver"] || "");
  if (a.length < 3 || b.length < 3 || a === b)
    throw Object.assign(new Error("independent-second-approval-required"), {
      status: 403,
    });
  return { primary: a, secondary: b };
}
function createGateway(options = {}) {
  const startedAt = Date.now(),
    allowedOrigin =
      options.allowedOrigin ||
      process.env.ALLOWED_ORIGIN ||
      "http://localhost:8080",
    clients = new Set(),
    metrics = {
      requests: 0,
      executions: 0,
      errors: 0,
      latencies: [],
      statuses: {},
      observations: [],
      observationSeq: 0,
    },
    desks = options.desks || new DeskRegistry(),
    security = options.security || new SecurityManager();
  let dataService = options.dataService || null,
    pipeline = options.pipeline || null,
    dashboard = options.dashboard || null,
    research = options.research || null,
    portfolio = options.portfolio || null,
    execution = options.execution || null,
    sre = options.sre || null,
    regime = options.regime || null,
    governance = options.governance || null,
    experiments = options.experiments || null,
    aiEvaluation = options.aiEvaluation || null,
    calibrationGovernance = options.calibrationGovernance || null,
    readiness = options.readiness || null;
  const publish = (event) => {
    const frame = wsFrame(JSON.stringify(event));
    for (const socket of clients) {
      if (socket.destroyed) clients.delete(socket);
      else socket.write(frame);
    }
  };
  const handleRequest = async (req, res) => {
    const requestStarted = Date.now();
    res.on("finish", () => {
      const at = Date.now(),
        latencyMs = at - requestStarted;
      metrics.latencies.push(latencyMs);
      if (metrics.latencies.length > 2000) metrics.latencies.shift();
      metrics.statuses[res.statusCode] =
        (metrics.statuses[res.statusCode] || 0) + 1;
      metrics.observations.push({
        seq: ++metrics.observationSeq,
        at,
        status: res.statusCode,
        latencyMs,
      });
      if (metrics.observations.length > 10000) metrics.observations.shift();
    });
    const headers = cors(req.headers.origin, allowedOrigin);
    if (req.method === "OPTIONS") {
      res.writeHead(204, { ...SECURE_HEADERS, ...headers });
      return res.end();
    }
    if (req.headers.origin && !headers["access-control-allow-origin"])
      return json(res, 403, { error: "origin-denied" });
    metrics.requests++;
    const rate = security.consume(req.socket.remoteAddress || "unknown");
    headers["x-ratelimit-remaining"] = String(rate.remaining);
    if (!rate.allowed)
      return json(
        res,
        429,
        { error: "rate-limit-exceeded", reset_ms: rate.resetMs },
        headers,
      );
    if (!["/v1/health", "/v1/security/status"].includes(req.url)) {
      try {
        req.auth = security.authenticate(req.headers.authorization);
        security.authorize(
          req.auth,
          security.requiredRole(req.method, req.url),
        );
      } catch (e) {
        return json(res, e.status || 401, { error: e.message }, headers);
      }
    }
    if (req.method === "GET" && req.url === "/v1/health")
      return json(
        res,
        200,
        {
          status: "ok",
          version: "0.2.0",
          uptime_ms: Date.now() - startedAt,
          services: {
            gateway: "ok",
            local_math: "ok",
            stream: clients.size < MAX_CLIENTS ? "ok" : "saturated",
          },
          metrics,
        },
        headers,
      );
    if (req.method === "GET" && req.url === "/v1/security/status")
      return json(res, 200, security.status(), headers);
    if (req.method === "GET" && req.url === "/v1/readiness") {
      if (!readiness)
        return json(res, 503, { error: "readiness-disabled" }, headers);
      try {
        const decision = await readiness.evaluate();
        return json(
          res,
          decision.state === "HALTED" ? 503 : 200,
          decision,
          headers,
        );
      } catch (error) {
        return json(
          res,
          error.status || 503,
          { error: error.message },
          headers,
        );
      }
    }
    if (req.method === "GET" && req.url === "/v1/regime/status")
      return json(
        res,
        regime ? 200 : 503,
        regime ? regime.status() : { error: "regime-disabled" },
        headers,
      );
    if (
      req.method === "POST" &&
      /^\/v1\/regime\/[A-Z0-9]+\/analyze$/.test(req.url)
    ) {
      if (!regime || !dataService)
        return json(res, 503, { error: "regime-disabled" }, headers);
      try {
        const asset = req.url.split("/")[3],
          spec = desks.assets[asset];
        if (!spec) return json(res, 404, { error: "unknown-asset" }, headers);
        const supplied = await body(req),
          context =
            supplied.context ||
            (await dataService.analysisContext(spec.product)),
          result = regime.analyze({
            asset,
            candles: context.candles,
            book: context.book,
          });
        return json(res, 200, result, headers);
      } catch (e) {
        return json(res, e.status || 422, { error: e.message }, headers);
      }
    }
    if (req.method === "GET" && req.url === "/v1/data/health")
      return json(
        res,
        200,
        dataService ? dataService.health() : { status: "disabled" },
        headers,
      );
    if (req.method === "GET" && req.url === "/v1/data/storage")
      return json(
        res,
        dataService ? 200 : 503,
        dataService
          ? await dataService.storage()
          : { error: "data-service-disabled" },
        headers,
      );
    if (req.method === "POST" && req.url === "/v1/data/backfill/plan") {
      if (!dataService)
        return json(res, 503, { error: "data-service-disabled" }, headers);
      try {
        return json(
          res,
          200,
          await dataService.planBackfill(await body(req)),
          headers,
        );
      } catch (e) {
        return json(res, e.status || 422, { error: e.message }, headers);
      }
    }
    if (req.method === "POST" && req.url === "/v1/data/backfill/execute") {
      if (!dataService)
        return json(res, 503, { error: "data-service-disabled" }, headers);
      try {
        fourEyes(req);
        const input = await body(req);
        return json(
          res,
          200,
          await dataService.executeBackfill(
            input.plan,
            input.approvedBy || req.auth.sub,
          ),
          headers,
        );
      } catch (e) {
        return json(res, e.status || 422, { error: e.message }, headers);
      }
    }
    if (req.method === "GET" && req.url === "/v1/desks")
      return json(res, 200, { desks: desks.list() }, headers);
    if (req.method === "GET" && req.url === "/v1/pipeline/status")
      return json(
        res,
        pipeline ? 200 : 503,
        pipeline ? pipeline.status() : { error: "pipeline-disabled" },
        headers,
      );
    if (req.method === "GET" && req.url === "/v1/risk/status")
      return json(
        res,
        pipeline ? 200 : 503,
        pipeline
          ? {
              ...pipeline.risk.status(),
              portfolio: pipeline.ledger.snapshot(pipeline.marks()),
              paperOnly: true,
            }
          : { error: "risk-disabled" },
        headers,
      );
    if (req.method === "POST" && req.url === "/v1/risk/preview") {
      if (!pipeline) return json(res, 503, { error: "risk-disabled" }, headers);
      try {
        const x = await body(req),
          proposal = {
            id: String(x.proposal?.id || `preview-${Date.now()}`),
            symbol: String(x.proposal?.symbol || "BTC-USD"),
            qty: Number(x.proposal?.qty || 0),
            notional: Number(x.proposal?.notional || 0),
            confidence: Number(x.proposal?.confidence || 0),
            maxWeight: Number(x.proposal?.maxWeight || 0.35),
          },
          context = {
            ...x.context,
            equity: Number(x.context?.equity || 100000),
            dataStatus: String(x.context?.dataStatus || "healthy"),
            returns: Array.isArray(x.context?.returns)
              ? x.context.returns.map(Number).filter(Number.isFinite)
              : [],
          };
        return json(
          res,
          200,
          pipeline.risk.evaluate(proposal, context),
          headers,
        );
      } catch (e) {
        return json(res, 422, { error: e.message }, headers);
      }
    }
    if (req.method === "GET" && req.url === "/v1/dashboard/overview")
      return json(
        res,
        dashboard ? 200 : 503,
        dashboard
          ? await dashboard.overview()
          : { error: "dashboard-disabled" },
        headers,
      );
    if (req.method === "GET" && req.url.startsWith("/v1/dashboard/runs?")) {
      if (!dashboard)
        return json(res, 503, { error: "dashboard-disabled" }, headers);
      const u = new URL(req.url, "http://localhost");
      return json(
        res,
        200,
        {
          runs: await dashboard.runs({
            asset: u.searchParams.get("asset"),
            status: u.searchParams.get("status"),
            limit: u.searchParams.get("limit"),
          }),
        },
        headers,
      );
    }
    if (
      req.method === "GET" &&
      req.url.startsWith("/v1/dashboard/export.csv")
    ) {
      if (!dashboard)
        return json(res, 503, { error: "dashboard-disabled" }, headers);
      const u = new URL(req.url, "http://localhost"),
        csv = await dashboard.csv({
          asset: u.searchParams.get("asset"),
          status: u.searchParams.get("status"),
        });
      return textResponse(res, 200, csv, "text/csv; charset=utf-8", {
        ...headers,
        "content-disposition": 'attachment; filename="qcf-runs.csv"',
      });
    }
    if (req.method === "GET" && req.url === "/v1/research/catalog")
      return json(
        res,
        research ? 200 : 503,
        research ? research.catalog() : { error: "research-disabled" },
        headers,
      );
    if (req.method === "POST" && req.url === "/v1/research/evaluate") {
      if (!research)
        return json(res, 503, { error: "research-disabled" }, headers);
      try {
        return json(
          res,
          200,
          await research.evaluate(await body(req)),
          headers,
        );
      } catch (e) {
        return json(res, e.status || 422, { error: e.message }, headers);
      }
    }
    if (
      req.method === "POST" &&
      req.url === "/v1/research/consensus-calibration"
    ) {
      if (!research)
        return json(res, 503, { error: "research-disabled" }, headers);
      try {
        return json(
          res,
          200,
          await research.calibrateConsensus(await body(req)),
          headers,
        );
      } catch (e) {
        return json(res, e.status || 422, { error: e.message }, headers);
      }
    }
    if (req.method === "POST" && req.url === "/v1/research/promote") {
      if (!research)
        return json(res, 503, { error: "research-disabled" }, headers);
      try {
        fourEyes(req);
        const x = await body(req);
        return json(
          res,
          200,
          await research.promote(x.candidateId, x.approvedBy),
          headers,
        );
      } catch (e) {
        return json(res, e.status || 422, { error: e.message }, headers);
      }
    }
    if (req.method === "GET" && req.url === "/v1/portfolio/status")
      return json(
        res,
        portfolio ? 200 : 503,
        portfolio ? portfolio.status() : { error: "portfolio-disabled" },
        headers,
      );
    if (req.method === "POST" && req.url === "/v1/portfolio/plan") {
      if (!portfolio)
        return json(res, 503, { error: "portfolio-disabled" }, headers);
      try {
        return json(res, 200, await portfolio.plan(await body(req)), headers);
      } catch (e) {
        return json(res, e.status || 422, { error: e.message }, headers);
      }
    }
    if (req.method === "GET" && req.url === "/v1/risk/scenarios")
      return json(
        res,
        portfolio ? 200 : 503,
        portfolio ? portfolio.scenarios() : { error: "portfolio-disabled" },
        headers,
      );
    if (req.method === "GET" && req.url === "/v1/risk/stress/status")
      return json(
        res,
        portfolio ? 200 : 503,
        portfolio ? portfolio.stressStatus() : { error: "portfolio-disabled" },
        headers,
      );
    if (req.method === "POST" && req.url === "/v1/risk/stress") {
      if (!portfolio)
        return json(res, 503, { error: "portfolio-disabled" }, headers);
      try {
        return json(res, 200, await portfolio.stress(await body(req)), headers);
      } catch (e) {
        return json(res, e.status || 422, { error: e.message }, headers);
      }
    }
    if (req.method === "POST" && req.url === "/v1/risk/reverse-stress") {
      if (!portfolio)
        return json(res, 503, { error: "portfolio-disabled" }, headers);
      try {
        return json(
          res,
          200,
          await portfolio.reverseStress(await body(req)),
          headers,
        );
      } catch (e) {
        return json(res, e.status || 422, { error: e.message }, headers);
      }
    }
    if (req.method === "GET" && req.url === "/v1/governance/status")
      return json(
        res,
        governance ? 200 : 503,
        governance ? governance.status() : { error: "governance-disabled" },
        headers,
      );
    if (req.method === "GET" && req.url === "/v1/governance/calibration")
      return json(
        res,
        calibrationGovernance ? 200 : 503,
        calibrationGovernance
          ? calibrationGovernance.status()
          : { error: "calibration-governance-disabled" },
        headers,
      );
    if (
      req.method === "POST" &&
      req.url === "/v1/governance/calibration/datasets"
    ) {
      if (!calibrationGovernance)
        return json(
          res,
          503,
          { error: "calibration-governance-disabled" },
          headers,
        );
      try {
        return json(
          res,
          200,
          await calibrationGovernance.registerDataset(
            await body(req),
            req.auth.sub,
          ),
          headers,
        );
      } catch (e) {
        return json(res, e.status || 422, { error: e.message }, headers);
      }
    }
    if (
      req.method === "POST" &&
      req.url === "/v1/governance/calibration/evaluate"
    ) {
      if (!calibrationGovernance)
        return json(
          res,
          503,
          { error: "calibration-governance-disabled" },
          headers,
        );
      try {
        return json(
          res,
          200,
          await calibrationGovernance.evaluate(await body(req), req.auth.sub),
          headers,
        );
      } catch (e) {
        return json(res, e.status || 422, { error: e.message }, headers);
      }
    }
    if (
      req.method === "POST" &&
      req.url === "/v1/governance/calibration/approve-experiment"
    ) {
      if (!calibrationGovernance)
        return json(
          res,
          503,
          { error: "calibration-governance-disabled" },
          headers,
        );
      try {
        const approvals = fourEyes(req) || {
            primary: req.auth.sub,
            secondary: String(req.headers["x-second-approver"] || ""),
          },
          input = await body(req);
        return json(
          res,
          200,
          await calibrationGovernance.approveExperiment(
            input,
            approvals,
            req.auth.sub,
          ),
          headers,
        );
      } catch (e) {
        return json(res, e.status || 422, { error: e.message }, headers);
      }
    }
    if (req.method === "GET" && req.url === "/v1/governance/models")
      return json(
        res,
        governance ? 200 : 503,
        governance ? governance.list() : { error: "governance-disabled" },
        headers,
      );
    if (req.method === "POST" && req.url === "/v1/governance/register") {
      if (!governance)
        return json(res, 503, { error: "governance-disabled" }, headers);
      try {
        return json(
          res,
          200,
          await governance.register(await body(req), req.auth.sub),
          headers,
        );
      } catch (e) {
        return json(res, e.status || 422, { error: e.message }, headers);
      }
    }
    if (req.method === "POST" && req.url === "/v1/governance/evaluate") {
      if (!governance)
        return json(res, 503, { error: "governance-disabled" }, headers);
      try {
        return json(
          res,
          200,
          await governance.evaluate(await body(req), req.auth.sub),
          headers,
        );
      } catch (e) {
        return json(res, e.status || 422, { error: e.message }, headers);
      }
    }
    if (req.method === "POST" && req.url === "/v1/governance/promote") {
      if (!governance)
        return json(res, 503, { error: "governance-disabled" }, headers);
      try {
        const approvals = fourEyes(req) || {
            primary: req.auth.sub,
            secondary: String(req.headers["x-second-approver"] || ""),
          },
          input = await body(req);
        return json(
          res,
          200,
          await governance.promote(input, approvals),
          headers,
        );
      } catch (e) {
        return json(res, e.status || 422, { error: e.message }, headers);
      }
    }
    if (req.method === "GET" && req.url === "/v1/governance/experiments")
      return json(
        res,
        experiments ? 200 : 503,
        experiments ? experiments.list() : { error: "experiments-disabled" },
        headers,
      );
    if (
      req.method === "POST" &&
      req.url === "/v1/governance/experiments/start"
    ) {
      if (!experiments)
        return json(res, 503, { error: "experiments-disabled" }, headers);
      try {
        return json(
          res,
          200,
          await experiments.start(await body(req), req.auth.sub),
          headers,
        );
      } catch (e) {
        return json(res, e.status || 422, { error: e.message }, headers);
      }
    }
    if (
      req.method === "POST" &&
      req.url === "/v1/governance/experiments/assign"
    ) {
      if (!experiments)
        return json(res, 503, { error: "experiments-disabled" }, headers);
      try {
        const input = await body(req);
        return json(
          res,
          200,
          experiments.assign(input.experimentId, input.requestId),
          headers,
        );
      } catch (e) {
        return json(res, e.status || 422, { error: e.message }, headers);
      }
    }
    if (
      req.method === "POST" &&
      req.url === "/v1/governance/experiments/observe"
    ) {
      if (!experiments)
        return json(res, 503, { error: "experiments-disabled" }, headers);
      try {
        const input = await body(req);
        return json(
          res,
          200,
          await experiments.observe(input.experimentId, input),
          headers,
        );
      } catch (e) {
        return json(res, e.status || 422, { error: e.message }, headers);
      }
    }
    if (
      req.method === "POST" &&
      req.url === "/v1/governance/experiments/forecast"
    ) {
      if (!experiments)
        return json(res, 503, { error: "experiments-disabled" }, headers);
      try {
        const input = await body(req);
        return json(
          res,
          200,
          await experiments.observeForecast(input.experimentId, input),
          headers,
        );
      } catch (e) {
        return json(res, e.status || 422, { error: e.message }, headers);
      }
    }
    if (
      req.method === "POST" &&
      req.url === "/v1/governance/experiments/label"
    ) {
      if (!experiments)
        return json(res, 503, { error: "experiments-disabled" }, headers);
      try {
        const input = await body(req);
        input.secondApprover = String(req.headers["x-second-approver"] || "");
        return json(
          res,
          200,
          await experiments.labelForecast(
            input.experimentId,
            input,
            req.auth.sub,
          ),
          headers,
        );
      } catch (e) {
        return json(res, e.status || 422, { error: e.message }, headers);
      }
    }
    if (
      req.method === "POST" &&
      req.url === "/v1/governance/experiments/censor"
    ) {
      if (!experiments)
        return json(res, 503, { error: "experiments-disabled" }, headers);
      try {
        const input = await body(req);
        return json(
          res,
          200,
          await experiments.censorForecast(
            input.experimentId,
            input,
            req.auth.sub,
          ),
          headers,
        );
      } catch (e) {
        return json(res, e.status || 422, { error: e.message }, headers);
      }
    }
    if (
      req.method === "POST" &&
      req.url === "/v1/governance/experiments/stop"
    ) {
      if (!experiments)
        return json(res, 503, { error: "experiments-disabled" }, headers);
      try {
        const input = await body(req);
        return json(
          res,
          200,
          await experiments.stop(
            input.experimentId,
            req.auth.sub,
            input.reason,
          ),
          headers,
        );
      } catch (e) {
        return json(res, e.status || 422, { error: e.message }, headers);
      }
    }
    if (
      req.method === "POST" &&
      req.url === "/v1/governance/experiments/graduate"
    ) {
      if (!experiments)
        return json(res, 503, { error: "experiments-disabled" }, headers);
      try {
        const approvals = fourEyes(req) || {
            primary: req.auth.sub,
            secondary: String(req.headers["x-second-approver"] || ""),
          },
          input = await body(req);
        return json(
          res,
          200,
          await experiments.graduate(
            input.experimentId,
            req.auth.sub,
            input.reason,
            approvals,
          ),
          headers,
        );
      } catch (e) {
        return json(res, e.status || 422, { error: e.message }, headers);
      }
    }
    if (req.method === "GET" && req.url === "/v1/governance/ai-evaluation")
      return json(
        res,
        aiEvaluation ? 200 : 503,
        aiEvaluation
          ? aiEvaluation.status()
          : { error: "ai-evaluation-disabled" },
        headers,
      );
    if (
      req.method === "POST" &&
      req.url === "/v1/governance/ai-evaluation/datasets"
    ) {
      if (!aiEvaluation)
        return json(res, 503, { error: "ai-evaluation-disabled" }, headers);
      try {
        return json(
          res,
          200,
          await aiEvaluation.registerDataset(await body(req), req.auth.sub),
          headers,
        );
      } catch (e) {
        return json(res, e.status || 422, { error: e.message }, headers);
      }
    }
    if (
      req.method === "POST" &&
      req.url === "/v1/governance/ai-evaluation/run"
    ) {
      if (!aiEvaluation)
        return json(res, 503, { error: "ai-evaluation-disabled" }, headers);
      try {
        return json(
          res,
          200,
          await aiEvaluation.run(await body(req), req.auth.sub),
          headers,
        );
      } catch (e) {
        return json(res, e.status || 422, { error: e.message }, headers);
      }
    }
    if (req.method === "GET" && req.url === "/v1/execution/status")
      return json(
        res,
        execution ? 200 : 503,
        execution ? execution.status() : { error: "execution-disabled" },
        headers,
      );
    if (req.method === "POST" && req.url === "/v1/execution/submit") {
      if (!execution)
        return json(res, 503, { error: "execution-disabled" }, headers);
      try {
        if (readiness) {
          const decision = await readiness.evaluate();
          if (!decision.capabilities.paperExecution)
            return json(
              res,
              409,
              { error: "operational-readiness-blocked", readiness: decision },
              headers,
            );
        }
        fourEyes(req);
        return json(res, 200, await execution.submit(await body(req)), headers);
      } catch (e) {
        return json(res, e.status || 422, { error: e.message }, headers);
      }
    }
    if (req.method === "POST" && req.url === "/v1/execution/drain") {
      if (!execution)
        return json(res, 503, { error: "execution-disabled" }, headers);
      try {
        if (readiness) {
          const decision = await readiness.evaluate();
          if (!decision.capabilities.paperExecution)
            return json(
              res,
              409,
              { error: "operational-readiness-blocked", readiness: decision },
              headers,
            );
        }
        return json(res, 200, await execution.drain(await body(req)), headers);
      } catch (e) {
        return json(res, e.status || 422, { error: e.message }, headers);
      }
    }
    if (req.method === "GET" && req.url === "/v1/sre/status")
      return json(
        res,
        sre ? 200 : 503,
        sre ? await sre.snapshot() : { error: "sre-disabled" },
        headers,
      );
    if (req.method === "POST" && req.url === "/v1/sre/backup") {
      if (!sre) return json(res, 503, { error: "sre-disabled" }, headers);
      const x = await body(req);
      return json(
        res,
        200,
        await sre.backup(String(x.actor || "system")),
        headers,
      );
    }
    if (
      req.method === "POST" &&
      /^\/v1\/sre\/incidents\/[0-9a-f-]+\/ack$/.test(req.url)
    ) {
      if (!sre) return json(res, 503, { error: "sre-disabled" }, headers);
      try {
        const x = await body(req),
          id = req.url.split("/")[4];
        return json(res, 200, sre.acknowledge(id, x.actor), headers);
      } catch (e) {
        return json(res, e.status || 422, { error: e.message }, headers);
      }
    }
    if (
      req.method === "GET" &&
      /^\/v1\/pipeline\/runs\/[A-Za-z0-9:_-]+$/.test(req.url)
    ) {
      if (!pipeline)
        return json(res, 503, { error: "pipeline-disabled" }, headers);
      const run = pipeline.get(req.url.split("/").pop());
      return json(
        res,
        run ? 200 : 404,
        run || { error: "run-not-found" },
        headers,
      );
    }
    if (
      req.method === "POST" &&
      /^\/v1\/pipeline\/[A-Z0-9]+\/run$/.test(req.url)
    ) {
      if (!pipeline)
        return json(res, 503, { error: "pipeline-disabled" }, headers);
      try {
        const asset = req.url.split("/")[3],
          options = await body(req),
          run = await pipeline.run(asset, options);
        return json(res, 200, run, headers);
      } catch (e) {
        return json(res, e.status || 500, { error: e.message }, headers);
      }
    }
    if (req.method === "POST" && req.url === "/v1/pipeline/halt") {
      if (!pipeline)
        return json(res, 503, { error: "pipeline-disabled" }, headers);
      const x = await body(req);
      const status = pipeline.halt
        ? await pipeline.halt(
            String(x.reason || "manual"),
            req.auth?.sub || "system",
          )
        : (pipeline.risk.halt(String(x.reason || "manual")), pipeline.status());
      return json(res, 200, status, headers);
    }
    if (req.method === "POST" && req.url === "/v1/pipeline/resume") {
      if (!pipeline)
        return json(res, 503, { error: "pipeline-disabled" }, headers);
      try {
        fourEyes(req);
        const status = pipeline.resume
          ? await pipeline.resume(req.auth?.sub || "system")
          : (pipeline.risk.resume(), pipeline.status());
        return json(res, 200, status, headers);
      } catch (e) {
        return json(res, e.status || 403, { error: e.message }, headers);
      }
    }
    if (
      req.method === "POST" &&
      /^\/v1\/desks\/[A-Z0-9]+\/analyze$/.test(req.url)
    ) {
      if (!dataService)
        return json(res, 503, { error: "data-service-disabled" }, headers);
      const asset = req.url.split("/")[3];
      try {
        const spec = desks.assets[asset];
        if (!spec) return json(res, 404, { error: "unknown-asset" }, headers);
        const supplied = await body(req),
          context =
            supplied?.context ||
            (await dataService.analysisContext(spec.product)),
          report = desks.analyze(asset, context);
        await dataService.record?.(`analysis.${asset}`, report);
        publish({ type: "desk.analysis", report });
        return json(res, 200, report, headers);
      } catch (e) {
        metrics.errors++;
        return json(res, e.status || 500, { error: e.message }, headers);
      }
    }
    if (req.method === "GET" && req.url.startsWith("/v1/data/snapshot/")) {
      const product = decodeURIComponent(req.url.split("/").pop());
      return json(
        res,
        dataService ? 200 : 503,
        dataService
          ? dataService.snapshot(product)
          : { error: "data-service-disabled" },
        headers,
      );
    }
    if (req.method === "GET" && req.url.startsWith("/v1/data/replay?")) {
      if (!dataService)
        return json(res, 503, { error: "data-service-disabled" }, headers);
      const u = new URL(req.url, "http://localhost"),
        stream = u.searchParams.get("stream");
      if (!stream) return json(res, 422, { error: "stream-required" }, headers);
      try {
        return json(
          res,
          200,
          {
            stream,
            events: await dataService.replay(stream, {
              from: Number(u.searchParams.get("from") || 0),
              to: Number(u.searchParams.get("to") || Infinity),
              limit: Math.min(
                10000,
                Number(u.searchParams.get("limit") || 1000),
              ),
            }),
          },
          headers,
        );
      } catch (e) {
        return json(res, 500, { error: "replay-failed" }, headers);
      }
    }
    if (req.method === "POST" && req.url === "/v1/agents/execute") {
      try {
        const payload = await body(req),
          errors = validateRequest(payload);
        if (errors.length)
          return json(
            res,
            422,
            { error: "invalid-request", fields: errors },
            headers,
          );
        const llmStarted = Date.now(),
          external = await executeLLM(payload, options.llm || {}),
          result = external
            ? { ...external, latency_ms: Date.now() - llmStarted }
            : execute(payload.agent_id, payload.input);
        metrics.executions++;
        publish({
          type: "agent.result",
          request_id: payload.request_id,
          result,
        });
        return json(res, 200, result, headers);
      } catch (e) {
        metrics.errors++;
        return json(
          res,
          e.status || 502,
          {
            error:
              e.message === "payload-too-large"
                ? "payload-too-large"
                : "gateway-error",
            detail:
              process.env.NODE_ENV === "development" ? e.message : undefined,
          },
          headers,
        );
      }
    }
    return json(res, 404, { error: "not-found" }, headers);
  };
  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
      metrics.errors++;
      if (res.headersSent) return res.destroy(error);
      return json(
        res,
        error.status || 500,
        {
          error: error.status ? error.message : "internal-server-error",
          detail:
            process.env.NODE_ENV === "development" ? error.message : undefined,
        },
        cors(req.headers.origin, allowedOrigin),
      );
    });
  });
  server.on("upgrade", (req, socket) => {
    if (req.url !== "/v1/stream")
      return rejectUpgrade(socket, 404, "stream-not-found");
    const originHeaders = cors(req.headers.origin, allowedOrigin);
    if (req.headers.origin && !originHeaders["access-control-allow-origin"])
      return rejectUpgrade(socket, 403, "origin-denied");
    const rate = security.consume(req.socket.remoteAddress || "unknown");
    if (!rate.allowed) return rejectUpgrade(socket, 429, "rate-limit-exceeded");
    try {
      const claims = security.authenticate(req.headers.authorization);
      security.authorize(claims, "viewer");
    } catch (error) {
      return rejectUpgrade(socket, error.status || 401, error.message);
    }
    if (clients.size >= MAX_CLIENTS)
      return rejectUpgrade(socket, 503, "stream-saturated");
    const key = req.headers["sec-websocket-key"];
    if (!key) return rejectUpgrade(socket, 400, "websocket-key-required");
    const accept = crypto
      .createHash("sha1")
      .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
      .digest("base64");
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    clients.add(socket);
    socket.write(
      wsFrame(
        JSON.stringify({ type: "stream.ready", at: new Date().toISOString() }),
      ),
    );
    socket.on("close", () => clients.delete(socket));
    socket.on("error", () => clients.delete(socket));
  });
  return {
    server,
    metrics,
    clients,
    publish,
    setDataService(value) {
      dataService = value;
    },
    setPipeline(value) {
      pipeline = value;
    },
    setDashboard(value) {
      dashboard = value;
    },
    setResearch(value) {
      research = value;
    },
    setPortfolio(value) {
      portfolio = value;
    },
    setExecution(value) {
      execution = value;
    },
    setSre(value) {
      sre = value;
    },
    setRegime(value) {
      regime = value;
    },
    setGovernance(value) {
      governance = value;
    },
    setExperiments(value) {
      experiments = value;
    },
    setAiEvaluation(value) {
      aiEvaluation = value;
    },
    setCalibrationGovernance(value) {
      calibrationGovernance = value;
    },
    setReadiness(value) {
      readiness = value;
    },
    listen(port = Number(process.env.PORT || 8787), host = "127.0.0.1") {
      return new Promise((resolve) =>
        server.listen(port, host, () => resolve(server.address())),
      );
    },
    close() {
      for (const s of clients) s.destroy();
      return new Promise((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      );
    },
  };
}
module.exports = { createGateway, validateRequest, wsFrame };
