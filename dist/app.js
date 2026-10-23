let areas = [
  {
    id: 1,
    key: "intake",
    name: "Intake & Intelligence",
    type: "MARKET DATA + NEWS",
    color: "#f1d24a",
    desc: "Descubre, codifica y somete estrategias a backtesting y pruebas fuera de muestra antes de asignar capital.",
    agents: [
      "Data Collector",
      "Crypto News Reader",
      "Sentiment Scanner",
      "On-Chain Analyst",
      "Intel Hub",
    ],
    signal: "Esperando datos verificados",
    x: 50,
    y: 58,
    w: 400,
    h: 250,
  },
  {
    id: 2,
    key: "desks",
    name: "Mesas de Activos",
    type: "BTC · ETH · SOL · BNB",
    color: "#6d8cff",
    desc: "Cuatro mesas de majors con plantilla cuantitativa compartida y mandatos de riesgo independientes.",
    agents: ["BTC Desk", "ETH Desk", "SOL Desk", "BNB Desk"],
    signal: "Majors · esperando análisis consolidado",
    x: 540,
    y: 58,
    w: 520,
    h: 250,
  },
  {
    id: 3,
    key: "consensus",
    name: "Consenso",
    type: "MULTI-SIGNAL DECISION",
    color: "#42d7d0",
    desc: "Convierte redes sociales, blockchain y macroeconomía en señales estructuradas y verificables.",
    agents: [
      "Technical",
      "Volume",
      "Whale",
      "Liquidity",
      "Market Structure",
      "Order Block",
      "Signal Hub",
    ],
    signal: "Sin consenso reciente",
    x: 1080,
    y: 58,
    w: 365,
    h: 250,
  },
  {
    id: 4,
    key: "risk",
    name: "Risk Management",
    type: "RISK CONTROL · VETO",
    color: "#ff5864",
    desc: "Control independiente con autoridad para cortar capital, limitar drawdown y bloquear exposición correlacionada.",
    agents: [
      "Risk Manager",
      "Drawdown Controller",
      "Exposure Monitor",
      "Position Size",
    ],
    signal: "Risk Gate listo",
    x: 50,
    y: 335,
    w: 400,
    h: 215,
  },
  {
    id: 5,
    key: "execution",
    name: "Ejecución Paper",
    type: "PAPER ONLY",
    color: "#b9f34a",
    desc: "Enruta micro-órdenes simuladas con fills L2, latencia, fees y slippage.",
    agents: ["Execution Queue", "Paper Router", "Broker Simulator"],
    signal: "Sin órdenes pendientes",
    x: 540,
    y: 335,
    w: 440,
    h: 215,
  },
  {
    id: 6,
    key: "portfolio",
    name: "Cartera",
    type: "ALLOCATION",
    color: "#c585ff",
    desc: "Controla asignación y concentración de la cartera simulada.",
    agents: ["Portfolio Manager", "Capital Allocation", "Rebalancing"],
    signal: "Asignación paper estable",
    x: 1000,
    y: 335,
    w: 445,
    h: 215,
  },
  {
    id: 7,
    key: "audit",
    name: "Auditoría",
    type: "IMMUTABLE JOURNAL",
    color: "#4adf89",
    desc: "Registra evidencia, decisiones, vetos y fills para reproducir cada operación.",
    agents: ["Audit Writer"],
    signal: "Cadena de auditoría íntegra",
    x: 50,
    y: 580,
    w: 470,
    h: 255,
  },
  {
    id: 8,
    key: "research",
    name: "Mining & Backtesting",
    type: "RESEARCH LAB",
    color: "#a9b8bd",
    desc: "Prueba estrategias con backtests y validación fuera de muestra antes del paper trading.",
    agents: ["Strategy Miner", "Backtest Engine", "Walk-Forward Optimizer"],
    signal: "Laboratorio sin ejecución activa",
    x: 545,
    y: 580,
    w: 440,
    h: 255,
  },
  {
    id: 9,
    key: "sre",
    name: "SRE & Data Room",
    type: "OBSERVABILITY",
    color: "#ff9d48",
    desc: "Observa feeds, latencia, disponibilidad y anomalías del sistema paper.",
    agents: ["Feed Manager", "API Monitor", "Anomaly Detector"],
    signal: "Monitoreo activo",
    x: 1010,
    y: 580,
    w: 435,
    h: 255,
  },
];

const rooms = document.querySelector("#rooms"),
  nav = document.querySelector("#nav"),
  detail = document.querySelector("#detail");
let floorLinks = [
    { id: "intake-desks", from: "intake", to: "desks" },
    { id: "desks-consensus", from: "desks", to: "consensus" },
    { id: "consensus-risk", from: "consensus", to: "risk", kind: "risk" },
    { id: "risk-execution", from: "risk", to: "execution", kind: "risk" },
    { id: "execution-portfolio", from: "execution", to: "portfolio" },
    { id: "execution-audit", from: "execution", to: "audit" },
    {
      id: "research-consensus",
      from: "research",
      to: "consensus",
      kind: "feedback",
    },
    { id: "sre-intake", from: "sre", to: "intake" },
  ],
  floorNodeState = new Map(),
  floorNodeEvents = new Map();
const floorObservations = new Map();
let floorConnected = false,
  floorSyncBusy = false,
  floorLastSync = 0,
  floorReconnect = null;
const MAX_NODE_EVENTS = 20,
  SENSITIVE_FIELD = /token|secret|authorization|api[-_]?key|password/i;

function nodeSlug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.|\.$/g, "");
}
function fallbackNodeId(area, label) {
  const canonical = {
    "Data Collector": "intake.data",
    "Crypto News Reader": "intake.news",
    "Sentiment Scanner": "intake.sentiment",
    "On-Chain Analyst": "intake.onchain",
    "Intel Hub": "intake.intel",
    "Feed Manager": "sre.feeds",
    "Portfolio Manager": "portfolio.manager",
    "BTC Desk": "desk.btc",
    "ETH Desk": "desk.eth",
    "SOL Desk": "desk.sol",
    "BNB Desk": "desk.bnb",
    Technical: "consensus.technical",
    Volume: "consensus.volume",
    Whale: "consensus.whale",
    Liquidity: "consensus.liquidity",
    "Market Structure": "consensus.structure",
    "Order Block": "consensus.orderblock",
    "Signal Hub": "consensus.signal",
    "Risk Manager": "risk.manager",
    "Execution Queue": "execution.queue",
    "Audit Writer": "audit.writer",
    "Anomaly Detector": "sre.anomaly",
  };
  return canonical[label] || `${area.key}.${nodeSlug(label)}`;
}
function normalizeAreas(nextAreas) {
  return nextAreas.map((area) => {
    const nodes = area.nodes || area.agents.map((label) => ({ label }));
    return {
      ...area,
      nodes: nodes.map((node) => ({
        ...node,
        id: node.id || fallbackNodeId(area, node.label),
      })),
      agents: nodes.map((node) => node.label),
    };
  });
}
function safePayload(value, depth = 0) {
  if (depth > 4) return "[depth-limit]";
  if (Array.isArray(value))
    return value.slice(0, 12).map((item) => safePayload(item, depth + 1));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 30)
        .map(([key, item]) => [
          key,
          SENSITIVE_FIELD.test(key)
            ? "[redacted]"
            : safePayload(item, depth + 1),
        ]),
    );
  if (typeof value === "string" && value.length > 400)
    return value.slice(0, 400) + "…";
  return value;
}
function eventText(value) {
  if (value === undefined || value === null || value === "") return "—";
  const text =
    typeof value === "string" ? value : JSON.stringify(safePayload(value));
  return text.length > 1000 ? text.slice(0, 1000) + "…" : text;
}
function recordNodeEvent(id, event) {
  if (!nodeById(id)) return;
  const history = floorNodeEvents.get(id) || [];
  history.unshift({
    at: event.at || new Date().toISOString(),
    type: event.type || "event",
    source: event.source || "stream",
    status: event.status || "ok",
    input: eventText(event.input),
    evidence: eventText(event.evidence),
    formula: eventText(event.formula),
    output: eventText(event.output),
  });
  floorNodeEvents.set(id, history.slice(0, MAX_NODE_EVENTS));
  if (selectedNodeId === id) {
    renderNodeEvents(id);
    renderLiveEmployee();
  }
}
function renderNodeEvents(id) {
  const history = floorNodeEvents.get(id) || [],
    list = document.querySelector("#nodeEventList"),
    empty = document.querySelector("#nodeEventEmpty");
  document.querySelector("#nodeEventCount").textContent = String(
    history.length,
  );
  empty.hidden = history.length > 0;
  list.innerHTML = history
    .map(
      (event) =>
        `<li class="node-event ${esc(event.status)}"><header><b>${esc(event.type)}</b><time>${esc(new Date(event.at).toLocaleTimeString([], { hour12: false }))}</time></header><dl><dt>FUENTE</dt><dd>${esc(event.source)}</dd><dt>ENTRADA</dt><dd>${esc(event.input)}</dd><dt>EVIDENCIA</dt><dd>${esc(event.evidence)}</dd><dt>FÓRMULA</dt><dd>${esc(event.formula)}</dd><dt>SALIDA</dt><dd>${esc(event.output)}</dd></dl></li>`,
    )
    .join("");
}
areas = normalizeAreas(areas);
const platformStore = new QCFPlatform.ConfigStore(localStorage),
  infraHealth = new QCFPlatform.InfraHealth({
    alpha: 0.2,
    window: 31,
    zLimit: 3.5,
  });
let platformConfig = platformStore.load(),
  platformClient = new QCFPlatform.PlatformClient(platformConfig);
const stateMachine = new QCF.StateMachine("running", localStorage),
  engine = {
    state: stateMachine.value,
    scenario: "normal",
    events: 2048,
    latency: 42,
  };
const dataPlane = new QCFData.DataPlane({ maxAgeMs: 12000, maxGapMs: 60000 });
dataPlane.ingest(
  { symbol: "BTCUSDT", price: 68420, volume: 12.4, timestamp: Date.now() },
  "exchange-a",
);
dataPlane.ingest(
  { symbol: "BTCUSDT", price: 68426, volume: 10.8, timestamp: Date.now() },
  "exchange-b",
);
const strategies = new QCFResearch.StrategyCatalog(),
  trendStrategy = strategies.register({
    id: "btc-regime-v1",
    name: "BTC Regime Momentum",
    version: "1.0.0",
    signal: (candles, i) =>
      i < 12 ? 0 : candles[i].close > candles[i - 12].close ? 1 : -1,
  });
const riskEngine = new QCFOps.RiskEngine(),
  paperBroker = new QCFOps.PaperBroker({ cash: 100000, risk: riskEngine }),
  auditChain = new QCFAudit.AuditChain(),
  opsMetrics = new QCFAudit.Metrics();
let paperSeq = 0;
function esc(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );
}
function roomContent(a) {
  let content = `<div class="room-head"><span class="room-label">${esc(String(a.id).padStart(2, "0"))} · ${esc(a.name)}</span><span class="room-code">${esc(a.type)}</span></div><span class="room-sub">${esc(a.agents.length)} NODOS · ESTADO OBSERVADO</span>`;
  if (a.groups) {
    let gx = 15,
      gy = 60;
    a.groups.forEach((g, gi) => {
      content += `<div style="position:absolute;left:${gx + gi * 220}px;top:48px;width:200px;border-top:1px solid ${esc(a.color)}55;padding-top:5px;font:7px DM Mono;color:${esc(a.color)}">${esc(g[0])}</div>`;
      g.slice(1, 10).forEach((n, i) => {
        const x = gx + gi * 220 + (i % 3) * 62,
          y = gy + 38 + Math.floor(i / 3) * 70;
        content += sprite(n, x, y, a.color, i);
      });
    });
  } else {
    a.nodes.slice(0, 10).forEach((n, i) => {
      let cols = Math.max(2, Math.floor((a.w - 25) / 68));
      let x = 18 + (i % cols) * 68,
        y = 62 + Math.floor(i / cols) * 70;
      content += sprite(n, x, y, a.color, i);
    });
  }
  return content;
}
function sprite(node, x, y, c, i) {
  const normalized =
      typeof node === "string" ? { id: nodeSlug(node), label: node } : node,
    runtime = floorNodeState.get(normalized.id),
    state = runtime?.state || "idle";
  return `<div class="desk" style="left:${x - 14}px;top:${y - 13}px"></div><div class="agent ${esc(state)}" data-node-id="${esc(normalized.id)}" data-agent="${esc(normalized.label)}" data-state="${esc(state)}" title="${esc(runtime?.detail || "Esperando evento real")}" style="left:${x}px;top:${y}px;--room-color:${esc(c)};--sprite:url('assets/characters/char_${i % 8}.png')"><i class="head"></i><i class="body"></i><i class="legs"></i><span class="agent-name">${esc(normalized.label)}</span></div>`;
}
function bindAgentClicks() {
  document.querySelectorAll(".agent").forEach((el) =>
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const area = areas.find((x) => x.id === +el.closest(".room").dataset.id);
      selectArea(area);
      showModel(el.dataset.agent, el.dataset.nodeId);
    }),
  );
}
function renderFloor() {
  rooms.replaceChildren();
  nav.replaceChildren();
  areas.forEach((a) => {
    a.status = a.status || "idle";
    let el = document.createElement("article");
    el.className = "room";
    el.dataset.id = a.id;
    el.dataset.status = a.status;
    el.setAttribute("tabindex", "0");
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", `${a.name}: ${a.agents.length} agentes`);
    el.style.cssText = `left:${a.x}px;top:${a.y}px;width:${a.w}px;height:${a.h}px;--room-color:${a.color}`;
    el.innerHTML = roomContent(a);
    el.addEventListener("click", () => selectArea(a));
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectArea(a);
      }
    });
    rooms.append(el);
    let n = document.createElement("div");
    n.className = "nav-item";
    n.style.setProperty("--room-color", a.color);
    n.innerHTML = `<span class="nav-num">${esc(String(a.id).padStart(2, "0"))}</span><span class="nav-name">${esc(a.name)}</span><span class="nav-count"><i class="status ${esc(a.status)}"></i>${esc(a.agents.length)}</span>`;
    n.onclick = () => {
      focusRoom(a);
      selectArea(a);
      closeMenu();
    };
    nav.append(n);
  });
  bindAgentClicks();
  drawNetwork();
}
let agentConfigs = {};
try {
  agentConfigs = JSON.parse(localStorage.getItem("qcf-agent-configs") || "{}");
} catch (e) {
  agentConfigs = {};
}
let selectedAgent = "Signal Hub",
  selectedNodeId = "consensus.signal";
const agentCatalog = {
  "Strategy Miner": [
    "IA · MACHINE LEARNING",
    "Busca anomalías, correlaciones ocultas y patrones históricos para proponer reglas de entrada y salida.",
    "features históricos",
    "candidate strategy",
  ],
  "Backtest Engine": [
    "MATEMÁTICO · ÁLGEBRA LINEAL",
    "Simula reglas contra millones de velas incluyendo fees y slippage.",
    "strategy + OHLCV",
    "PnL distribution",
  ],
  "Walk-Forward Optimizer": [
    "MATEMÁTICO · ESTADÍSTICA",
    "Divide la historia en entrenamiento y datos no vistos para detectar curve-fitting.",
    "train/test windows",
    "robustness score",
  ],
  "Code Generator": [
    "IA · LLM DE CÓDIGO",
    "Convierte estrategias aprobadas en Python o PineScript listo para integración.",
    "approved spec",
    "versioned code",
  ],
  "Alpha Trader (BTC/ETH)": [
    "MATEMÁTICO · INDICADORES",
    "Ejecuta algoritmos HFT o swing exclusivamente sobre cripto majors.",
    "market data + signal",
    "orders",
  ],
  "Memecoin Hunter": [
    "MATEMÁTICO · SMART CONTRACTS",
    "Escanea Solana y Base buscando lanzamientos con liquidez bloqueada y salida rápida.",
    "pools + contracts",
    "scored tokens",
  ],
  "Execution Router (TWAP/VWAP)": [
    "MATEMÁTICO · ROUTING",
    "Fragmenta órdenes grandes para minimizar impacto y ocultar intención.",
    "parent order + book",
    "child orders",
  ],
  "Social Sentiment Scanner": [
    "IA · NLP",
    "Clasifica Reddit, X y Telegram para estimar Fear & Greed por activo.",
    "social stream",
    "sentiment score",
  ],
  "On-Chain Analyst": [
    "MATEMÁTICO · GRAFOS",
    "Vigila ballenas, nuevas direcciones y flujos hacia y desde exchanges.",
    "blockchain graph",
    "flow alert",
  ],
  "Macro News Reader": [
    "IA · LLM",
    "Interpreta FED, inflación y SEC y clasifica impacto alcista o bajista.",
    "macro documents",
    "impact + evidence",
  ],
  "Drawdown Controller": [
    "MATEMÁTICO · SERIES",
    "Corta acceso a capital cuando una estrategia excede su pérdida máxima permitida.",
    "equity curve",
    "allow / HALT",
  ],
  "Capital Allocator": [
    "MATEMÁTICO · KELLY",
    "Asigna capital según ventaja, varianza y rendimiento ajustado por riesgo.",
    "win rate + payoff",
    "capital fraction",
  ],
  "Exposure Monitor": [
    "MATEMÁTICO · VaR",
    "Evita concentración oculta midiendo correlación, beta y Value at Risk.",
    "positions + covariance",
    "portfolio risk",
  ],
  "Funding Rate Arbitrageur": [
    "MATEMÁTICO · HEDGING",
    "Combina spot y perpetuos para capturar funding sin dirección neta.",
    "spot + perp + funding",
    "hedged yield",
  ],
  "DEX Triangle Scanner": [
    "MATEMÁTICO · GRAFOS",
    "Busca ciclos rentables entre tres pares descontando gas, fees y slippage.",
    "DEX graph",
    "profitable cycle",
  ],
  "Yield Farmer": [
    "MATEMÁTICO · TASAS",
    "Mueve stablecoins entre protocolos según APY neto y riesgo.",
    "protocol rates",
    "allocation",
  ],
  "Chief Investment Officer (CIO)": [
    "IA · LLM AVANZADO",
    "Sintetiza Intel, riesgo y PnL en un reporte ejecutivo y una recomendación.",
    "reports + portfolio",
    "executive brief",
  ],
  "Debate Moderator": [
    "IA · MULTI-AGENTE",
    "Hace confrontar señales incompatibles hasta producir consenso probabilístico.",
    "agent arguments",
    "consensus",
  ],
  "Human Director": [
    "HUMANO · KILL SWITCH",
    "Aprueba cambios estratégicos y conserva la autoridad final de detener el fondo.",
    "CIO proposal",
    "approve / kill",
  ],
  "Data Engineer (Feed Manager)": [
    "ESTRUCTURAL · STREAMING",
    "Mantiene WebSockets y order books sin interrupciones ni huecos.",
    "exchange sockets",
    "normalized feed",
  ],
  "API Optimizer": [
    "MATEMÁTICO · RATE LIMIT",
    "Dosifica peticiones para evitar bans y prioriza tráfico crítico.",
    "request queue",
    "scheduled calls",
  ],
  "Anomaly Detector": [
    "ML · SERIES TEMPORALES",
    "Detecta latencia y fallas de API y ordena pausa preventiva a Riesgo.",
    "service metrics",
    "anomaly alert",
  ],
  "Wallet & Gas Manager": [
    "MATEMÁTICO · COSTOS",
    "Optimiza el momento y la ruta de transferencias para minimizar gas.",
    "mempool + balances",
    "transfer plan",
  ],
  "Crypto Accountant (PnL Tracker)": [
    "MATEMÁTICO · CONTABLE",
    "Concilia saldos y calcula PnL real neto de fees, retiros y préstamos.",
    "ledger + balances",
    "reconciled PnL",
  ],
  "Smart Contract Auditor": [
    "IA · ANÁLISIS DE CÓDIGO",
    "Busca vulnerabilidades conocidas antes de autorizar depósitos DeFi.",
    "contract source",
    "risk findings",
  ],
  "Options Trader": [
    "MATEMÁTICO · BLACK-SCHOLES",
    "Compra protección Put o vende Calls cubiertas según régimen y volatilidad.",
    "surface + portfolio",
    "option hedge",
  ],
  "Delta-Neutral Strategist": [
    "MATEMÁTICO · GREEKS",
    "Ajusta coberturas dinámicas para mantener delta cercano a cero.",
    "positions + greeks",
    "hedge orders",
  ],
};
const agentRuntime = new QCF.Runtime();
Object.entries(agentCatalog).forEach(([id, info]) =>
  agentRuntime.register({
    id,
    type: /^IA|ML/.test(info[0])
      ? "ai"
      : info[0].startsWith("HUMANO")
        ? "hybrid"
        : "math",
    version: "1.0.0",
    timeoutMs: 1400,
    retries: 1,
  }),
);
agentRuntime.bus.on("*", () => {
  engine.events++;
  document.querySelector("#eventCount").textContent = engine.events
    .toLocaleString("en-US")
    .padStart(7, "0");
});
const models = {
  technical: [
    "DETERMINISTIC",
    "EMA₉ − EMA₂₁ + RSI₁₄",
    "OHLCV[60]",
    "direction, confidence",
    91,
  ],
  volume: [
    "STATISTICAL",
    "zᵥ = (Vₜ − μ₂₀) / σ₂₀",
    "volume[20]",
    "anomaly score",
    87,
  ],
  whale: [
    "GRAPH + RULES",
    "net = Σ(buyᵢqᵢ − sellᵢqᵢ)",
    "trades ≥ threshold",
    "whale pressure",
    89,
  ],
  liquidity: [
    "MICROSTRUCTURE",
    "I = (Σbid − Σask)/(Σbid + Σask)",
    "L2 order book",
    "imbalance ∈ [-1,1]",
    93,
  ],
  risk: [
    "CONSTRAINT SOLVER",
    "approve ⇔ VaR < L ∧ DD < D ∧ E < Eₘₐₓ",
    "proposal, portfolio",
    "approve / VETO",
    99,
  ],
  sentiment: [
    "NLP TRANSFORMER",
    "s = softmax(BERT(text))",
    "news, Reddit, X",
    "sentiment vector",
    82,
  ],
  macro: [
    "BAYESIAN",
    "P(regime|x) ∝ P(x|regime)P(regime)",
    "rates, CPI, FX",
    "market regime",
    84,
  ],
  signal: [
    "ENSEMBLE",
    "S = Σ(wᵢ · dᵢ · cᵢ) / Σwᵢ",
    "agent signals[n]",
    "score ∈ [-1,1]",
    94,
  ],
  backtest: [
    "MONTE CARLO",
    "Sharpe = E[R−Rf] / σ(R)",
    "strategy, history",
    "robustness score",
    88,
  ],
  portfolio: [
    "OPTIMIZER",
    "w* = argmin wᵀΣw − λμᵀw",
    "returns, covariance",
    "target weights",
    90,
  ],
  default: [
    "AI HYBRID",
    "ŷ = fθ(x, context, memory)",
    "market context",
    "signal + evidence",
    80,
  ],
};
function modelFor(name) {
  let n = name.toLowerCase();
  if (/drawdown|allocator|exposure/.test(n)) return models.risk;
  if (/backtest|walk-forward/.test(n)) return models.backtest;
  if (/execution|api optimizer|data engineer/.test(n)) return models.liquidity;
  if (/sentiment|news reader/.test(n)) return models.sentiment;
  if (/on-chain|triangle/.test(n)) return models.whale;
  if (/cio|moderator/.test(n)) return models.signal;
  if (/options|delta|funding|yield|wallet|accountant/.test(n))
    return models.portfolio;
  if (/strategy miner|code generator|auditor|anomaly/.test(n))
    return models.default;
  return models.technical;
}
function showModel(name, nodeId = null) {
  selectedAgent = name;
  if (nodeId) selectedNodeId = nodeId;
  const m = modelFor(name),
    info = agentCatalog[name] || [
      m[0],
      "Agente especializado del fondo.",
      m[2],
      m[3],
    ],
    suggested = /^IA|ML/.test(info[0])
      ? "ai"
      : info[0].startsWith("HUMANO")
        ? "hybrid"
        : "math",
    cfg = agentConfigs[name] || {
      type: suggested,
      weight: 1,
      endpoint: "",
      connected: false,
    };
  document.querySelector("#modelName").textContent = name;
  document.querySelector("#modelMission").textContent = info[1];
  document.querySelector("#modelType").textContent = info[0];
  renderLiveEmployee();
  document.querySelector("#brainType").value = cfg.type;
  document.querySelector("#agentWeight").value = cfg.weight;
  document.querySelector("#weightValue").textContent =
    Number(cfg.weight).toFixed(1) + "×";
  document.querySelector("#agentEndpoint").value = cfg.endpoint;
  document
    .querySelector("#connectAgent")
    .classList.toggle("connected", cfg.connected);
  document.querySelector("#connectAgent span").textContent = cfg.connected
    ? "NODO CONECTADO"
    : "CONECTAR NODO";
  const live = floorNodeState.get(selectedNodeId);
  document.querySelector("#connectionState").textContent = live
    ? `STREAM · ${live.state.toUpperCase()} · ${live.detail}`
    : cfg.connected
      ? `${cfg.type.toUpperCase()} · enlace persistido localmente`
      : "Esperando evento real · configuración local";
  renderNodeEvents(selectedNodeId);
}
function renderLiveEmployee() {
  document.querySelector("#floorConnection").textContent = floorConnected
    ? "STREAM CONECTADO"
    : Date.now() - floorLastSync <= 15000
      ? "CONSULTA CADA 5 S"
      : "SIN CONEXIÓN";
  for (const element of document.querySelectorAll(".agent")) {
    const state = floorNodeState.get(element.dataset.nodeId);
    element.dataset.freshness =
      !floorConnected && Date.now() - floorLastSync > 15000
        ? "offline"
        : !state || Date.now() - state.at > 30000
          ? "stale"
          : "fresh";
  }
  const observed = floorObservations.get(selectedNodeId),
    live = floorNodeState.get(selectedNodeId),
    history = floorNodeEvents.get(selectedNodeId)?.[0],
    age = live ? Date.now() - live.at : Infinity,
    disconnected = !floorConnected && Date.now() - floorLastSync > 15000,
    state = disconnected
      ? "DESCONECTADO"
      : age > 30000 && live
        ? "DATOS ANTIGUOS"
        : live?.state?.toUpperCase() || "SIN DATOS";
  document.querySelector("#nodeLiveStatus").textContent = state;
  document.querySelector("#nodeLiveActivity").textContent =
    live?.detail || "Sin actividad observada para este empleado.";
  document.querySelector("#nodeLiveTime").textContent = live
    ? `Última observación: ${new Date(live.at).toLocaleString()} · ${Math.max(0, Math.floor(age / 1000))} s`
    : "Sin actualización";
  document.querySelector("#modelFormula").textContent =
    history?.formula && history.formula !== "—"
      ? history.formula
      : "Método no informado por este evento";
  document.querySelector("#modelInputs").textContent =
    history?.input || "Sin entrada observada";
  document.querySelector("#modelOutput").textContent =
    history?.output || "Sin resultado observado";
  const confidence = observed?.confidence;
  document.querySelector("#confidenceBar").style.width = Number.isFinite(
    confidence,
  )
    ? `${Math.max(0, Math.min(1, confidence)) * 100}%`
    : "0%";
  document.querySelector("#confidenceValue").textContent = Number.isFinite(
    confidence,
  )
    ? `${(confidence * 100).toFixed(1)}%`
    : "—";
  document.querySelector("#signal").textContent =
    live?.detail || "Sin señal observada";
}
let lastThought = null;
function ambientThought() {
  const pool = [...document.querySelectorAll(".agent")];
  if (!pool.length) return;
  const el = pool[Math.floor(Math.random() * pool.length)];
  if (lastThought) lastThought.remove();
  const b = document.createElement("span");
  b.className = "thought";
  b.textContent =
    floorNodeState.get(el.dataset.nodeId)?.detail || "Sin datos observados";
  el.append(b);
  lastThought = b;
  setTimeout(() => {
    if (b.isConnected) b.remove();
    if (lastThought === b) lastThought = null;
  }, 3800);
}
setTimeout(ambientThought, 1300);
setInterval(ambientThought, 6200);
function drawNetwork() {
  const svg = document.querySelector("#nodeLayer"),
    center = (a) => [a.x + a.w / 2, a.y + a.h / 2];
  let html =
    '<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#42d7d0"/></marker></defs>';
  floorLinks.forEach((link, i) => {
    const from = areas.find((area) => area.key === link.from),
      to = areas.find((area) => area.key === link.to);
    if (!from || !to) return;
    const [x1, y1] = center(from),
      [x2, y2] = center(to),
      mx = (x1 + x2) / 2;
    const d = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
    html += `<path id="edge${i}" data-link-id="${esc(link.id)}" class="network-path ${esc(link.kind || "")}" d="${d}" marker-end="url(#arrow)"/>`;
  });
  areas.forEach((a) => {
    const [x, y] = center(a);
    html += `<circle class="network-node" cx="${x}" cy="${y}" r="6"/>`;
  });
  svg.innerHTML = html;
}
renderFloor();
function selectArea(a) {
  document
    .querySelectorAll(".room,.nav-item")
    .forEach((e) => e.classList.remove("selected", "active"));
  document.querySelector(`.room[data-id="${a.id}"]`).classList.add("selected");
  nav.children[a.id - 1].classList.add("active");
  detail.style.setProperty("--accent", a.color);
  document.querySelector("#detailIndex").textContent = String(a.id).padStart(
    2,
    "0",
  );
  document.querySelector("#detailType").textContent = a.type;
  document.querySelector("#detailType").style.color = a.color;
  document.querySelector("#detailName").textContent = a.name;
  document.querySelector("#detailDesc").textContent = a.desc;
  document.querySelector("#agentCount").textContent = String(
    a.agents.length,
  ).padStart(2, "0");
  document.querySelector("#signal").textContent = a.signal;
  document.querySelector("#agentList").innerHTML = a.agents
    .map(
      (x) =>
        `<div class="agent-chip" data-agent="${esc(x)}" style="--accent:${esc(a.color)}">● ${esc(x)}</div>`,
    )
    .join("");
  document.querySelectorAll("#agentList .agent-chip").forEach((x) => {
    const node = a.nodes.find(
      (candidate) => candidate.label === x.dataset.agent,
    );
    x.onclick = () => showModel(x.dataset.agent, node?.id);
  });
  showModel(a.agents[0], a.nodes[0]?.id);
  detail.classList.add("open");
}
document.querySelector("#close").onclick = () =>
  detail.classList.remove("open");
const sidebar = document.querySelector("#sidebar"),
  menu = document.querySelector("#menu"),
  scrim = document.querySelector("#scrim");
function closeMenu() {
  sidebar.classList.remove("open");
  scrim.classList.remove("open");
  menu.setAttribute("aria-expanded", "false");
}
menu.onclick = () => {
  const open = !sidebar.classList.contains("open");
  sidebar.classList.toggle("open", open);
  scrim.classList.toggle("open", open);
  menu.setAttribute("aria-expanded", String(open));
};
scrim.onclick = closeMenu;
let scale = 0.78,
  tx = 25,
  ty = 55,
  drag = false,
  sx = 0,
  sy = 0,
  stx = 0,
  sty = 0;
const floor = document.querySelector("#floor"),
  vp = document.querySelector("#viewport");
function apply() {
  floor.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`;
  document.querySelector("#zoomLabel").textContent =
    Math.round(scale * 100) + "%";
}
function setScale(v, cx = vp.clientWidth / 2, cy = vp.clientHeight / 2) {
  let ns = Math.max(0.42, Math.min(1.5, v));
  tx = cx - (cx - tx) * (ns / scale);
  ty = cy - (cy - ty) * (ns / scale);
  scale = ns;
  apply();
}
vp.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const r = vp.getBoundingClientRect();
    setScale(
      scale * (e.deltaY > 0 ? 0.9 : 1.1),
      e.clientX - r.left,
      e.clientY - r.top,
    );
  },
  { passive: false },
);
vp.onpointerdown = (e) => {
  if (e.target.closest(".room")) return;
  drag = true;
  sx = e.clientX;
  sy = e.clientY;
  stx = tx;
  sty = ty;
  vp.classList.add("dragging");
  vp.setPointerCapture(e.pointerId);
};
vp.onpointermove = (e) => {
  if (drag) {
    tx = stx + e.clientX - sx;
    ty = sty + e.clientY - sy;
    apply();
  }
};
vp.onpointerup = () => {
  drag = false;
  vp.classList.remove("dragging");
};
document.querySelector("#plus").onclick = () => setScale(scale * 1.15);
document.querySelector("#minus").onclick = () => setScale(scale * 0.85);
document.querySelector("#reset").onclick = () => {
  scale = 0.78;
  tx = 25;
  ty = 55;
  apply();
};
document.querySelectorAll(".filter").forEach(
  (btn) =>
    (btn.onclick = () => {
      document
        .querySelectorAll(".filter")
        .forEach((x) => x.classList.remove("active"));
      btn.classList.add("active");
      const f = btn.dataset.filter;
      document
        .querySelectorAll(".room")
        .forEach((r) =>
          r.classList.toggle("filtered", f !== "all" && r.dataset.status !== f),
        );
    }),
);
document.querySelector("#networkToggle").onclick = (e) => {
  const hidden = document
    .querySelector("#nodeLayer")
    .classList.toggle("hidden");
  e.currentTarget.classList.toggle("active", !hidden);
  e.currentTarget.setAttribute("aria-pressed", String(!hidden));
};
const platformModal = document.querySelector("#platformModal"),
  platformFields = {
    environment: "#cfgEnvironment",
    backendBaseUrl: "#cfgBackend",
    healthPath: "#cfgHealth",
    agentPath: "#cfgAgent",
    streamUrl: "#cfgStream",
    provider: "#cfgProvider",
    model: "#cfgModel",
    temperature: "#cfgTemperature",
    topP: "#cfgTopP",
    maxTokens: "#cfgTokens",
    timeoutMs: "#cfgTimeout",
  };
let platformSocket = null;
function platformStatus(message, state = "") {
  const el = document.querySelector("#platformStatus");
  el.className = "platform-status " + state;
  el.querySelector("span").textContent = message;
}
function fillPlatform() {
  Object.entries(platformFields).forEach(
    ([key, selector]) =>
      (document.querySelector(selector).value = platformConfig[key]),
  );
}
function nodeById(id) {
  return areas.flatMap((area) => area.nodes).find((node) => node.id === id);
}
function areaForNode(id) {
  return areas.find((area) => area.nodes.some((node) => node.id === id));
}
function setFloorNodeState(id, state, detail, at = Date.now()) {
  if (!nodeById(id)) return;
  if (!Number.isFinite(at) || (floorNodeState.get(id)?.at || 0) > at) return;
  const normalized = [
      "running",
      "ok",
      "approved",
      "blocked",
      "veto",
      "error",
      "skipped",
    ].includes(state)
      ? state
      : "idle",
    viewState =
      normalized === "approved"
        ? "ok"
        : normalized === "veto"
          ? "blocked"
          : normalized;
  floorNodeState.set(id, {
    state: viewState,
    detail: String(detail || "evento recibido"),
    at,
  });
  const element = document.querySelector(`.agent[data-node-id="${id}"]`),
    area = areaForNode(id);
  if (element) {
    element.classList.remove(
      "idle",
      "running",
      "ok",
      "blocked",
      "error",
      "skipped",
    );
    element.classList.add(viewState);
    element.dataset.state = viewState;
    element.title = String(detail || "evento recibido");
  }
  if (area) {
    const room = document.querySelector(`.room[data-id="${area.id}"]`);
    if (room)
      room.dataset.status =
        viewState === "error" || viewState === "blocked"
          ? "alert"
          : viewState === "running"
            ? "thinking"
            : "active";
  }
  if (selectedNodeId === id) showModel(nodeById(id).label, id);
}
function pulseFloorLink(from, to) {
  const link = floorLinks.find(
      (candidate) => candidate.from === from && candidate.to === to,
    ),
    element = link && document.querySelector(`[data-link-id="${link.id}"]`);
  if (!element) return;
  element.classList.add("live");
  setTimeout(() => element.classList.remove("live"), 1800);
}
function applyFloorEvent(message) {
  if (message.type === "market.snapshot" || message.type === "market.ticker") {
    applyMarketObservation(
      message.type === "market.ticker"
        ? { symbol: message.data?.symbol, ticker: message.data }
        : message,
    );
    return;
  }
  const eventKey = `${message.type}:${message.report?.asset || message.result?.agent_id || message.asset || ""}:${message.stage?.name || ""}`,
    eventTime =
      message.observedAt ||
      message.report?.at ||
      message.stage?.at ||
      Date.now(),
    eventAt = typeof eventTime === "number" ? eventTime : Date.parse(eventTime),
    signature = JSON.stringify(message);
  if (floorObservations.get(eventKey) === signature) return;
  floorObservations.set(eventKey, signature);
  if (floorObservations.size > 200)
    floorObservations.delete(floorObservations.keys().next().value);
  if (message.type === "agent.result" && message.result) {
    const node = areas
      .flatMap((area) => area.nodes)
      .find(
        (candidate) =>
          candidate.agent === message.result.agent_id ||
          candidate.label === message.result.agent_id,
      );
    if (node) {
      floorObservations.set(node.id, { confidence: message.result.confidence });
      setFloorNodeState(
        node.id,
        "ok",
        `signal ${Number(message.result.signal || 0).toFixed(3)}`,
        eventAt,
      );
      recordNodeEvent(node.id, {
        at: new Date(eventAt).toISOString(),
        type: message.type,
        source:
          message.result.provider ||
          message.result.fallback?.engine ||
          "agent gateway",
        status: "ok",
        input: { requestId: message.request_id || null },
        evidence: message.result.evidence,
        formula: message.result.formula,
        output: {
          signal: message.result.signal,
          confidence: message.result.confidence,
          fallback: message.result.fallback || null,
        },
      });
    }
    pulseFloorLink("intake", "desks");
    return;
  }
  if (message.type === "desk.analysis" && message.report) {
    const report = message.report,
      status = report.status === "ok" ? "ok" : "blocked";
    floorObservations.set("consensus.signal", {
      confidence: report.confidence,
    });
    floorObservations.set(`desk.${String(report.asset).toLowerCase()}`, {
      confidence: report.confidence,
      analysis: true,
    });
    setFloorNodeState(
      `desk.${String(report.asset).toLowerCase()}`,
      status,
      `${report.action || "NO_TRADE"} · confianza ${Number(report.confidence || 0).toFixed(2)}`,
      eventAt,
    );
    recordNodeEvent(`desk.${String(report.asset).toLowerCase()}`, {
      type: message.type,
      source: `${report.product || report.asset} desk`,
      status,
      input: report.inputSummary,
      evidence: report.blockers?.length
        ? report.blockers
        : "quality checks passed",
      formula: report.formula,
      output: {
        action: report.action,
        signal: report.signal,
        confidence: report.confidence,
        agreement: report.agreement,
      },
      at: report.at,
    });
    for (const result of report.agents || []) {
      const node = areas
        .flatMap((area) => area.nodes)
        .find(
          (candidate) =>
            candidate.agent === result.agent ||
            candidate.label === result.agent,
        );
      if (node) {
        floorObservations.set(node.id, { confidence: result.confidence });
        setFloorNodeState(
          node.id,
          status,
          `signal ${Number(result.signal || 0).toFixed(3)} · confianza ${Number(result.confidence || 0).toFixed(2)}`,
          eventAt,
        );
        recordNodeEvent(node.id, {
          type: "desk.agent-result",
          source: `${report.asset} desk`,
          status,
          input: report.inputSummary,
          evidence: result.evidence,
          formula: result.formula,
          output: {
            signal: result.signal,
            confidence: result.confidence,
            metadata: result.metadata,
          },
          at: report.at,
        });
      }
    }
    setFloorNodeState(
      "consensus.signal",
      status,
      `${report.action || "NO_TRADE"} · signal ${Number(report.signal || 0).toFixed(3)}`,
      eventAt,
    );
    recordNodeEvent("consensus.signal", {
      type: "desk.consensus",
      source: `${report.asset} desk`,
      status,
      input: (report.agents || []).map(({ agent, signal, confidence }) => ({
        agent,
        signal,
        confidence,
      })),
      evidence: report.blockers,
      formula: report.formula,
      output: report.consensus || {
        action: report.action,
        signal: report.signal,
        confidence: report.confidence,
      },
      at: report.at,
    });
    pulseFloorLink("desks", "consensus");
    return;
  }
  if (message.type === "pipeline.stage" && message.stage) {
    const ids = {
        intake: "intake.data",
        signal: "consensus.signal",
        proposal: "portfolio.manager",
        risk: "risk.manager",
        execution: "execution.queue",
        reconcile: "audit.writer",
        error: "sre.anomaly",
      },
      id = ids[message.stage.name];
    if (id) {
      setFloorNodeState(
        id,
        message.stage.status,
        `${message.asset || "pipeline"} · run ${message.runId || "—"}`,
        eventAt,
      );
      recordNodeEvent(id, {
        type: `pipeline.${message.stage.name}`,
        source: `${message.asset || "pipeline"} orchestrator`,
        status: message.stage.status,
        input: {
          runId: message.runId,
          asset: message.asset,
        },
        evidence: message.stage.payload?.blockers,
        formula: message.stage.payload?.formula,
        output: message.stage.payload,
        at: message.stage.at,
      });
    }
    const flow = {
      signal: ["desks", "consensus"],
      risk: ["consensus", "risk"],
      execution: ["risk", "execution"],
      reconcile: ["execution", "audit"],
    }[message.stage.name];
    if (flow) pulseFloorLink(...flow);
  }
  renderLiveEmployee();
}
function observeFloorNode(
  id,
  {
    at = Date.now(),
    state = "ok",
    detail,
    input,
    output,
    evidence,
    formula,
    source = "backend",
  },
) {
  if (!nodeById(id)) return;
  const timestamp = typeof at === "number" ? at : Date.parse(at),
    signature = JSON.stringify({ timestamp, state, detail, input, output });
  if (
    !Number.isFinite(timestamp) ||
    floorObservations.get(`snapshot:${id}`) === signature
  )
    return;
  floorObservations.set(`snapshot:${id}`, signature);
  if ((floorNodeState.get(id)?.at || 0) > timestamp) return;
  setFloorNodeState(id, state, detail, timestamp);
  recordNodeEvent(id, {
    at: new Date(timestamp).toISOString(),
    type: "observación",
    source,
    status: state,
    input,
    output,
    evidence,
    formula,
  });
  renderLiveEmployee();
}
function applyMarketObservation(snapshot) {
  const ticker = snapshot.ticker,
    asset = String(snapshot.symbol || "").split("-")[0];
  if (
    !["BTC", "ETH", "SOL", "BNB"].includes(asset) ||
    !Number.isFinite(ticker?.price)
  )
    return;
  const at = ticker.receivedAt || ticker.exchangeAt,
    state =
      snapshot.health && snapshot.health.status !== "healthy"
        ? "blocked"
        : "ok",
    observation = {
      at,
      state,
      detail: `${asset}: ${ticker.price} USD · ${ticker.source || "feed"} · dato de mercado`,
      source: ticker.source || "data plane",
      input: { symbol: snapshot.symbol, receivedAt: at },
      output: {
        price: ticker.price,
        bid: ticker.bid,
        ask: ticker.ask,
        bids: snapshot.book?.bids?.length,
        asks: snapshot.book?.asks?.length,
      },
      evidence: snapshot.reconciliation,
    };
  if (!at) return;
  const priceLabel = document.querySelector(`#floorPrice${asset}`);
  priceLabel.textContent = ticker.price.toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
  priceLabel.title = `USD · ${ticker.source || "feed"} · ${at}`;
  observeFloorNode("intake.data", observation);
  observeFloorNode("sre.feeds", observation);
  const desk = `desk.${asset.toLowerCase()}`;
  if (!floorObservations.get(desk)?.analysis)
    observeFloorNode(desk, {
      ...observation,
      detail: `${observation.detail} · esperando análisis`,
    });
  pulseFloorLink("intake", "desks");
}
async function syncFloor() {
  if (floorSyncBusy) return;
  floorSyncBusy = true;
  const base = platformConfig.backendBaseUrl,
    controller = new AbortController(),
    timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(base + "/v1/floor/snapshot", {
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const snapshot = await response.json();
    if (snapshot.paperOnly !== true || !Array.isArray(snapshot.markets))
      throw new Error("invalid-floor-snapshot");
    if (base !== platformConfig.backendBaseUrl) return;
    floorLastSync = Date.now();
    for (const market of snapshot.markets) applyMarketObservation(market);
    for (const event of snapshot.events || []) applyFloorEvent(event);
    for (const intel of snapshot.intelligence || []) {
      for (const node of intel.nodes || []) {
        const id = { news: "intake.news", market: "intake.intel" }[node.id];
        if (!id) continue;
        floorObservations.set(id, { confidence: node.confidence });
        observeFloorNode(id, {
          at: intel.asOf,
          state: node.observations ? "ok" : "blocked",
          detail: `${intel.asset} · ${node.employee} · ${node.observations} observaciones`,
          input: { asset: intel.asset, observations: node.observations },
          output: { signal: node.signal, confidence: node.confidence },
          evidence: intel.provenance,
          formula: node.method,
          source: "intelligence DAG",
        });
      }
    }
    if (snapshot.pipeline) {
      const p = snapshot.pipeline;
      observeFloorNode("risk.manager", {
        at: snapshot.at,
        state:
          p.halted || p.risk?.lastReview?.approved === false ? "blocked" : "ok",
        detail: p.halted
          ? `HALT: ${p.haltReason || "riesgo bloqueado"}`
          : p.risk?.lastReview
            ? `Última revisión: ${p.risk.lastReview.approved ? "aprobada" : "veto"} · ${(p.risk.lastReview.failed || []).join(", ")}`
            : "Risk Gate disponible · esperando propuesta",
        output: p.risk,
      });
      observeFloorNode("portfolio.manager", {
        at: snapshot.at,
        detail: "Observando saldos y posiciones paper",
        output: p.portfolio,
      });
      observeFloorNode("audit.writer", {
        at: snapshot.at,
        state: p.audit?.valid === false ? "error" : "ok",
        detail: "Verificación de cadena de auditoría",
        output: p.audit,
      });
    }
    if (snapshot.execution)
      observeFloorNode("execution.queue", {
        at: snapshot.at,
        detail: `${snapshot.execution.queue} órdenes paper en cola`,
        output: {
          queue: snapshot.execution.queue,
          metrics: snapshot.execution.metrics,
        },
      });
  } catch (error) {
    platformStatus(`Mapa sin sincronización · ${error.message}`, "error");
  } finally {
    clearTimeout(timeout);
    floorSyncBusy = false;
    renderLiveEmployee();
  }
}
async function loadFloorTopology() {
  try {
    const response = await fetch(
      platformConfig.backendBaseUrl + "/v1/floor/topology",
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const topology = await response.json();
    if (
      topology.paperOnly !== true ||
      !Array.isArray(topology.areas) ||
      topology.areas.length !== 9
    )
      throw new Error("invalid-topology");
    const selectedArea = document.querySelector(".room.selected")?.dataset.id,
      previousNode = selectedNodeId;
    areas = normalizeAreas(topology.areas);
    floorLinks = Array.isArray(topology.links) ? topology.links : floorLinks;
    renderFloor();
    if (selectedArea) {
      selectArea(
        areas.find((area) => String(area.id) === selectedArea) || areas[0],
      );
      if (nodeById(previousNode))
        showModel(nodeById(previousNode).label, previousNode);
    }
    syncFloor();
  } catch (error) {
    document
      .querySelector("#platformStatus")
      ?.setAttribute("data-topology", "fallback");
  }
}
function readPlatform() {
  return Object.fromEntries(
    Object.entries(platformFields).map(([key, selector]) => [
      key,
      document.querySelector(selector).value,
    ]),
  );
}
function openPlatform() {
  fillPlatform();
  platformStatus(
    `Perfil ${platformConfig.environment} · ${platformConfig.provider}`,
  );
  platformModal.classList.add("open");
  platformModal.setAttribute("aria-hidden", "false");
}
function closePlatform() {
  platformModal.classList.remove("open");
  platformModal.setAttribute("aria-hidden", "true");
}
document.querySelector("#platformOpen").onclick = openPlatform;
document.querySelector("#platformClose").onclick = closePlatform;
platformModal.onclick = (e) => {
  if (e.target === platformModal) closePlatform();
};
function connectPlatformStream() {
  clearTimeout(floorReconnect);
  if (platformSocket) {
    platformSocket.onclose = null;
    platformSocket.close();
  }
  floorConnected = false;
  try {
    platformSocket = new WebSocket(platformConfig.streamUrl);
    platformSocket.onopen = () => {
      floorConnected = true;
      syncFloor();
      platformStatus("Gateway y stream conectados · esperando eventos", "ok");
    };
    platformSocket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        applyFloorEvent(message);
        if (message.type === "agent.result") {
          engine.events++;
          document.querySelector("#eventCount").textContent = engine.events
            .toLocaleString("en-US")
            .padStart(7, "0");
          document.querySelector("#signal").textContent =
            `STREAM · ${message.result.agent_id} · ${Number(message.result.signal).toFixed(2)}`;
        }
      } catch (e) {}
    };
    platformSocket.onclose = () => {
      floorConnected = false;
      renderLiveEmployee();
      floorReconnect = setTimeout(connectPlatformStream, 5000);
      if (platformModal.classList.contains("open"))
        platformStatus(
          "Stream desconectado · el modo local sigue disponible",
          "error",
        );
    };
  } catch (error) {
    platformStatus(`Stream inválido · ${error.message}`, "error");
  }
}
async function refreshMarketData() {
  const button = document.querySelector("#refreshData");
  button.disabled = true;
  try {
    const [healthResponse, snapshotResponse] = await Promise.all([
      fetch(platformConfig.backendBaseUrl + "/v1/data/health"),
      fetch(platformConfig.backendBaseUrl + "/v1/data/snapshot/BTC-USD"),
    ]);
    if (!healthResponse.ok || !snapshotResponse.ok)
      throw new Error(
        `HTTP ${healthResponse.status}/${snapshotResponse.status}`,
      );
    const health = await healthResponse.json(),
      snapshot = await snapshotResponse.json();
    renderMarketData(health, snapshot);
  } catch (error) {
    try {
      const fallback = await publicMarketFallback();
      renderMarketData(fallback.health, fallback.snapshot);
    } catch (fallbackError) {
      document.querySelector("#dataStatus").textContent = "OFFLINE";
      document.querySelector("#dataStatus").style.color = "var(--red)";
      document.querySelector("#dataDetail").textContent =
        `Data Plane no disponible · ${error.message} · fallback ${fallbackError.message}`;
    }
  } finally {
    button.disabled = false;
  }
}
function renderMarketData(health, snapshot) {
  const book = snapshot.book || {},
    ticker = snapshot.ticker || {};
  document.querySelector("#dataSource").textContent =
    `${(health.source?.source || "—").toUpperCase()} + ${(health.secondary?.source || "—").toUpperCase()}`;
  document.querySelector("#dataStatus").textContent = (
    health.status || "unknown"
  ).toUpperCase();
  document.querySelector("#dataStatus").style.color =
    health.status === "healthy" ? "var(--lime)" : "var(--orange)";
  document.querySelector("#dataPrice").textContent = ticker.price
    ? "$" +
      Number(ticker.price).toLocaleString(undefined, {
        maximumFractionDigits: 2,
      })
    : "—";
  document.querySelector("#dataSpread").textContent = Number.isFinite(
    book.spreadBps,
  )
    ? book.spreadBps.toFixed(2) + " bps"
    : "—";
  document.querySelector("#dataImbalance").textContent = Number.isFinite(
    book.imbalance,
  )
    ? book.imbalance.toFixed(3)
    : "—";
  document.querySelector("#dataEvents").textContent = Number(
    health.metrics?.events || 0,
  ).toLocaleString();
  document.querySelector("#dataDetail").textContent =
    `${health.products?.join(", ") || "sin productos"} · ciclo ${health.metrics?.lastCycleMs || 0}ms · divergencia ${Number(health.maxDivergenceBps || 0).toFixed(2)} bps`;
  document.querySelector("#feedHealth").textContent = (
    health.status || "down"
  ).toUpperCase();
}
async function publicMarketFallback() {
  const started = Date.now(),
    [coinbaseResponse, krakenResponse] = await Promise.all([
      fetch("https://api.exchange.coinbase.com/products/BTC-USD/ticker"),
      fetch("https://api.kraken.com/0/public/Ticker?pair=XBTUSD"),
    ]);
  if (!coinbaseResponse.ok || !krakenResponse.ok)
    throw new Error(`HTTP ${coinbaseResponse.status}/${krakenResponse.status}`);
  const coinbase = await coinbaseResponse.json(),
    kraken = await krakenResponse.json(),
    krakenTicker = Object.values(kraken.result || {})[0],
    prices = [Number(coinbase.price), Number(krakenTicker?.c?.[0])];
  if (!prices.every(Number.isFinite)) throw new Error("invalid-public-market");
  const bid = Number(coinbase.bid),
    ask = Number(coinbase.ask),
    midpoint = (bid + ask) / 2,
    spreadBps =
      Number.isFinite(midpoint) && midpoint > 0
        ? ((ask - bid) / midpoint) * 10000
        : null,
    divergenceBps =
      (Math.abs(prices[0] - prices[1]) / ((prices[0] + prices[1]) / 2)) * 10000;
  return {
    health: {
      status: "healthy",
      products: ["BTC-USD"],
      source: { source: "coinbase" },
      secondary: { source: "kraken" },
      metrics: { events: 2, lastCycleMs: Date.now() - started },
      maxDivergenceBps: divergenceBps,
    },
    snapshot: {
      ticker: {
        symbol: "BTC-USD",
        price: (prices[0] + prices[1]) / 2,
        receivedAt: new Date().toISOString(),
      },
      book: { spreadBps, imbalance: null },
    },
  };
}
document.querySelector("#refreshData").onclick = refreshMarketData;
const desksModal = document.querySelector("#desksModal"),
  deskState = { asset: "BTC", desks: [] };
function closeDesks() {
  desksModal.classList.remove("open");
  desksModal.setAttribute("aria-hidden", "true");
}
async function openDesks() {
  desksModal.classList.add("open");
  desksModal.setAttribute("aria-hidden", "false");
  try {
    const response = await fetch(platformConfig.backendBaseUrl + "/v1/desks");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    deskState.desks = (await response.json()).desks;
    document.querySelector("#deskTabs").innerHTML = deskState.desks
      .map(
        (x) =>
          `<button data-asset="${esc(x.asset)}" class="${x.asset === deskState.asset ? "active" : ""}"><b>${esc(x.asset)}</b><small>${esc(x.product)}</small></button>`,
      )
      .join("");
    document.querySelectorAll("#deskTabs button").forEach(
      (x) =>
        (x.onclick = () => {
          deskState.asset = x.dataset.asset;
          document
            .querySelectorAll("#deskTabs button")
            .forEach((y) => y.classList.toggle("active", y === x));
          resetDesk();
        }),
    );
  } catch (error) {
    document.querySelector("#deskPolicy").textContent =
      `Gateway no disponible · ${error.message}`;
  }
}
function resetDesk() {
  ["deskAction", "deskSignal", "deskConfidence", "deskAgreement"].forEach(
    (id) => (document.querySelector("#" + id).textContent = "—"),
  );
  document.querySelector("#deskAgents").innerHTML = "";
  document.querySelector("#deskPolicy").textContent =
    `${deskState.asset} · listo para consultar datos reales`;
}
function renderDesk(report) {
  document.querySelector("#deskAction").textContent = report.action;
  document.querySelector("#deskAction").style.color =
    report.action === "LONG"
      ? "var(--lime)"
      : report.action === "SHORT"
        ? "var(--red)"
        : report.action === "NO_TRADE"
          ? "var(--orange)"
          : "var(--cyan)";
  document.querySelector("#deskSignal").textContent = Number(
    report.signal,
  ).toFixed(3);
  document.querySelector("#deskConfidence").textContent =
    (report.confidence * 100).toFixed(1) + "%";
  document.querySelector("#deskAgreement").textContent =
    (report.agreement * 100).toFixed(1) + "%";
  document.querySelector("#deskAgents").innerHTML = report.agents
    .map(
      (x) =>
        `<article class="desk-agent" style="--agent-color:${x.signal >= 0 ? "#b9f34a" : "#ff5864"}"><div><b>${esc(x.agent)}</b><i>${x.signal >= 0 ? "+" : ""}${esc(x.signal.toFixed(3))} · ${esc((x.confidence * 100).toFixed(0))}%</i></div><meter min="-1" max="1" value="${esc(x.signal)}"></meter><small>${esc(x.evidence.join(" · "))}</small></article>`,
    )
    .join("");
  document.querySelector("#deskPolicy").textContent = report.blockers.length
    ? `BLOQUEADA · ${report.blockers.join(" · ")}`
    : `${report.policy.riskClass} · peso máximo ${(report.policy.maxPortfolioWeight * 100).toFixed(0)}% · PAPER ONLY`;
}
document.querySelector("#desksOpen").onclick = openDesks;
document.querySelector("#desksClose").onclick = closeDesks;
desksModal.onclick = (e) => {
  if (e.target === desksModal) closeDesks();
};
document.querySelector("#runDesk").onclick = async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  btn.textContent = "ANALIZANDO…";
  try {
    const response = await fetch(
        `${platformConfig.backendBaseUrl}/v1/desks/${deskState.asset}/analyze`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        },
      ),
      report = await response.json();
    if (!response.ok)
      throw new Error(report.error || `HTTP ${response.status}`);
    renderDesk(report);
  } catch (error) {
    document.querySelector("#deskPolicy").textContent =
      `Análisis falló · ${error.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = "EJECUTAR MESA";
  }
};
const pipelineModal = document.querySelector("#pipelineModal");
function closePipeline() {
  pipelineModal.classList.remove("open");
  pipelineModal.setAttribute("aria-hidden", "true");
}
async function pipelineStatus() {
  try {
    const response = await fetch(
        platformConfig.backendBaseUrl + "/v1/pipeline/status",
      ),
      x = await response.json();
    if (!response.ok) throw new Error(x.error);
    document.querySelector("#pipelineState").textContent = x.halted
      ? "HALTED"
      : "READY";
    document.querySelector("#pipelineState").style.color = x.halted
      ? "var(--red)"
      : "var(--lime)";
    document.querySelector("#pipelineEquity").textContent =
      "$" +
      Number(x.portfolio.equity).toLocaleString(undefined, {
        maximumFractionDigits: 0,
      });
    document.querySelector("#pipelineCash").textContent =
      "$" +
      Number(x.portfolio.cash).toLocaleString(undefined, {
        maximumFractionDigits: 0,
      });
    document.querySelector("#pipelineFills").textContent = x.portfolio.fills;
    document.querySelector("#pipelineAudit").textContent = x.audit.valid
      ? `${x.audit.count} OK`
      : "BROKEN";
  } catch (error) {
    document.querySelector("#pipelineMessage").textContent =
      `Pipeline offline · ${error.message}`;
  }
}
document.querySelector("#pipelineOpen").onclick = () => {
  pipelineModal.classList.add("open");
  pipelineModal.setAttribute("aria-hidden", "false");
  pipelineStatus();
};
document.querySelector("#pipelineClose").onclick = closePipeline;
pipelineModal.onclick = (e) => {
  if (e.target === pipelineModal) closePipeline();
};
function renderPipeline(run) {
  document.querySelector("#pipelineStages").innerHTML = run.stages
    .map(
      (x, i) =>
        `<li class="${esc(x.status)}"><b>${esc(String(i + 1).padStart(2, "0"))} · ${esc(x.name.toUpperCase())}</b>${esc(x.status.toUpperCase())}</li>`,
    )
    .join("");
  document.querySelector("#pipelineMessage").textContent =
    run.status === "completed"
      ? `PAPER FILL · ${run.execution.fill.side} ${run.execution.fill.qty.toFixed(6)} ${run.product} @ $${run.execution.fill.price.toFixed(2)} · fee $${run.execution.fill.fee.toFixed(2)}`
      : run.status === "veto"
        ? `RISK VETO · ${run.risk.failed.join(", ")}`
        : run.status === "no-trade"
          ? `SIN OPERACIÓN · ${run.desk.action} · ${run.desk.blockers.join(", ") || "señal neutral"}`
          : `${run.status.toUpperCase()} · ${run.error || run.execution?.reason || ""}`;
  pipelineStatus();
}
document.querySelector("#pipelineRun").onclick = async (e) => {
  const btn = e.currentTarget,
    asset = document.querySelector("#pipelineAsset").value;
  btn.disabled = true;
  btn.textContent = "PROCESANDO…";
  document.querySelector("#pipelineStages").innerHTML = "";
  try {
    const response = await fetch(
        `${platformConfig.backendBaseUrl}/v1/pipeline/${asset}/run`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ runId: `ui-${asset}-${Date.now()}` }),
        },
      ),
      run = await response.json();
    if (!response.ok) throw new Error(run.error || `HTTP ${response.status}`);
    renderPipeline(run);
  } catch (error) {
    document.querySelector("#pipelineMessage").textContent =
      `Pipeline falló · ${error.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = "▶ EJECUTAR CICLO";
  }
};
document.querySelector("#pipelineHalt").onclick = async () => {
  await fetch(platformConfig.backendBaseUrl + "/v1/pipeline/halt", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: '{"reason":"human-director"}',
  });
  pipelineStatus();
};
document.querySelector("#pipelineResume").onclick = async () => {
  await fetch(platformConfig.backendBaseUrl + "/v1/pipeline/resume", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  pipelineStatus();
};
const dashboardModal = document.querySelector("#dashboardModal");
let dashboardData = null;
function closeDashboard() {
  dashboardModal.classList.remove("open");
  dashboardModal.setAttribute("aria-hidden", "true");
}
function pct(x) {
  return (Number(x || 0) * 100).toFixed(2) + "%";
}
function money(x) {
  return (
    "$" + Number(x || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })
  );
}
function drawEquity(points) {
  const svg = document.querySelector("#dashChart");
  if (!points.length) {
    svg.innerHTML = "";
    document.querySelector("#dashChartRange").textContent = "sin datos";
    return;
  }
  const values = points.map((x) => x.equity),
    min = Math.min(...values),
    max = Math.max(...values),
    range = max - min || 1,
    coords = values
      .map(
        (v, i) =>
          `${(i / (values.length - 1 || 1)) * 700},${140 - ((v - min) / range) * 130}`,
      )
      .join(" ");
  const area = `M 0 150 L ${coords.replaceAll(" ", " L ")} L 700 150 Z`;
  svg.innerHTML = `<path class="chart-area" d="${area}"/><polyline points="${coords}"/>`;
  document.querySelector("#dashChartRange").textContent =
    `${money(min)} → ${money(max)}`;
}
function inspectRun(run) {
  document.querySelector("#runInspector").innerHTML =
    `<b>${esc(run.id)}</b> · ${esc(run.asset)} · ${esc(run.status.toUpperCase())}<br>Signal ${esc(Number(run.desk?.signal || 0).toFixed(3))} / ${esc((Number(run.desk?.confidence || 0) * 100).toFixed(1))}% · Risk ${esc(run.risk?.decision || "N/A")} · ${esc(run.stages.map((x) => x.name + ":" + x.status).join(" → "))}`;
}
function renderDashboard(x) {
  dashboardData = x;
  document.querySelector("#dashEquity").textContent = money(x.portfolio.equity);
  document.querySelector("#dashReturn").textContent = pct(x.performance.return);
  document.querySelector("#dashDrawdown").textContent = pct(
    x.performance.maxDrawdown,
  );
  document.querySelector("#dashVar").textContent = pct(x.performance.var95);
  document.querySelector("#dashCvar").textContent = pct(x.performance.cvar95);
  document.querySelector("#dashGross").textContent = pct(
    x.risk.grossExposureRatio,
  );
  document.querySelector("#dashFees").textContent =
    "$" + Number(x.execution.fees || 0).toFixed(2);
  document.querySelector("#dashLatency").textContent =
    Number(x.system.latency.p95 || 0).toFixed(0) + "ms";
  drawEquity(x.performance.equityCurve);
  document.querySelector("#dashAlerts").innerHTML = x.alerts.length
    ? x.alerts
        .map(
          (a) =>
            `<div class="dash-alert ${esc(a.severity)}"><b>${esc(a.code)}</b>${esc(a.message)}</div>`,
        )
        .join("")
    : '<div class="dash-alert"><b>SIN ALERTAS</b>Sistema dentro de límites.</div>';
  document.querySelector("#dashRuns").innerHTML = x.recentRuns
    .map(
      (r, i) =>
        `<div class="dash-run" data-run="${i}"><b>${esc(r.asset)}</b><span>${esc(r.status)}</span><span>${esc(r.desk?.action || "—")}</span><span>${esc(new Date(r.finishedAt).toLocaleTimeString())}</span></div>`,
    )
    .join("");
  document
    .querySelectorAll(".dash-run")
    .forEach(
      (el) => (el.onclick = () => inspectRun(x.recentRuns[+el.dataset.run])),
    );
}
async function refreshDashboard() {
  const btn = document.querySelector("#dashboardRefresh");
  btn.disabled = true;
  try {
    const response = await fetch(
        platformConfig.backendBaseUrl + "/v1/dashboard/overview",
      ),
      x = await response.json();
    if (!response.ok) throw new Error(x.error || `HTTP ${response.status}`);
    renderDashboard(x);
  } catch (error) {
    document.querySelector("#runInspector").textContent =
      `Dashboard offline · ${error.message}`;
  } finally {
    btn.disabled = false;
  }
}
document.querySelector("#dashboardOpen").onclick = () => {
  dashboardModal.classList.add("open");
  dashboardModal.setAttribute("aria-hidden", "false");
  refreshDashboard();
};
document.querySelector("#dashboardClose").onclick = closeDashboard;
dashboardModal.onclick = (e) => {
  if (e.target === dashboardModal) closeDashboard();
};
document.querySelector("#dashboardRefresh").onclick = refreshDashboard;
document.querySelector("#dashboardExport").onclick = () =>
  window.open(
    platformConfig.backendBaseUrl + "/v1/dashboard/export.csv",
    "_blank",
  );
const researchModal = document.querySelector("#researchModal");
let researchCandidate = null;
function closeResearch() {
  researchModal.classList.remove("open");
  researchModal.setAttribute("aria-hidden", "true");
}
function renderResearch(x) {
  researchCandidate = x;
  const m = x.metrics;
  document.querySelector("#researchSharpe").textContent = m.sharpe.toFixed(2);
  document.querySelector("#researchDsr").textContent = pct(
    m.deflatedSharpeProbability,
  );
  document.querySelector("#researchPbo").textContent = pct(m.pbo);
  document.querySelector("#researchOos").textContent = m.oosSharpe.toFixed(2);
  document.querySelector("#researchDd").textContent = pct(m.maxDrawdown);
  document.querySelector("#researchStability").textContent = pct(m.stability);
  document.querySelector("#researchGates").innerHTML = Object.entries(x.checks)
    .map(
      ([k, v]) =>
        `<div class="research-gate ${v ? "pass" : ""}"><b>${esc(k)}</b><span>${v ? "PASS" : "FAIL"}</span></div>`,
    )
    .join("");
  document.querySelector("#researchFolds").innerHTML = x.foldMetrics
    .map(
      (f) =>
        `<div class="research-fold"><b>F${esc(f.fold + 1)}</b><span>IS ${esc(f.trainSharpe.toFixed(2))}</span><span>OOS ${esc(f.oosSharpe.toFixed(2))}</span></div>`,
    )
    .join("");
  document.querySelector("#researchPromote").disabled = x.status !== "eligible";
  document.querySelector("#researchStatus").textContent =
    `${x.id} · ${x.status.toUpperCase()} · ${x.observations} observaciones · PBO ${x.pbo.combinations} combinaciones`;
}
document.querySelector("#researchOpen").onclick = async () => {
  researchModal.classList.add("open");
  researchModal.setAttribute("aria-hidden", "false");
  try {
    const r = await fetch(
        platformConfig.backendBaseUrl + "/v1/research/catalog",
      ),
      x = await r.json();
    if (x.champion)
      document.querySelector("#researchStatus").textContent =
        `Champion: ${x.champion.id} · aprobado por ${x.champion.approvedBy}`;
  } catch (e) {
    document.querySelector("#researchStatus").textContent =
      "Research API sin conexión";
  }
};
document.querySelector("#researchClose").onclick = closeResearch;
researchModal.onclick = (e) => {
  if (e.target === researchModal) closeResearch();
};
document.querySelector("#researchRun").onclick = async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  btn.textContent = "VALIDANDO…";
  try {
    const r = await fetch(
        platformConfig.backendBaseUrl + "/v1/research/evaluate",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            candidateId: `momentum-${Date.now()}`,
            trials: 20,
            folds: 5,
            purge: 3,
            embargo: 2,
          }),
        },
      ),
      x = await r.json();
    if (!r.ok) throw new Error(x.error);
    renderResearch(x);
  } catch (error) {
    document.querySelector("#researchStatus").textContent =
      `Evaluación falló · ${error.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = "EVALUAR CHALLENGER";
  }
};
document.querySelector("#researchPromote").onclick = async () => {
  try {
    const r = await fetch(
        platformConfig.backendBaseUrl + "/v1/research/promote",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            candidateId: researchCandidate?.id,
            approvedBy: document.querySelector("#researchApprover").value,
          }),
        },
      ),
      x = await r.json();
    if (!r.ok) throw new Error(x.error);
    document.querySelector("#researchStatus").textContent =
      `CHAMPION ${x.champion.id} · aprobado por ${x.champion.approvedBy}`;
    document.querySelector("#researchPromote").disabled = true;
  } catch (error) {
    document.querySelector("#researchStatus").textContent =
      `Promoción bloqueada · ${error.message}`;
  }
};
const riskModal = document.querySelector("#riskModal");
function closeRisk() {
  riskModal.classList.remove("open");
  riskModal.setAttribute("aria-hidden", "true");
}
function renderRisk(x) {
  document.querySelector("#riskState").textContent = x.halted
    ? "HALTED"
    : "OPEN";
  document.querySelector("#riskState").style.color = x.halted
    ? "var(--red)"
    : "var(--lime)";
  document.querySelector("#riskHighWater").textContent = money(x.highWater);
  document.querySelector("#riskReviews").textContent = x.reviews;
  document.querySelector("#riskGross").textContent = pct(
    (x.portfolio?.grossExposure || 0) / (x.portfolio?.equity || 1),
  );
  document.querySelector("#riskVarLimit").textContent = pct(x.limits.maxVaR);
  document.querySelector("#riskCvarLimit").textContent = pct(x.limits.maxCVaR);
  document.querySelector("#riskLimits").innerHTML = Object.entries(x.limits)
    .map(
      ([k, v]) =>
        `<div class="risk-limit"><b>${esc(k)}</b><span>${esc(typeof v === "number" && v < 1 ? (v * 100).toFixed(2) + "%" : v)}</span></div>`,
    )
    .join("");
  const r = x.lastReview;
  document.querySelector("#riskChecks").innerHTML = r
    ? r.checks
        .map(
          (c) =>
            `<div class="risk-check ${c.pass ? "pass" : ""}"><b>${esc(c.name)}</b><span>${c.pass ? "PASS" : "VETO"}</span></div>`,
        )
        .join("")
    : "Sin evaluaciones.";
  document.querySelector("#riskStatus").textContent = r
    ? `${r.decision} · VaR ${pct(r.metrics.var)} · CVaR ${pct(r.metrics.cvar)} · DD ${pct(r.metrics.drawdown)} · stress ${pct(r.metrics.stressLossRatio)}`
    : `${x.halted ? "Veto activo: " + x.reason : "Todos los límites operativos"}`;
}
async function refreshRisk() {
  try {
    const r = await fetch(platformConfig.backendBaseUrl + "/v1/risk/status"),
      x = await r.json();
    if (!r.ok) throw new Error(x.error);
    renderRisk(x);
  } catch (error) {
    document.querySelector("#riskStatus").textContent =
      `Risk API offline · ${error.message}`;
  }
}
document.querySelector("#riskOpen").onclick = () => {
  riskModal.classList.add("open");
  riskModal.setAttribute("aria-hidden", "false");
  refreshRisk();
};
document.querySelector("#riskClose").onclick = closeRisk;
riskModal.onclick = (e) => {
  if (e.target === riskModal) closeRisk();
};
document.querySelector("#riskRefresh").onclick = refreshRisk;
document.querySelector("#riskPreview").onclick = async () => {
  const returns = Array.from(
      { length: 90 },
      (_, i) => Math.sin(i * 0.7) * 0.006 - 0.0001,
    ),
    body = {
      proposal: {
        id: `preview-${Date.now()}`,
        symbol: "BTC-USD",
        qty: 0.1,
        notional: 6800,
        confidence: 0.72,
        maxWeight: 0.35,
      },
      context: {
        equity: 100000,
        grossExposure: 12000,
        assetExposure: 6000,
        dataStatus: "healthy",
        returns,
        correlation: 0.55,
        spreadBps: 8,
        exposures: { "ETH-USD": 6000 },
      },
    };
  const r = await fetch(platformConfig.backendBaseUrl + "/v1/risk/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    x = await r.json();
  if (r.ok) await refreshRisk();
  else document.querySelector("#riskStatus").textContent = x.error;
};
document.querySelector("#riskVeto").onclick = async () => {
  await fetch(platformConfig.backendBaseUrl + "/v1/pipeline/halt", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: '{"reason":"risk-manager-manual-veto"}',
  });
  refreshRisk();
};
document.querySelector("#riskResume").onclick = async () => {
  await fetch(platformConfig.backendBaseUrl + "/v1/pipeline/resume", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  refreshRisk();
};
const portfolioModal = document.querySelector("#portfolioModal");
function closePortfolio() {
  portfolioModal.classList.remove("open");
  portfolioModal.setAttribute("aria-hidden", "true");
}
function renderPortfolio(plan, status = {}) {
  document.querySelector("#portfolioEquity").textContent = money(
    plan?.equity || status.portfolio?.equity,
  );
  document.querySelector("#portfolioCash").textContent = plan
    ? pct(plan.cashTarget)
    : "—";
  document.querySelector("#portfolioVol").textContent = plan
    ? pct(plan.diagnostics.annualVolatility)
    : "—";
  document.querySelector("#portfolioDiversification").textContent = plan
    ? plan.diagnostics.diversificationRatio.toFixed(2) + "×"
    : "—";
  document.querySelector("#portfolioTurnover").textContent = plan
    ? pct(plan.rebalancing.turnover)
    : "—";
  document.querySelector("#portfolioApproval").textContent = plan
    ? plan.approval.state.toUpperCase()
    : "—";
  document.querySelector("#portfolioRows").innerHTML = plan
    ? plan.allocations
        .map(
          (x) =>
            `<div class="allocation-row"><b>${esc(x.asset)}</b><span>${esc(pct(x.currentWeight))}</span><span>${esc(pct(x.targetWeight))}</span><span>${esc(pct(x.riskContribution))}</span><span class="${x.tradeWeight >= 0 ? "buy" : "sell"}">${x.tradeWeight >= 0 ? "BUY" : "SELL"} ${esc(money(Math.abs(x.tradeNotional)))}</span></div>`,
        )
        .join("")
    : "";
  document.querySelector("#portfolioStatus").textContent = plan
    ? `${plan.method.toUpperCase()} · ${plan.observations} observaciones · banda ${pct(plan.rebalancing.band)} · ${plan.rebalancing.scaled ? "turnover limitado" : "sin escala"} · requiere aprobación humana`
    : "Portfolio Manager esperando un plan.";
}
async function portfolioStatus() {
  try {
    const r = await fetch(
        platformConfig.backendBaseUrl + "/v1/portfolio/status",
      ),
      x = await r.json();
    if (!r.ok) throw new Error(x.error);
    renderPortfolio(x.lastPlan, x);
  } catch (error) {
    document.querySelector("#portfolioStatus").textContent =
      `Portfolio API offline · ${error.message}`;
  }
}
document.querySelector("#portfolioOpen").onclick = () => {
  portfolioModal.classList.add("open");
  portfolioModal.setAttribute("aria-hidden", "false");
  portfolioStatus();
};
document.querySelector("#portfolioClose").onclick = closePortfolio;
portfolioModal.onclick = (e) => {
  if (e.target === portfolioModal) closePortfolio();
};
document.querySelector("#portfolioRefresh").onclick = portfolioStatus;
document.querySelector("#portfolioPlan").onclick = async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  btn.textContent = "OPTIMIZANDO…";
  const matrix = Array.from({ length: 4 }, (_, j) =>
    Array.from(
      { length: 180 },
      (_, i) =>
        Math.sin(i * (0.19 + j * 0.025)) * (0.003 + j * 0.0007) +
        (0.0005 - j * 0.00005),
    ),
  );
  try {
    const r = await fetch(
        platformConfig.backendBaseUrl + "/v1/portfolio/plan",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ returnsMatrix: matrix }),
        },
      ),
      x = await r.json();
    if (!r.ok) throw new Error(x.error);
    renderPortfolio(x);
  } catch (error) {
    document.querySelector("#portfolioStatus").textContent =
      `Optimización falló · ${error.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = "GENERAR PLAN";
  }
};
const executionModal = document.querySelector("#executionModal");
function closeExecution() {
  executionModal.classList.remove("open");
  executionModal.setAttribute("aria-hidden", "true");
}
function renderExecution(x) {
  document.querySelector("#execParents").textContent = x.metrics.parents;
  document.querySelector("#execQueue").textContent = x.queue;
  document.querySelector("#execFills").textContent = x.metrics.fills;
  document.querySelector("#execRejected").textContent = x.metrics.rejected;
  document.querySelector("#execNotional").textContent = money(
    x.metrics.notional,
  );
  document.querySelector("#execFees").textContent =
    "$" + Number(x.metrics.fees).toFixed(2);
  document.querySelector("#executionRows").innerHTML = x.parents
    .map(
      (p) =>
        `<div class="execution-row"><b>${esc(p.id.slice(0, 8))}</b><span>${esc(p.asset)}</span><span>${esc(p.algorithm)}</span><span class="${esc(p.state)}">${esc(p.state.toUpperCase())}</span><span>${esc(money(p.residualNotional))}</span></div>`,
    )
    .join("");
  document.querySelector("#executionStatus").textContent =
    `${x.policy.slices} slices · participación máxima ${pct(x.policy.participationRate)} · ${x.paperOnly ? "PAPER ONLY" : "LIVE"}`;
}
async function executionStatus() {
  try {
    const r = await fetch(
        platformConfig.backendBaseUrl + "/v1/execution/status",
      ),
      x = await r.json();
    if (!r.ok) throw new Error(x.error);
    renderExecution(x);
  } catch (error) {
    document.querySelector("#executionStatus").textContent =
      `Execution API offline · ${error.message}`;
  }
}
document.querySelector("#executionOpen").onclick = () => {
  executionModal.classList.add("open");
  executionModal.setAttribute("aria-hidden", "false");
  executionStatus();
};
document.querySelector("#executionClose").onclick = closeExecution;
executionModal.onclick = (e) => {
  if (e.target === executionModal) closeExecution();
};
document.querySelector("#executionSubmit").onclick = async () => {
  try {
    const p = await fetch(
        platformConfig.backendBaseUrl + "/v1/portfolio/status",
      ),
      ps = await p.json();
    if (!ps.lastPlan) throw new Error("primero generá un plan en CARTERA");
    const prices = { BTC: 68420, ETH: 3600, SOL: 180, BNB: 610 },
      r = await fetch(platformConfig.backendBaseUrl + "/v1/execution/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          planId: ps.lastPlan.id,
          approvedBy: document.querySelector("#executionApprover").value,
          algorithm: document.querySelector("#executionAlgorithm").value,
          prices,
          idempotencyKey: `ui-${ps.lastPlan.id}`,
        }),
      }),
      x = await r.json();
    if (!r.ok) throw new Error(x.error);
    await executionStatus();
    document.querySelector("#executionStatus").textContent =
      `${x.parents.length} parent orders · ${x.queued} child orders en cola · aprobación ${x.approvedBy}`;
  } catch (error) {
    document.querySelector("#executionStatus").textContent =
      `Encolado bloqueado · ${error.message}`;
  }
};
document.querySelector("#executionDrain").onclick = async () => {
  try {
    const r = await fetch(
        platformConfig.backendBaseUrl + "/v1/execution/drain",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: '{"spreadBps":8,"depthNotional":250000}',
        },
      ),
      x = await r.json();
    if (!r.ok) throw new Error(x.error);
    await executionStatus();
    document.querySelector("#executionStatus").textContent =
      `Reconciliado · ${x.filled} fills · ${x.rejected} rechazadas · PAPER ONLY`;
  } catch (error) {
    document.querySelector("#executionStatus").textContent =
      `Ejecución bloqueada · ${error.message}`;
  }
};
const sreModal = document.querySelector("#sreModal");
function closeSre() {
  sreModal.classList.remove("open");
  sreModal.setAttribute("aria-hidden", "true");
}
function renderSre(x) {
  document.querySelector("#sreState").textContent = x.status.toUpperCase();
  document.querySelector("#sreState").style.color =
    x.status === "healthy" ? "var(--lime)" : "var(--red)";
  document.querySelector("#sreAvailability").textContent = pct(
    x.slis.availability,
  );
  document.querySelector("#sreLatency").textContent =
    x.slis.p95LatencyMs + "ms";
  document.querySelector("#sreFreshness").textContent =
    x.slis.dataFreshnessMs === null ? "N/A" : x.slis.dataFreshnessMs + "ms";
  document.querySelector("#sreBurn").textContent =
    x.slis.burnRate.toFixed(2) + "×";
  document.querySelector("#sreAudit").textContent = x.journal.valid
    ? `${x.journal.count} OK`
    : "BROKEN";
  document.querySelector("#sreServices").innerHTML = Object.entries(x.services)
    .map(
      ([k, v]) =>
        `<div class="sre-service ${/halted|disabled|degraded|stopped/.test(v) ? "bad" : ""}"><b>${esc(k)}</b><span>${esc(String(v).toUpperCase())}</span></div>`,
    )
    .join("");
  document.querySelector("#sreIncidents").innerHTML = x.incidents.length
    ? x.incidents
        .map(
          (i) =>
            `<div class="sre-incident"><span><b>${esc(i.code)}</b><br>${esc(i.state)} · ${esc(i.occurrences)}×</span>${i.state === "open" ? `<button data-incident="${esc(i.id)}">ACK</button>` : ""}</div>`,
        )
        .join("")
    : "Sin incidentes.";
  document
    .querySelectorAll("[data-incident]")
    .forEach((b) => (b.onclick = () => ackIncident(b.dataset.incident)));
  document.querySelector("#sreStatus").textContent =
    `SLO availability ${pct(x.slos.availability)} · p95 ≤ ${x.slos.p95LatencyMs}ms · error budget restante ${pct(x.slis.errorBudgetRemaining)} · ${x.backups.length} backups`;
}
async function refreshSre() {
  try {
    const r = await fetch(platformConfig.backendBaseUrl + "/v1/sre/status"),
      x = await r.json();
    if (!r.ok) throw new Error(x.error);
    renderSre(x);
  } catch (error) {
    document.querySelector("#sreStatus").textContent =
      `SRE API offline · ${error.message}`;
  }
}
async function ackIncident(id) {
  const r = await fetch(
      `${platformConfig.backendBaseUrl}/v1/sre/incidents/${id}/ack`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          actor: document.querySelector("#sreActor").value,
        }),
      },
    ),
    x = await r.json();
  if (!r.ok) {
    document.querySelector("#sreStatus").textContent =
      `ACK bloqueado · ${x.error}`;
    return;
  }
  refreshSre();
}
document.querySelector("#sreOpen").onclick = () => {
  sreModal.classList.add("open");
  sreModal.setAttribute("aria-hidden", "false");
  refreshSre();
};
document.querySelector("#sreClose").onclick = closeSre;
sreModal.onclick = (e) => {
  if (e.target === sreModal) closeSre();
};
document.querySelector("#sreRefresh").onclick = refreshSre;
document.querySelector("#sreBackup").onclick = async () => {
  const r = await fetch(platformConfig.backendBaseUrl + "/v1/sre/backup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        actor: document.querySelector("#sreActor").value || "SRE Operator",
      }),
    }),
    x = await r.json();
  if (r.ok) {
    await refreshSre();
    document.querySelector("#sreStatus").textContent =
      `Backup ${x.id.slice(0, 8)} · SHA-256 ${x.digest.slice(0, 16)}… · journal verificado`;
  } else document.querySelector("#sreStatus").textContent = x.error;
};

const aiCostModal = document.querySelector("#aiCostModal");
function closeAiCost() {
  aiCostModal.classList.remove("open");
  aiCostModal.setAttribute("aria-hidden", "true");
}
function aiCostRows(records) {
  const rows = Object.entries(records || {});
  if (!rows.length)
    return '<div class="sre-service"><b>SIN CONSUMO</b><span>$0.00000000</span></div>';
  return rows
    .map(([id, row]) => {
      const used = Number(row.costValue || 0),
        limit = Number(row.limit || 0),
        ratio = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
      return `<div class="sre-service"><b>${esc(id)}</b><span>${esc(row.tokens)} TOK · $${esc(row.cost)}</span><div class="ai-cost-bar"><i style="width:${esc(ratio.toFixed(2))}%"></i></div></div>`;
    })
    .join("");
}
async function refreshAiCost() {
  try {
    const [response, reconciliationResponse] = await Promise.all([
        fetch(platformConfig.backendBaseUrl + "/v1/ai/costs"),
        fetch(platformConfig.backendBaseUrl + "/v1/ai/cost-reconciliation"),
      ]),
      data = await response.json(),
      reconciliation = await reconciliationResponse.json();
    if (!response.ok) throw new Error(data.error || "cost-ledger-unavailable");
    const providerRows = Object.values(data.providers || {}),
      total = providerRows.reduce(
        (sum, row) => sum + Number(row.costValue || 0),
        0,
      ),
      tokens = providerRows.reduce(
        (sum, row) => sum + Number(row.tokens || 0),
        0,
      );
    document.querySelector("#aiCostDay").textContent = data.day;
    document.querySelector("#aiCostTotal").textContent = "$" + total.toFixed(8);
    document.querySelector("#aiCostTokens").textContent =
      tokens.toLocaleString("es-AR");
    document.querySelector("#aiCostReservations").textContent =
      data.reservations;
    document.querySelector("#aiCostInvoices").textContent =
      reconciliation.summary?.invoices || 0;
    document.querySelector("#aiCostAlerts").textContent =
      reconciliation.summary?.alerts || 0;
    document.querySelector("#aiCostSigned").textContent = (
      reconciliation.invoices || []
    ).filter((invoice) => invoice.provenance?.attestation).length;
    document.querySelector("#aiCostProviders").innerHTML = aiCostRows(
      data.providers,
    );
    document.querySelector("#aiCostAgents").innerHTML = aiCostRows(data.agents);
    document.querySelector("#aiCostReconciliation").textContent =
      reconciliationResponse.ok
        ? `CATÁLOGO ${String(reconciliation.catalog?.hash || "—").slice(0, 12)} · ${reconciliation.summary?.invoices || 0} facturas · ${reconciliation.summary?.alerts || 0} alertas de desvío`
        : `CONCILIACIÓN NO DISPONIBLE · ${reconciliation.error || reconciliationResponse.status}`;
    document.querySelector("#aiCostStatus").textContent = data.recovery
      .recovered
      ? `LEDGER RECUPERADO · presupuesto proveedor $${data.policy.providerDailyUsd}/día · empleado $${data.policy.agentDailyUsd}/día`
      : "LEDGER BLOQUEADO · pendiente de recuperación";
  } catch (error) {
    document.querySelector("#aiCostStatus").textContent =
      `AI COST ERROR · ${error.message}`;
  }
}
document.querySelector("#aiCostOpen").onclick = () => {
  aiCostModal.classList.add("open");
  aiCostModal.setAttribute("aria-hidden", "false");
  refreshAiCost();
};
document.querySelector("#aiCostClose").onclick = closeAiCost;
document.querySelector("#aiCostRefresh").onclick = refreshAiCost;
aiCostModal.onclick = (event) => {
  if (event.target === aiCostModal) closeAiCost();
};
const intelligenceModal = document.querySelector("#intelligenceModal");
function closeIntelligence() {
  intelligenceModal.classList.remove("open");
  intelligenceModal.setAttribute("aria-hidden", "true");
}
async function refreshIntelligence() {
  try {
    const [response, dagResponse] = await Promise.all([
        fetch(platformConfig.backendBaseUrl + "/v1/intelligence/status"),
        fetch(platformConfig.backendBaseUrl + "/v1/intelligence/dag/status"),
      ]),
      data = await response.json(),
      dag = await dagResponse.json();
    if (!response.ok)
      throw new Error(data.error || "intelligence-service-unavailable");
    const providers = Object.values(data.providers || {}),
      configured = providers.filter((provider) => provider.configured).length;
    document.querySelector("#intelligenceProviders").innerHTML = providers
      .map(
        (provider) =>
          `<div class="sre-service ${provider.configured && !provider.healthy ? "bad" : ""}"><b>${esc(provider.id.toUpperCase())}</b><span>${provider.configured ? (provider.healthy ? "READY" : "DEGRADED") : "SIN CLAVE"} · READ ONLY · ${esc(provider.requestsLastMinute)}/${esc(provider.limitPerMinute)} RPM</span></div>`,
      )
      .join("");
    const assets = Object.entries(dag.assets || {});
    document.querySelector("#intelligenceDag").innerHTML = assets.length
      ? assets
          .map(
            ([asset, state]) =>
              `<div class="sre-service ${state.status !== "ready" ? "bad" : ""}"><b>INTEL HUB · ${esc(asset)}</b><span>${esc(state.status.toUpperCase())} · confianza ${esc((Number(state.confidence) * 100).toFixed(1))}% · PIT ${esc(new Date(state.asOf).toISOString())}</span></div>`,
          )
          .join("")
      : '<div class="sre-service"><b>INTEL HUB</b><span>SIN SNAPSHOTS · requiere refresh autenticado del DAG</span></div>';
    document.querySelector("#intelligenceStatus").textContent =
      `${configured}/${providers.length} proveedores configurados · ${assets.length} activos con consenso PIT · recovery ${dag.recovery?.recovered ? "VERIFIED" : "PENDING"} · PAPER ONLY`;
  } catch (error) {
    document.querySelector("#intelligenceStatus").textContent =
      `DATA API ERROR · ${error.message}`;
  }
}
document.querySelector("#intelligenceOpen").onclick = () => {
  intelligenceModal.classList.add("open");
  intelligenceModal.setAttribute("aria-hidden", "false");
  refreshIntelligence();
};
document.querySelector("#intelligenceClose").onclick = closeIntelligence;
document.querySelector("#intelligenceRefresh").onclick = refreshIntelligence;
intelligenceModal.onclick = (event) => {
  if (event.target === intelligenceModal) closeIntelligence();
};
document.querySelector("#platformSave").onclick = () => {
  try {
    platformConfig = platformStore.save({
      ...platformConfig,
      ...readPlatform(),
    });
    platformClient.update(platformConfig);
    platformStatus(
      "Configuración válida y guardada · conectando stream…",
      "ok",
    );
    connectPlatformStream();
  } catch (e) {
    platformStatus(e.message, "error");
  }
};
document.querySelector("#platformTest").onclick = async (e) => {
  const btn = e.currentTarget,
    check = QCFPlatform.validate({ ...platformConfig, ...readPlatform() });
  if (!check.valid) {
    platformStatus(check.errors.join(" · "), "error");
    return;
  }
  btn.disabled = true;
  platformStatus("Comprobando endpoint…");
  const started = performance.now(),
    controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), check.config.timeoutMs);
  try {
    const response = await fetch(
      check.config.backendBaseUrl + check.config.healthPath,
      { headers: { accept: "application/json" }, signal: controller.signal },
    );
    const latency = performance.now() - started,
      health = infraHealth.add(latency);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    platformConfig = check.config;
    platformStatus(
      `ONLINE · ${latency.toFixed(0)}ms · EWMA ${health.ewma.toFixed(0)}ms${health.anomaly ? " · ANOMALÍA" : ""}`,
      "ok",
    );
    document.querySelector("#latency").textContent =
      Math.round(health.ewma) + "ms";
    await refreshMarketData();
  } catch (error) {
    platformStatus(
      `OFFLINE · ${error.name === "AbortError" ? "timeout" : error.message}`,
      "error",
    );
  } finally {
    clearTimeout(timer);
    btn.disabled = false;
  }
};
document.querySelector("#securityCheck").onclick = async () => {
  const el = document.querySelector("#securityStatus");
  try {
    const r = await fetch(
        platformConfig.backendBaseUrl + "/v1/security/status",
      ),
      x = await r.json();
    if (!r.ok) throw new Error(x.error);
    el.className =
      "platform-status " +
      (x.environment === "production" && x.enforced && x.secretConfigured
        ? "ok"
        : "");
    el.querySelector("span").textContent =
      `${x.environment.toUpperCase()} · auth ${x.enforced ? "ENFORCED" : "LOCAL"} · ${x.algorithm} · rate ${x.rateLimit.requests}/min · four-eyes ${x.fourEyes ? "ON" : "OFF"}`;
  } catch (error) {
    el.className = "platform-status error";
    el.querySelector("span").textContent =
      `Security check falló · ${error.message}`;
  }
};
document.querySelector("#agentWeight").oninput = (e) =>
  (document.querySelector("#weightValue").textContent =
    Number(e.target.value).toFixed(1) + "×");
document.querySelector("#connectAgent").onclick = () => {
  const prev = agentConfigs[selectedAgent] || {},
    connected = !prev.connected;
  agentConfigs[selectedAgent] = {
    type: document.querySelector("#brainType").value,
    weight: +document.querySelector("#agentWeight").value,
    endpoint: document.querySelector("#agentEndpoint").value.trim(),
    connected,
  };
  localStorage.setItem("qcf-agent-configs", JSON.stringify(agentConfigs));
  showModel(selectedAgent);
};
document.querySelector("#brainType").onchange = () => {
  const m = modelFor(selectedAgent);
  document.querySelector("#modelType").textContent =
    document.querySelector("#brainType").value === "ai"
      ? "EXTERNAL AI"
      : document.querySelector("#brainType").value === "hybrid"
        ? "AI + MATH"
        : m[0];
};
document.querySelector("#executeAgent").onclick = async (e) => {
  const btn = e.currentTarget,
    cfg = agentConfigs[selectedAgent] || {},
    existing = agentRuntime.registry.get(selectedAgent) || {},
    input = {
      scenario: engine.scenario,
      price: 68420,
      volatility: 0.42,
      input_id: `ui_${Date.now()}`,
    };
  agentRuntime.register({
    ...existing,
    id: selectedAgent,
    type: cfg.type || document.querySelector("#brainType").value,
    weight: cfg.weight || 1,
  });
  btn.disabled = true;
  btn.textContent = "PROCESANDO…";
  let result;
  try {
    result =
      cfg.connected && cfg.type !== "math"
        ? await platformClient.execute(
            selectedAgent,
            input,
            /Strategy Miner/.test(selectedAgent)
              ? "research"
              : /Code Generator/.test(selectedAgent)
                ? "code"
                : /CIO|Moderator/.test(selectedAgent)
                  ? "board"
                  : /Auditor/.test(selectedAgent)
                    ? "audit"
                    : "classification",
          )
        : await agentRuntime.execute(selectedAgent, input, {
            inputId: input.input_id,
          });
  } catch (error) {
    result = {
      status: "error",
      signal: 0,
      confidence: 0,
      error: error.message,
    };
    document.querySelector("#connectionState").textContent =
      `Gateway falló · ${error.message} · ${platformClient.breaker.state}`;
  }
  btn.disabled = false;
  btn.textContent = "▶ EJECUTAR AGENTE";
  document.querySelector("#signal").textContent =
    result.status === "ok"
      ? `${selectedAgent} · señal ${result.signal.toFixed(2)} · ${(result.confidence * 100).toFixed(0)}% · ${result.source === "gateway" ? "API" : "LOCAL"}`
      : `${selectedAgent} · ERROR`;
  document.querySelector("#confidenceBar").style.width =
    result.confidence * 100 + "%";
  document.querySelector("#confidenceValue").textContent =
    (result.confidence * 100).toFixed(0) + "%";
};
const traceSteps = [
  ["intake", "Intel & Data consolidó social, macro y on-chain"],
  ["model", "AI Board produjo consenso probabilístico · 72%"],
  ["debate", "Human Director aprobó la propuesta del CIO"],
  ["veto", "Risk Management verificó drawdown, Kelly y VaR"],
  ["exec", "Execution Router fragmentó la orden paper"],
  ["audit", "Crypto Accountant concilió PnL neto y fees"],
];
function runTrace() {
  const list = document.querySelector("#traceList");
  list.innerHTML = "";
  traceSteps.forEach((s, i) =>
    setTimeout(() => {
      const li = document.createElement("li");
      li.className = s[0] === "veto" ? "veto" : s[0] === "exec" ? "exec" : "";
      li.innerHTML = `<b>${esc(String(i + 1).padStart(2, "0"))}</b> · ${esc(s[1])}`;
      list.append(li);
      if (i === traceSteps.length - 1)
        document.querySelector("#signal").textContent =
          "Trazabilidad completa · 6/6";
    }, i * 420),
  );
}
document.querySelector("#runTrace").onclick = runTrace;
function researchCandles(n = 220) {
  let p = 62000,
    s = 73;
  return Array.from({ length: n }, (_, i) => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    const noise = (s / 4294967296 - 0.48) * 0.018,
      regime = i < 80 ? 0.002 : i < 145 ? -0.0012 : 0.0015;
    p = Math.max(1000, p * (1 + regime + noise));
    return { time: i, close: p, volume: 100 + (s % 80) };
  });
}
document.querySelector("#runResearch").onclick = (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  btn.textContent = "CORRIENDO…";
  setTimeout(() => {
    const candles = researchCandles(),
      bt = QCFResearch.backtest(candles, trendStrategy, {
        fee: 0.0006,
        slippage: 0.0005,
      }),
      wf = QCFResearch.walkForward(candles, trendStrategy, {
        train: 80,
        test: 30,
        fee: 0.0006,
        slippage: 0.0005,
      }),
      rets = bt.equity.slice(1).map((x, i) => x / bt.equity[i] - 1),
      mc = QCFResearch.monteCarlo(rets, 300, 42);
    document.querySelector("#btReturn").textContent =
      (bt.totalReturn * 100).toFixed(1) + "%";
    document.querySelector("#btSharpe").textContent = bt.sharpe.toFixed(2);
    document.querySelector("#btDrawdown").textContent =
      (bt.maxDrawdown * 100).toFixed(1) + "%";
    document.querySelector("#btWalk").textContent = wf.pass ? "PASS" : "REVIEW";
    document.querySelector("#researchStatus").textContent =
      `${wf.pass ? "Walk-forward aprobado" : "Revisión requerida"} · MC p05 ${(mc.p05 * 100).toFixed(1)}% · ${bt.trades} fills`;
    if (wf.pass) strategies.promote(trendStrategy.id);
    btn.disabled = false;
    btn.textContent = "EJECUTAR";
  }, 450);
};
function renderEngine() {
  floor.classList.toggle("paused", engine.state === "paused");
  floor.classList.toggle("halted", engine.state === "halted");
  document.querySelector("#engineState").textContent =
    engine.state.toUpperCase();
  document.querySelector("#engineState").style.color =
    engine.state === "running"
      ? "var(--lime)"
      : engine.state === "paused"
        ? "var(--orange)"
        : "var(--red)";
  document.querySelector("#engineDot").style.background =
    engine.state === "running"
      ? "var(--lime)"
      : engine.state === "paused"
        ? "var(--orange)"
        : "var(--red)";
  document.querySelector("#engineToggle").textContent =
    engine.state === "paused" ? "▶ REANUDAR" : "Ⅱ PAUSAR";
  document
    .querySelector("#killSwitch")
    .classList.toggle("active", engine.state === "halted");
  document.querySelector("#riskGate").textContent =
    engine.state === "halted" ? "LOCKED" : "OPEN";
}
function transitionEngine(next) {
  try {
    engine.state = stateMachine.transition(next);
  } catch (e) {
    return;
  }
  renderEngine();
}
document.querySelector("#runPaperCycle").onclick = () => {
  const price = 68420 + Math.random() * 120,
    stress = engine.scenario === "crash" || engine.scenario === "depeg",
    ctx = {
      equity: paperBroker.equity(price),
      drawdown: stress ? 0.08 : 0.015,
      var: stress ? 0.045 : 0.018,
      exposure: Math.abs(paperBroker.positions.BTC || 0) * price,
      correlation: stress ? 0.86 : 0.42,
      liquidityScore: engine.scenario === "outage" ? 0 : 8,
    },
    order = {
      id: `paper-${++paperSeq}`,
      symbol: "BTC",
      side: paperSeq % 3 === 0 ? "sell" : "buy",
      qty: 0.03,
    };
  auditChain.append("proposal", { order, scenario: engine.scenario });
  const result = paperBroker.submit(order, { price }, ctx);
  auditChain.append(result.status === "filled" ? "fill" : "veto", result);
  opsMetrics.inc(result.status);
  const rec = paperBroker.reconcile(),
    verify = auditChain.verify();
  document.querySelector("#opsDecision").textContent =
    result.status.toUpperCase();
  document.querySelector("#opsFills").textContent = rec.fills;
  document.querySelector("#opsFees").textContent = "$" + rec.fees.toFixed(2);
  document.querySelector("#opsAudit").textContent = verify.valid
    ? verify.count + " OK"
    : "BROKEN";
  document.querySelector("#opsStatus").textContent =
    result.status === "filled"
      ? `Paper fill ${order.side} ${order.qty} BTC · idempotent`
      : `${result.review?.failed?.join(", ") || result.reason}`;
  document.querySelector("#equity").textContent =
    "$" + Math.round(paperBroker.equity(price) / 1000) + "K";
};
document.querySelector("#verifyAudit").onclick = () => {
  const v = auditChain.verify();
  document.querySelector("#opsAudit").textContent = v.valid
    ? `${v.count} · ${v.head}`
    : `ROTA #${v.brokenAt}`;
  document.querySelector("#opsStatus").textContent = v.valid
    ? "Cadena íntegra · trazabilidad verificada"
    : "Fallo de integridad detectado";
};
document.querySelector("#engineToggle").onclick = () => {
  if (engine.state === "halted") return;
  transitionEngine(engine.state === "paused" ? "running" : "paused");
};
document.querySelector("#killSwitch").onclick = async () => {
  if (engine.state === "halted") return;
  const status = document.querySelector("#opsStatus");
  riskEngine.halt(true);
  auditChain.append("kill-switch", {
    state: "halted",
    confirmation: "pending",
  });
  transitionEngine("halted");
  try {
    if (typeof fetch !== "function") throw new Error("backend-unavailable");
    const response = await fetch(
      platformConfig.backendBaseUrl + "/v1/pipeline/halt",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"reason":"human-director-kill-switch"}',
      },
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    auditChain.append("kill-switch-confirmed", { state: "halted" });
    status.textContent = "HALT confirmado por el backend";
  } catch (error) {
    status.textContent = `HALT LOCAL · confirmación backend falló: ${error.message}`;
  }
};
document.querySelector("#scenario").onchange = (e) => {
  engine.scenario = e.target.value;
  const map = {
      normal: [42, "OPEN"],
      bull: [55, "OPEN"],
      crash: [180, "REVIEW"],
      depeg: [210, "REVIEW"],
      outage: [999, "LOCKED"],
    },
    v = map[engine.scenario];
  engine.latency = v[0];
  document.querySelector("#latency").textContent = engine.latency + "ms";
  document.querySelector("#riskGate").textContent = v[1];
  document.querySelector("#feedHealth").textContent =
    engine.scenario === "outage"
      ? "DOWN"
      : engine.scenario === "depeg"
        ? "DEGRADED"
        : "HEALTHY";
  if (engine.scenario === "outage" && engine.state !== "halted") {
    riskEngine.halt(true);
    auditChain.append("circuit-breaker", { reason: "exchange-outage" });
    transitionEngine("halted");
  }
  runTrace();
};
renderEngine();
function focusRoom(a) {
  scale = Math.min(
    1.05,
    Math.max(
      0.62,
      Math.min((vp.clientWidth - 110) / a.w, (vp.clientHeight - 140) / a.h),
    ),
  );
  tx = (vp.clientWidth - a.w * scale) / 2 - a.x * scale;
  ty = (vp.clientHeight - a.h * scale) / 2 - a.y * scale;
  apply();
}
document.querySelector("#search").addEventListener("input", (e) => {
  let q = e.target.value.toLowerCase().trim();
  document
    .querySelectorAll(".room")
    .forEach((r, i) =>
      r.classList.toggle(
        "highlight",
        q &&
          [areas[i].name, ...areas[i].agents]
            .join(" ")
            .toLowerCase()
            .includes(q),
      ),
    );
});
function tick() {
  const d = new Date(),
    h = d.getHours(),
    phase = h < 6 || h >= 20 ? "night" : h < 9 || h >= 17 ? "dawn" : "day";
  document.querySelector("#time").textContent = d.toLocaleTimeString([], {
    hour12: false,
  });
  document.querySelector("#phase").textContent =
    `LOCAL · ${phase === "night" ? "NIGHT SHIFT" : phase === "dawn" ? "GOLDEN HOUR" : "DAY SESSION"}`;
  floor.classList.remove("night", "dawn", "day");
  floor.classList.add(phase);
}
setInterval(tick, 1000);
tick();
apply();
loadFloorTopology();
connectPlatformStream();
syncFloor();
setInterval(syncFloor, 5000);
setInterval(renderLiveEmployee, 1000);
setTimeout(() => selectArea(areas[0]), 300);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    detail.classList.remove("open");
    closeMenu();
    scale = 0.78;
    tx = 25;
    ty = 55;
    apply();
  }
  if (e.key === "+" || e.key === "=") setScale(scale * 1.12);
  if (e.key === "-") setScale(scale * 0.88);
  if (e.key === "0") {
    scale = 0.78;
    tx = 25;
    ty = 55;
    apply();
  }
});
