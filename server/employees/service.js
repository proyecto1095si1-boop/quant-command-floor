"use strict";

const crypto = require("node:crypto"),
  { EMPLOYEE_REGISTRY } = require("./registry.js"),
  { CARD_LIMITS, assertEmployeeCard } = require("./contract.js"),
  { specificationFor } = require("./specifications.js"),
  { narrate } = require("../../dist/agent-profiles.js");
const SENSITIVE = /key|secret|token|password|authorization|cookie/i,
  ASSETS = ["BTC", "ETH", "SOL", "BNB"],
  own = (value) => value && typeof value === "object" && !Array.isArray(value),
  atMs = (value) =>
    typeof value === "number" ? value : Date.parse(value || ""),
  signalValue = (raw) =>
    [raw?.signal, raw?.price, raw?.queue, raw?.equity, raw?.qty].find(
      Number.isFinite,
    ) ?? null;

class EmployeeCards {
  constructor({
    sources = () => ({}),
    clock = () => Date.now(),
    secrets = [],
  } = {}) {
    this.sources = sources;
    this.clock = clock;
    this.registry = EMPLOYEE_REGISTRY;
    this.rows = new Map();
    this.sequence = 0;
    this.sourceErrors = new Map();
    this.secrets = [
      ...secrets,
      ...[
        "FINNHUB_API_KEY",
        "FRED_API_KEY",
        "LLM_API_KEY",
        "LLM_SECONDARY_API_KEY",
        "AUTH_SECRET",
      ].map((key) => process.env[key]),
    ].filter((value) => typeof value === "string" && value.length >= 4);
  }
  clean(value, depth = 0, budget = { left: 160 }) {
    if (--budget.left < 0 || depth > 5) return "[acotado]";
    if (typeof value === "string") {
      let text = value;
      for (const secret of this.secrets)
        text = text.split(secret).join("[redactado]");
      return text
        .replace(
          /((?:api[_-]?key|token|secret|authorization|password)\s*[=:]\s*)[^\s&,;]+/gi,
          "$1[redactado]",
        )
        .slice(0, 500);
    }
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (value == null || typeof value === "boolean") return value ?? null;
    if (Array.isArray(value))
      return value
        .slice(0, 16)
        .map((item) => this.clean(item, depth + 1, budget));
    if (own(value))
      return Object.fromEntries(
        Object.entries(value)
          .slice(0, 32)
          .filter(([key]) => !SENSITIVE.test(key))
          .map(([key, item]) => [
            key.slice(0, 80),
            this.clean(item, depth + 1, budget),
          ]),
      );
    return null;
  }
  input(
    name,
    source,
    value,
    at,
    maxAgeMs = CARD_LIMITS.marketAgeMs,
    error = null,
    missing = false,
  ) {
    const timestamp = atMs(at),
      ageMs =
        Number.isFinite(timestamp) && timestamp <= this.clock()
          ? this.clock() - timestamp
          : null;
    return {
      name,
      source,
      state: error
        ? "error"
        : missing || value == null || ageMs === null
          ? "missing"
          : ageMs > maxAgeMs
            ? "stale"
            : "live",
      ageMs,
      maxAgeMs,
      lastValue: this.clean(value),
      observedAt: Number.isFinite(timestamp)
        ? new Date(timestamp).toISOString()
        : null,
      error: error ? this.clean(error) : null,
    };
  }
  observe(
    id,
    { asset = null, at, source, raw = {}, inputs = [], error = null },
  ) {
    if (
      !this.registry.some((row) => row.id === id) ||
      (asset !== null && !ASSETS.includes(asset))
    )
      return false;
    // Keep the fields needed to explain a plan before the generic privacy/size
    // budget. Large diagnostics must not crowd out real rebalance numbers.
    if (id === "portfolio.allocation" || id === "portfolio.rebalance")
      raw = {
        id: raw.id,
        createdAt: raw.createdAt,
        method: raw.method,
        observations: raw.observations,
        equity: raw.equity,
        cashTarget: raw.cashTarget,
        rebalancing: raw.rebalancing,
        allocations: Array.isArray(raw.allocations)
          ? raw.allocations.slice(0, 4).map((row) => ({
              asset: row.asset,
              currentWeight: row.currentWeight,
              targetWeight: row.targetWeight,
              tradeWeight: row.tradeWeight,
              tradeNotional: row.tradeNotional,
            }))
          : [],
        approval: raw.approval,
      };
    const time = atMs(at),
      validTime = Number.isFinite(time) && time <= this.clock(),
      receivedAt = this.clock(),
      body = this.clean(raw),
      packed = JSON.stringify(body),
      safeRaw =
        Buffer.byteLength(packed) <= CARD_LIMITS.rawBytes
          ? body
          : { truncated: true, preview: packed.slice(0, 1500) },
      key = `${id}:${asset || "global"}`,
      observation = {
        asset,
        at: validTime ? time : receivedAt,
        producedAt: validTime ? time : null,
        source: this.clean(source || "sin fuente identificada"),
        raw: own(safeRaw) ? safeRaw : { value: safeRaw },
        inputs: this.clean(inputs).slice(0, CARD_LIMITS.inputs),
        error: error ? this.clean(error) : null,
      };
    const signature = crypto
        .createHash("sha256")
        .update(JSON.stringify({ ...observation, at: validTime ? time : null }))
        .digest("hex"),
      previous = this.rows.get(key) || [];
    if (
      previous[0]?.signature === signature ||
      previous[0]?.at > observation.at
    )
      return false;
    previous.unshift({ ...observation, signature, sequence: ++this.sequence });
    this.rows.set(key, previous.slice(0, CARD_LIMITS.history));
    return true;
  }
  ingest(event) {
    const changed = new Set(),
      note = (id, observation) => {
        if (this.observe(id, observation)) changed.add(id);
      };
    if (event.type === "execution.queued" && event.result) {
      for (const id of ["execution.queue", "execution.router"])
        note(id, {
          at: event.result.parents?.at(-1)?.createdAt,
          source: "ExecutionService.submit",
          raw: event.result,
          inputs: [
            {
              name: "Plan de ejecución paper",
              source: "execution.queued",
              value: event.result.queued,
              at: event.result.parents?.at(-1)?.createdAt,
            },
          ],
        });
    }
    if (event.type === "execution.reconciled" && event.reconciliation) {
      const result = event.reconciliation;
      note("execution.broker", {
        at: result.at,
        source: "ExecutionService.drain",
        raw: result,
        inputs: [
          {
            name: "Órdenes procesadas",
            source: "execution.reconciled",
            value: result.processed,
            at: result.at,
          },
        ],
      });
    }
    if (event.type === "market.snapshot" || event.type === "market.ticker") {
      const snapshot =
          event.type === "market.ticker"
            ? { ticker: event.data, symbol: event.data?.symbol }
            : event,
        ticker = snapshot.ticker,
        asset = String(snapshot.symbol || "").split("-")[0];
      if (ticker && ASSETS.includes(asset)) {
        const observation = {
          asset,
          at: ticker.receivedAt,
          source: ticker.source || "market.snapshot",
          raw: {
            price: ticker.price,
            bid: ticker.bid,
            ask: ticker.ask,
            bookLevels: {
              bids: snapshot.book?.bids?.length ?? null,
              asks: snapshot.book?.asks?.length ?? null,
            },
          },
          inputs: [
            {
              name: "Cotización",
              source: ticker.source || "sin fuente identificada",
              value: ticker.price,
              at: ticker.receivedAt,
            },
          ],
        };
        for (const id of ["intake.data", "sre.feeds"]) note(id, observation);
      }
    }
    if (event.type === "desk.analysis" && event.report) {
      const report = event.report,
        asset = report.asset,
        base = {
          asset,
          at: report.at,
          source: "DeskRegistry.analyze",
          inputs: Object.entries(report.inputSummary || {}).map(
            ([name, value]) => ({
              name,
              value,
              source: `desk.analysis.inputSummary.${name}`,
              at: report.at,
              missing:
                ["candles", "trades", "bids", "asks"].includes(name) &&
                value === 0,
            }),
          ),
        };
      note(`desk.${String(asset).toLowerCase()}`, {
        ...base,
        raw: {
          action: report.action,
          signal: report.signal,
          confidence: report.confidence,
          agreement: report.agreement,
          blockers: report.blockers,
          consensus: report.consensus,
        },
      });
      note("consensus.signal", {
        ...base,
        raw: {
          ...report.consensus,
          action: report.action,
          signal: report.signal,
          confidence: report.confidence,
        },
      });
      for (const result of report.agents || []) {
        const row = this.registry.find(
          (employee) =>
            employee.agent === result.agent || employee.label === result.agent,
        );
        if (row) note(row.id, { ...base, raw: result });
      }
    }
    if (event.type === "agent.result" && event.result) {
      const row = this.registry.find(
        (employee) =>
          employee.agent === event.result.agent_id ||
          employee.label === event.result.agent_id,
      );
      if (row)
        note(row.id, {
          asset: event.asset || null,
          at: event.result.at,
          source: "agent.result",
          raw: event.result,
          inputs: [],
        });
    }
    if (event.type === "pipeline.stage" && event.stage) {
      const { name, at, payload = {}, status } = event.stage,
        base = {
          asset: event.asset,
          at,
          source: `TradingPipeline.${name}`,
          raw: payload,
          inputs: [
            {
              name: "Etapa del pipeline",
              value: status,
              source: `pipeline.stage.${name}`,
              at,
            },
          ],
        };
      const map = {
        intake: ["intake.data"],
        signal: ["consensus.signal"],
        proposal: ["risk.size"],
        risk: ["risk.manager", "risk.drawdown", "risk.exposure"],
        execution: ["execution.queue", "execution.broker"],
        reconcile: ["portfolio.manager"],
        error: ["sre.anomaly"],
      };
      for (const id of map[name] || [])
        note(id, {
          ...base,
          raw: id === "risk.size" ? payload.sizing || {} : payload,
        });
    }
    return [...changed];
  }
  pull() {
    const sources = this.sources(),
      now = this.clock();
    const plan = sources.portfolio?.plans?.at(-1);
    if (plan)
      for (const id of ["portfolio.allocation", "portfolio.rebalance"])
        this.observe(id, {
          at: plan.createdAt,
          source: "PortfolioService.plans",
          raw: plan,
          inputs: [
            {
              name: "Retornos utilizados en el plan",
              source: "PortfolioService.plan.observations",
              value: plan.observations,
              at: plan.createdAt,
            },
          ],
        });
    const report =
      sources.research?.reports instanceof Map
        ? [...sources.research.reports.values()].at(-1)
        : null;
    if (report)
      for (const id of ["research.backtest", "research.walkforward"])
        this.observe(id, {
          at: report.createdAt,
          source: "ResearchLab.reports",
          raw: report,
          inputs: [
            {
              name: "Observaciones del laboratorio; procedencia de retornos no declarada en el informe",
              source: "ResearchLab.evaluate.observations",
              value: report.observations,
              at: report.createdAt,
            },
          ],
        });
    for (const asset of ASSETS) {
      const product = `${asset}-USD`;
      try {
        const snapshot = sources.dataService?.snapshot?.(product);
        this.sourceErrors.delete(`desk.${asset.toLowerCase()}:${asset}`);
        if (snapshot?.ticker) {
          this.ingest({ type: "market.snapshot", ...snapshot });
          if (
            !(this.rows.get(`desk.${asset.toLowerCase()}:${asset}`) || []).some(
              (row) => row.source === "DeskRegistry.analyze",
            )
          )
            this.observe(`desk.${asset.toLowerCase()}`, {
              asset,
              at: snapshot.ticker.receivedAt,
              source: snapshot.ticker.source || "Data Plane",
              raw: { price: snapshot.ticker.price, stage: "market_only" },
              inputs: [
                {
                  name: "Cotización",
                  source: snapshot.ticker.source || "Data Plane",
                  value: snapshot.ticker.price,
                  at: snapshot.ticker.receivedAt,
                },
              ],
            });
        }
      } catch (error) {
        this.sourceErrors.set(`desk.${asset.toLowerCase()}:${asset}`, {
          at: now,
          error: this.clean(error.message),
        });
      }
      try {
        const intel = sources.intelligenceDag?.snapshot?.(asset);
        if (intel) {
          const news = intel.nodes?.find((node) => node.id === "news"),
            maxAgeMs = sources.intelligenceDag.maxSnapshotAgeMs;
          for (const [id, raw] of [
            ["intake.news", news],
            ["intake.intel", intel.consensus],
          ])
            if (raw)
              this.observe(id, {
                asset,
                at: intel.asOf,
                source: "IntelligenceDag.snapshot",
                raw,
                inputs: (intel.provenance || [])
                  .filter(
                    (row) => id !== "intake.news" || row.operation === "news",
                  )
                  .map((row) => ({
                    name: row.operation || "Fuente de inteligencia",
                    source: row.provider || "sin proveedor identificado",
                    value: row.records,
                    at: intel.asOf,
                    maxAgeMs,
                    error: row.error,
                    missing: id === "intake.news" && raw.observations === 0,
                  })),
              });
        }
      } catch (error) {
        this.observe("intake.news", {
          asset,
          at: now,
          source: "IntelligenceDag",
          error: error.message,
          raw: {},
          inputs: [],
        });
      }
    }
    try {
      const status = sources.pipeline?.status?.();
      if (status)
        for (const [id, raw] of [
          ["risk.manager", status.risk],
          ["portfolio.manager", status.portfolio],
          ["audit.writer", status.audit],
        ])
          if (raw)
            this.observe(id, {
              at: id === "risk.manager" ? raw.lastReview?.at || now : now,
              source: "TradingPipeline.status",
              raw,
              inputs: [
                {
                  name: "Estado observado",
                  source: "TradingPipeline.status",
                  value: true,
                  at: now,
                },
              ],
            });
    } catch (error) {
      this.observe("risk.manager", {
        at: now,
        source: "TradingPipeline.status",
        error: error.message,
        raw: {},
        inputs: [],
      });
    }
    try {
      const status = sources.execution?.status?.();
      if (status)
        this.observe("execution.queue", {
          at: now,
          source: "ExecutionService.status",
          raw: {
            queue: status.queue,
            metrics: status.metrics,
            tca: status.tca,
          },
          inputs: [
            {
              name: "Cola paper",
              source: "ExecutionService.status",
              value: status.queue,
              at: now,
            },
          ],
        });
    } catch (error) {
      this.observe("execution.queue", {
        at: now,
        source: "ExecutionService.status",
        error: error.message,
        raw: {},
        inputs: [],
      });
    }
    return sources;
  }
  card(id, { asset = null, refresh = true } = {}) {
    const employee = this.registry.find((row) => row.id === id);
    if (!employee) return null;
    const sources = refresh ? this.pull() : this.sources(),
      specification = specificationFor(employee, sources),
      candidates = [...this.rows.entries()]
        .filter(([key]) => key.startsWith(`${id}:`))
        .flatMap(([, rows]) => rows)
        .filter((row) => !asset || row.asset === asset)
        .sort((a, b) => b.at - a.at || b.sequence - a.sequence),
      last = candidates[0] || null,
      currentAsset = asset || last?.asset || employee.asset || null,
      history = candidates
        .filter(
          (row) => row.asset === currentAsset || (!row.asset && !currentAsset),
        )
        .slice(0, CARD_LIMITS.history),
      inputs = (last?.inputs || []).map((row) =>
        this.input(
          row.name,
          row.source,
          row.value,
          row.at,
          row.maxAgeMs || CARD_LIMITS.marketAgeMs,
          row.error,
          row.missing,
        ),
      );
    const sourceError = this.sourceErrors.get(`${id}:${currentAsset}`);
    if (sourceError)
      inputs.unshift(
        this.input(
          "Fuente de mercado",
          "Data Plane",
          null,
          sourceError.at,
          CARD_LIMITS.marketAgeMs,
          sourceError.error,
        ),
      );
    if (!inputs.length)
      inputs.push(
        this.input(
          "Entrada verificable",
          last?.source || "sin fuente conectada",
          null,
          null,
          CARD_LIMITS.marketAgeMs,
          last?.error,
        ),
      );
    const desk = sources.desks || sources.pipeline?.desks,
      insufficient =
        id.startsWith("desk.") || id.startsWith("consensus.")
          ? inputs
              .filter(
                (row) =>
                  ["candles", "trades"].includes(row.name) &&
                  Number.isFinite(row.lastValue) &&
                  row.lastValue <
                    (row.name === "candles"
                      ? desk?.minCandles
                      : desk?.minTrades),
              )
              .map(
                (row) =>
                  `${row.name}: n = ${row.lastValue}, mínimo ${row.name === "candles" ? desk.minCandles : desk.minTrades}`,
              )
          : [],
      active =
        !last ||
        insufficient.length > 0 ||
        inputs.some((row) => row.state !== "live"),
      empty = {
        active,
        reason:
          last?.error ||
          (insufficient.length
            ? `Muestra de entrada insuficiente: ${insufficient.join("; ")}`
            : null) ||
          (!last
            ? "No hay observaciones de este empleado en este proceso."
            : active
              ? "La entrada disponible no demuestra datos actuales completos."
              : "Hay observaciones disponibles; su interpretación requiere revisar fuentes y límites."),
        solution:
          employee.asset &&
          sources.dataService?.products &&
          !sources.dataService.products.includes(`${employee.asset}-USD`)
            ? `Incluir ${employee.asset}-USD en MARKET_PRODUCTS y reiniciar el feed.`
            : "Revisar el proveedor o ejecutar el proceso padre correspondiente; consultar esta ficha no lo inicia.",
      },
      narration = narrate(id, {
        raw: last?.raw || {},
        asset: currentAsset,
        parameters: specification.work.parameters,
        observed: !!last,
        error: last?.error,
      }),
      mainKey = ["signal", "price", "queue", "equity", "qty"].find((key) =>
        Number.isFinite(last?.raw[key]),
      ),
      values = history.map((row) => row.raw[mainKey]).filter(Number.isFinite);
    specification.work.parameters = specification.work.parameters
      .filter((row) => !SENSITIVE.test(row.name))
      .slice(0, CARD_LIMITS.parameters)
      .map((row) => ({
        ...row,
        value:
          typeof row.value === "string"
            ? this.clean(row.value).slice(0, 300)
            : this.clean(row.value),
        name: this.clean(row.name),
        source: this.clean(row.source),
      }));
    const card = {
      version: 1,
      paperOnly: true,
      identity: specification.identity,
      work: specification.work,
      inputs,
      latest: {
        at: last ? new Date(last.at).toISOString() : null,
        asset: currentAsset,
        summary: this.clean(narration.activity),
        raw: last?.raw || {},
      },
      meaning: {
        scale: this.clean(narration.scale),
        consequence: this.clean(narration.consequence),
        userAction: active
          ? empty.solution
          : "Revisar los datos, límites y evidencia antes de interpretar el resultado.",
      },
      reliability: {
        performance: {
          status: "not_measured",
          sampleSize: 0,
          value: null,
          reason:
            "No existe evaluación empírica por empleado en esta fase; no se deduce acierto de confidence.",
        },
        limits: [specification.work.parameterStatus],
        whenNotToTrust: [
          "No utilizar entradas ausentes, antiguas o con error.",
          "Una actualización de estado no demuestra una predicción ni una ejecución del empleado.",
        ],
      },
      history: {
        capacity: CARD_LIMITS.history,
        items: history.map((row) => ({
          at: new Date(row.at).toISOString(),
          asset: row.asset,
          title: this.clean(
            narrate(id, {
              raw: row.raw,
              asset: row.asset,
              parameters: specification.work.parameters,
              error: row.error,
            }).activity,
          ),
          value: signalValue(row.raw),
        })),
        trend: {
          status: values.length >= 2 ? "observed" : "insufficient_sample",
          value: values.length >= 2 ? values[0] - values.at(-1) : null,
        },
      },
      relations: {
        receivesFrom: [],
        deliversTo: [],
        status:
          "Cableado detallado pendiente de validación en E5; no se deduce de flechas decorativas.",
      },
      empty,
    };
    return assertEmployeeCard(card);
  }
  list() {
    this.pull();
    return this.registry.map((row) => {
      const card = this.card(row.id, { refresh: false });
      return {
        id: row.id,
        name: row.name,
        area: row.areaId,
        updatedAt: card.latest.at,
        asset: card.latest.asset,
        state: card.inputs.some((input) => input.state === "error")
          ? "error"
          : card.inputs.some((input) => input.state === "stale")
            ? "stale"
            : card.empty.active
              ? "missing"
              : "live",
      };
    });
  }
}
module.exports = { EmployeeCards };
