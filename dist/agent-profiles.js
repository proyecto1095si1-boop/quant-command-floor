(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.QCFAgentProfiles = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const profiles = {
    "intake.data": [
      "Recolector de mercado",
      "Reúne precios y movimientos de los cuatro activos antes de que otros empleados los analicen.",
      "Ordena la información de las fuentes y permite comprobar que sea reciente y consistente.",
      "Cotizaciones, transacciones y órdenes disponibles.",
      "Una base de mercado que las mesas puedan revisar.",
    ],
    "intake.news": [
      "Analista de noticias cripto",
      "Estudia qué noticias pueden afectar a Bitcoin, Ethereum, Solana y BNB.",
      "Busca la relación de cada titular con el activo, interpreta su tono y da menos peso a las noticias antiguas.",
      "Titulares y resúmenes de noticias cripto.",
      "Una lectura del clima informativo, con un grado de confianza.",
    ],
    "intake.sentiment": [
      "Analista de sentimiento",
      "Su función es interpretar el entusiasmo, la preocupación o la neutralidad expresados en los textos.",
      "Clasifica el lenguaje y contrasta las opiniones; una opinión favorable no demuestra que el precio vaya a subir.",
      "Textos entregados a este empleado por una fuente conectada.",
      "Una evaluación del sentimiento y sus límites.",
    ],
    "intake.onchain": [
      "Analista de movimientos en cadena",
      "Su tarea es estudiar movimientos relevantes de monedas y posibles flujos hacia los exchanges.",
      "Relaciona el tamaño y el destino de los movimientos con el contexto del mercado.",
      "Movimientos de billeteras y flujos que una fuente haya suministrado.",
      "Indicios de presión compradora o vendedora; no identifica intenciones con certeza.",
    ],
    "intake.intel": [
      "Coordinador de inteligencia",
      "Reúne la información externa para que las mesas puedan usarla como contexto.",
      "Compara las fuentes disponibles, su vigencia y sus desacuerdos antes de consolidarlas.",
      "Noticias, contexto económico y señales externas verificadas.",
      "Una lectura conjunta que puede quedar bloqueada si faltan fuentes.",
    ],
    "desk.btc": [
      "Responsable de Bitcoin",
      "Estudia exclusivamente Bitcoin y prepara propuestas para su mesa de simulación.",
      "Combina comportamiento del precio, volumen, liquidez y contexto informativo de Bitcoin.",
      "Datos y análisis asociados a BTC.",
      "Una propuesta de compra, venta o espera sujeta al control de riesgo.",
    ],
    "desk.eth": [
      "Responsable de Ethereum",
      "Estudia Ethereum para valorar sus oportunidades dentro de la cartera simulada.",
      "Contrasta la tendencia y la profundidad de su mercado con el volumen y las noticias vinculadas a Ethereum.",
      "Datos y análisis asociados a ETH.",
      "Una decisión específica para Ethereum, que todavía debe superar riesgo.",
    ],
    "desk.sol": [
      "Responsable de Solana",
      "Estudia Solana y sus cambios de precio, teniendo presente su perfil de mayor variación.",
      "Combina señales de mercado y evidencia externa sin asumir que copiará el comportamiento de Bitcoin.",
      "Datos y análisis asociados a SOL.",
      "Una propuesta para Solana o la decisión de esperar evidencia suficiente.",
    ],
    "desk.bnb": [
      "Responsable de BNB",
      "Estudia BNB y el riesgo de concentración relacionado con su mercado.",
      "Contrasta señales de precio, actividad y liquidez con el contexto disponible para BNB.",
      "Datos y análisis asociados a BNB.",
      "Una propuesta individual para BNB dentro del mandato de la mesa.",
    ],
    "consensus.technical": [
      "Analista técnico",
      "Estudia cómo se está moviendo el precio.",
      "Compara tendencias y fuerza del movimiento usando indicadores calculados sobre precios históricos.",
      "Series de precios de la mesa analizada.",
      "Una orientación técnica que se contrasta con los demás empleados.",
    ],
    "consensus.volume": [
      "Analista de volumen",
      "Evalúa si un movimiento de precio está acompañado por suficiente actividad.",
      "Compara el volumen reciente con su comportamiento habitual y detecta variaciones destacables.",
      "Cantidad negociada a lo largo del tiempo.",
      "Una medida del apoyo o la debilidad del movimiento observado.",
    ],
    "consensus.whale": [
      "Analista de operaciones grandes",
      "Busca operaciones de tamaño relevante que puedan influir en el mercado.",
      "Estudia la presión de compras y ventas grandes en las transacciones disponibles; no demuestra quién está detrás.",
      "Transacciones y tamaños negociados.",
      "Una lectura de presión procedente de operaciones grandes.",
    ],
    "consensus.liquidity": [
      "Analista de liquidez",
      "Evalúa qué tan fácil sería comprar o vender sin mover demasiado el precio.",
      "Compara las órdenes de compra y venta y la distancia entre sus mejores precios.",
      "Órdenes disponibles en el libro del mercado.",
      "Una evaluación del equilibrio y profundidad del mercado.",
    ],
    "consensus.structure": [
      "Analista de estructura",
      "Estudia si el mercado está construyendo una tendencia o cambiando de dirección.",
      "Observa máximos, mínimos y rupturas recientes para describir la organización del precio.",
      "Precios históricos ordenados en el tiempo.",
      "Una lectura de continuidad, ruptura o falta de dirección.",
    ],
    "consensus.orderblock": [
      "Analista de zonas de interés",
      "Busca zonas de precio que podrían concentrar interés comprador o vendedor.",
      "Relaciona movimientos previos y zonas de reacción; esas zonas son hipótesis, no órdenes institucionales confirmadas.",
      "Secuencias de precio y volumen disponibles.",
      "Zonas candidatas que ayudan a contextualizar una propuesta.",
    ],
    "consensus.signal": [
      "Coordinador de decisiones",
      "Confronta los análisis de la mesa antes de formar una propuesta.",
      "Pondera evidencia, confianza y dependencia entre señales; puede decidir esperar cuando existe desacuerdo.",
      "Resultados de los analistas y contexto del activo.",
      "Una propuesta consensuada que aún requiere autorización de riesgo.",
    ],
    "risk.manager": [
      "Responsable de riesgo",
      "Decide si una propuesta puede ejecutarse dentro de los límites de la simulación.",
      "Revisa pérdidas, exposición, tamaño y condiciones de mercado; puede vetar la operación.",
      "Propuesta, cartera y límites vigentes.",
      "Autorización o veto, con los controles que debe respetar la ejecución.",
    ],
    "risk.drawdown": [
      "Control de pérdidas acumuladas",
      "Su función es vigilar cuánto perdió la cartera respecto de su mejor nivel anterior.",
      "Compara el valor actual con su máximo previo para identificar una caída acumulada excesiva.",
      "Evolución del valor de la cartera.",
      "Una advertencia o condición de bloqueo por pérdida acumulada.",
    ],
    "risk.exposure": [
      "Control de exposición",
      "Su tarea es evitar que muchas posiciones parezcan diversas pero concentren el mismo riesgo.",
      "Examina pesos, dependencias y movimientos conjuntos de los activos.",
      "Posiciones y relaciones entre los mercados.",
      "Una medida de concentración y riesgo conjunto.",
    ],
    "risk.size": [
      "Responsable del tamaño",
      "Su función es limitar cuánto capital comprometería cada propuesta.",
      "Relaciona el riesgo admitido con el precio, la variación del activo y los límites de la cartera.",
      "Capital disponible, propuesta y límites de pérdida.",
      "Una cantidad máxima para la operación simulada.",
    ],
    "execution.queue": [
      "Coordinador de la cola",
      "Organiza las órdenes paper que esperan procesamiento.",
      "Mantiene el orden de trabajo y permite revisar qué operaciones están pendientes.",
      "Órdenes simuladas aceptadas por el sistema.",
      "Una cola de ejecución visible y trazable.",
    ],
    "execution.router": [
      "Planificador de ejecución",
      "Su función es distribuir una operación simulada en partes cuando corresponda.",
      "Organiza la secuencia de órdenes hijas para estudiar su ejecución y coste.",
      "Propuesta aprobada y condiciones del mercado.",
      "Un plan de órdenes paper que vuelve a pasar por controles de riesgo.",
    ],
    "execution.broker": [
      "Simulador de operaciones",
      "Su tarea es simular cómo se completaría una compra o venta.",
      "Usa liquidez disponible, comisiones y deslizamiento; una orden puede completarse parcialmente o rechazarse.",
      "Órdenes paper y datos del libro.",
      "Resultados simulados con cantidades, costes y precios.",
    ],
    "portfolio.manager": [
      "Responsable de cartera",
      "Revisa el dinero y las posiciones que mantiene la simulación.",
      "Relaciona saldos, valoración y concentración para entender el conjunto de la cartera.",
      "Posiciones, efectivo y precios recientes.",
      "Una visión de la situación de la cartera paper.",
    ],
    "portfolio.allocation": [
      "Responsable de asignación",
      "Su función es repartir el capital entre los activos permitidos.",
      "Compara oportunidades y riesgos respetando las restricciones de concentración.",
      "Capital, propuestas y límites por activo.",
      "Una distribución propuesta del capital simulado.",
    ],
    "portfolio.rebalance": [
      "Responsable de rebalanceo",
      "Su tarea es detectar cuándo la cartera se aparta de su distribución objetivo.",
      "Compara los pesos actuales con los objetivos y estudia el coste de corregir diferencias.",
      "Pesos de cartera, objetivos y costes estimados.",
      "Un plan de ajuste sujeto a los controles habituales.",
    ],
    "audit.writer": [
      "Responsable de auditoría",
      "Conserva el rastro de lo que decidió e hizo el sistema.",
      "Encadena los registros para poder comprobar su integridad y reconstruir los hechos.",
      "Decisiones, vetos y resultados paper.",
      "Un registro verificable de la simulación.",
    ],
    "research.miner": [
      "Investigador de estrategias",
      "Es un puesto previsto para investigar patrones históricos, sin motor implementado hoy.",
      "No ejecuta minería ni entrenamiento: requiere un ejecutor y una tarea antes de producir hipótesis.",
      "Históricos y una tarea de investigación configurada.",
      "Ideas de estrategia; no una rentabilidad garantizada.",
    ],
    "research.backtest": [
      "Responsable de pruebas históricas",
      "Evalúa estadísticamente una serie de retornos entregada al laboratorio.",
      "Calcula Sharpe, caída, sobreajuste y sensibilidad sobre retornos; este servicio no ejecuta código de estrategias ni descuenta costes por sí mismo.",
      "Retornos suministrados o sintéticos por defecto; los costes deben estar incorporados por quien genera la serie.",
      "Resultados históricos que ayudan a evaluar una hipótesis.",
    ],
    "research.walkforward": [
      "Responsable de validación temporal",
      "Su función es comprobar si una estrategia mantiene su comportamiento fuera del período de ajuste.",
      "Aplica validación purged k-fold con purga y embargo; el conjunto de entrenamiento puede incluir períodos posteriores al test, no es un walk-forward causal ni reentrenamiento autónomo.",
      "Una estrategia y ventanas históricas sucesivas.",
      "Evidencia de robustez o de fragilidad fuera de muestra.",
    ],
    "sre.feeds": [
      "Supervisor de fuentes",
      "Observa la llegada de información de mercado.",
      "Revisa la última actualización recibida para detectar fuentes retrasadas o ausentes.",
      "Estado y hora de los feeds.",
      "Información sobre frescura y disponibilidad de los datos.",
    ],
    "sre.api": [
      "Supervisor de servicios",
      "Su función es vigilar la disponibilidad y los límites de los proveedores.",
      "Examina respuestas, tiempos y capacidad para detectar interrupciones.",
      "Métricas de peticiones y salud de los servicios.",
      "Avisos para revisar o pausar procesos afectados.",
    ],
    "sre.anomaly": [
      "Analista de anomalías",
      "Su tarea es detectar comportamientos técnicos fuera de lo habitual.",
      "Compara métricas recientes con su distribución normal y señala desvíos que requieren revisión.",
      "Mediciones de latencia, errores o actividad técnica.",
      "Una alerta de anomalía que debe interpretarse con su contexto.",
    ],
  };
  function profile(id) {
    const row = profiles[id] || [
      "Empleado del sistema",
      "Este empleado aún no tiene una ficha específica disponible.",
      "Su método no está documentado en esta vista.",
      "Información de su tarea asignada.",
      "Su resultado cuando exista una observación.",
    ];
    return {
      role: row[0],
      mission: row[1],
      method: row[2],
      uses: row[3],
      delivers: row[4],
    };
  }
  const finite = (value) => typeof value === "number" && Number.isFinite(value);
  const number = (value, digits = 8) =>
      finite(value)
        ? value !== 0 && Math.abs(value) < 10 ** -digits
          ? value.toExponential(3)
          : value.toLocaleString("es-AR", { maximumFractionDigits: digits })
        : "sin dato",
    percent = (value) =>
      finite(value) ? `${number(value * 100)} %` : "sin dato",
    text = (value) =>
      typeof value === "string" ? value.slice(0, 120) : "sin dato",
    flag = (value) =>
      typeof value === "boolean" ? (value ? "sí" : "no") : "sin dato",
    signal = (raw) =>
      `señal ${finite(raw.signal) && raw.signal > 0 ? "+" : ""}${number(raw.signal)} (${!finite(raw.signal) ? "sin orientación verificable" : raw.signal > 0 ? "orientación compradora" : raw.signal < 0 ? "orientación vendedora" : "sin dirección"}), confianza ${number(raw.confidence)}`,
    evidence = (raw, key) => {
      const row = (Array.isArray(raw.evidence) ? raw.evidence : []).find(
        (item) => typeof item === "string" && item.startsWith(`${key}=`),
      );
      return row ? text(row.slice(key.length + 1)) : "sin dato";
    },
    param = (parameters, key) =>
      parameters.find((row) => row.name === key)?.value,
    parameter = (parameters, key) => number(param(parameters, key)),
    normalized =
      "Señal de −1 a +1: negativa vendedora, cero sin dirección, positiva compradora; confianza de 0 a 1, no tasa de acierto. No se aplica una banda neutral inventada.",
    weight = (parameters) =>
      `Peso base en consenso ${parameter(parameters, "consensusWeight")}; puede variar por régimen y dependencia. El Risk Gate revisa cualquier propuesta antes de ejecución paper.`,
    review = (raw) => raw.lastReview || raw,
    metrics = (raw) => raw.metrics || {},
    allocationRows = (raw, field, unit) =>
      (Array.isArray(raw.allocations) ? raw.allocations : [])
        .slice(0, 4)
        .map(
          (row) =>
            `${text(row.asset)} ${field === "targetWeight" ? percent(row[field]) : number(row[field]) + " " + unit}`,
        )
        .join("; ") || "sin asignaciones observadas";
  const narrators = {
    "intake.data": (r) =>
      `Recolectó precio ${number(r.price)} USD, compra ${number(r.bid)} USD y venta ${number(r.ask)} USD; libro ${number(r.bookLevels?.bids)} niveles de compra / ${number(r.bookLevels?.asks)} de venta. Velas ${number(r.candles)}, operaciones ${number(r.trades)} si la observación es de intake.`,
    "intake.news": (r) =>
      r.agent_id
        ? `Interpretó noticias manuales con Bayes: ${signal(r)}; posterior ${evidence(r, "bayes:posterior")}, eventos ${evidence(r, "events")}. No incluye titulares ni conteo del DAG.`
        : `Revisó ${number(r.observations)} noticias; ${signal(r)}; descartes: futuros/sin fecha ${number(metrics(r).rejected?.futureOrUnknown)}, antiguos ${number(metrics(r).rejected?.stale)}, irrelevantes ${number(metrics(r).rejected?.irrelevant)}, duplicados ${number(metrics(r).rejected?.duplicate)}. Lectura léxica por relevancia y antigüedad.`,
    "intake.sentiment": (r) =>
      `Clasificó sentimiento: ${signal(r)}; palabras positivas ${evidence(r, "lexicon:positive")}, negativas ${evidence(r, "lexicon:negative")}, tokens ${evidence(r, "tokens")}.`,
    "intake.onchain": (r) =>
      `Analizó flujo neto ${evidence(r, "net-flow")} unidades según la entrada (moneda no declarada), z-score ${evidence(r, "z-score")}, destino ${evidence(r, "destination")}; ${signal(r)}.`,
    "intake.intel": (r) =>
      `Consolidó inteligencia: ${signal(r)}; cobertura ${percent(r.coverage ?? metrics(r).coverage)}, dispersión ${number(r.dispersion ?? metrics(r).dispersion)}; estado ${text(r.status)}.`,
    "desk.btc": (r) =>
      finite(r.price)
        ? `Bitcoin recibió precio ${number(r.price)} USD; todavía no hay análisis en esta observación.`
        : `Bitcoin consolidó ${signal(r)}; acuerdo ${number(r.agreement)}, decisión ${text(r.action)}, bloqueos ${number(r.blockers?.length)}.`,
    "desk.eth": (r) =>
      finite(r.price)
        ? `Ethereum recibió cotización ${number(r.price)} USD; análisis pendiente.`
        : `Ethereum contrastó ${signal(r)}; acuerdo ${number(r.agreement)}, acción ${text(r.action)}, impedimentos ${number(r.blockers?.length)}.`,
    "desk.sol": (r) =>
      finite(r.price)
        ? `Solana recibió mercado a ${number(r.price)} USD; no demuestra consenso ejecutado.`
        : `Solana evaluó ${signal(r)}; acuerdo ${number(r.agreement)}, propuesta ${text(r.action)}, bloqueos ${number(r.blockers?.length)}.`,
    "desk.bnb": (r) =>
      finite(r.price)
        ? `BNB registró ${number(r.price)} USD; solo cotización, no propuesta.`
        : `BNB reunió ${signal(r)}; acuerdo ${number(r.agreement)}, resolución ${text(r.action)}, bloqueos ${number(r.blockers?.length)}.`,
    "consensus.technical": (r, p) =>
      `Calculó ${signal(r)}; EMA${parameter(p, "fastPeriod")} ${number(metrics(r).fast)} USD ${finite(metrics(r).fast) && finite(metrics(r).slow) ? (metrics(r).fast > metrics(r).slow ? "sobre" : metrics(r).fast < metrics(r).slow ? "bajo" : "igual a") : "frente a"} EMA${parameter(p, "slowPeriod")} ${number(metrics(r).slow)} USD; RSI ${number(metrics(r).rsi)} puntos, ATR ${number(metrics(r).atr)} USD.`,
    "consensus.volume": (r) =>
      `Midió volumen z-score ${number(metrics(r).z)} desviaciones estándar y flujo OBV normalizado ${number(metrics(r).flow)}; ${signal(r)}.`,
    "consensus.whale": (r) =>
      `Separó ${number(metrics(r).largeTrades)} operaciones grandes desde ${number(metrics(r).threshold)} USD; compras ${number(metrics(r).buy)} USD, ventas ${number(metrics(r).sell)} USD; ${signal(r)}.`,
    "consensus.liquidity": (r) =>
      `Leyó spread ${number(metrics(r).spreadBps)} bps, profundidad compradora ${number(metrics(r).bidDepth)} unidades del activo y vendedora ${number(metrics(r).askDepth)}; desequilibrio ${number(metrics(r).imbalance)}; ${signal(r)}.`,
    "consensus.structure": (r) =>
      `Detectó tendencia ${number(metrics(r).trend)}, ruptura alcista ${flag(metrics(r).bullBos)}, bajista ${flag(metrics(r).bearBos)}; último máximo ${number(metrics(r).lastHigh)} USD y mínimo ${number(metrics(r).lastLow)} USD; ${signal(r)}.`,
    "consensus.orderblock": (r) =>
      finite(metrics(r).low) && finite(metrics(r).high)
        ? `Localizó zona ${number(metrics(r).low)}–${number(metrics(r).high)} USD, distancia ${number(metrics(r).distanceAtr)} ATR, dentro ${flag(metrics(r).inZone)}; ${signal(r)}.`
        : `No hay zona válida observada; ATR ${number(metrics(r).atr)} USD; ${signal(r)}.`,
    "consensus.signal": (r) =>
      `Sintetizó ${signal(r)}; acción ${text(r.action)}, abstención ${flag(r.abstained)}, evidencia efectiva ${number(r.effectiveAgents)}; motivos ${Array.isArray(r.abstainReasons) ? r.abstainReasons.map(text).join(", ") || "ninguno" : "sin detalle"}.`,
    "risk.manager": (r) =>
      `${r.halted ? "Sistema detenido por un control de riesgo" : "Control de riesgo observado"}: propuesta ${typeof review(r).approved === "boolean" ? (review(r).approved ? "aprobada" : "vetada") : "sin revisión"}; ${number(review(r).checks?.length)} controles, ${number(review(r).failed?.length)} fallidos; caída ${percent(metrics(review(r)).drawdown)}.`,
    "risk.drawdown": (r, p) =>
      `Comparó caída desde el máximo ${percent(metrics(review(r)).drawdown)} con límite ${percent(param(p, "maxDrawdown"))}; propuesta ${typeof review(r).approved === "boolean" ? (review(r).approved ? "autorizada" : "vetada por los controles") : "sin revisión"}.`,
    "risk.exposure": (r) =>
      `Proyectó exposición bruta ${percent(metrics(review(r)).postGrossExposure)}, peso del activo ${percent(metrics(review(r)).postAssetWeight)}, factor ${percent(metrics(review(r)).postFactorExposure)}; valor bruto previo ${number(metrics(review(r)).exposure?.grossBefore)} USD y posterior ${number(metrics(review(r)).exposure?.grossAfter)} USD.`,
    "risk.size": (r) =>
      `Limitó cantidad a ${number(r.qty)} unidades del activo; presupuesto de riesgo ${number(r.riskBudget)} USD, distancia al stop ${number(r.stopDistance)} USD, volatilidad anual ${percent(r.annualVol)}, restricción dominante ${text(r.binding)}.`,
    "execution.queue": (r) =>
      `Cola paper: ${number(r.queue ?? r.queued)} órdenes pendientes, ${number(r.parents?.length)} órdenes padre en esta respuesta; fills acumulados ${number(metrics(r).fills)}. ${r.status ? `Último estado ${text(r.status)}.` : "El tamaño de cola no indica llenados."}`,
    "execution.router": (r) =>
      `Planificó ${number(r.parents?.length)} órdenes padre y ${number(r.queued ?? r.children?.length)} hijas/pendientes; importe programado ${number(r.scheduledNotional)} USD y residual ${number(r.residualNotional)} USD cuando el evento contiene el detalle del router.`,
    "execution.broker": (r) =>
      r.fill
        ? `Simuló ${number(r.fill.qty)} unidades a ${number(r.fill.price)} USD; comisión ${number(r.fill.fee)} USD, deslizamiento ${number(r.fill.slippageBps)} bps, modelo ${text(r.fill.fillModel)}, restante ${number(r.remainingQty)} unidades; estado ${text(r.status)}.`
        : finite(r.processed)
          ? `Concilió ${number(r.processed)} órdenes paper: ${number(r.filled)} completas, ${number(r.partial)} parciales, ${number(r.rejected)} rechazadas; patrimonio ${number(r.portfolio?.equity)} USD. No incluye precios individuales de fill.`
          : `Simulación ${text(r.status)}; motivo ${text(r.reason)}; no se observó ningún fill con precio ni comisión.`,
    "portfolio.manager": (r) =>
      `Valoró patrimonio ${number(r.equity)} USD, efectivo ${number(r.cash)} USD, comisiones ${number(r.fees)} USD; resultados realizados ${number(r.realizedPnl)} USD y no realizados ${number(r.unrealizedPnl)} USD; fills acumulados ${number(r.fills)}.`,
    "portfolio.allocation": (r) =>
      `Propuso asignación con ${number(r.observations)} retornos por activo y patrimonio ${number(r.equity)} USD; efectivo objetivo ${percent(r.cashTarget)}; ${allocationRows(r, "targetWeight", "")}.`,
    "portfolio.rebalance": (r) =>
      `Propuso ajuste: ${allocationRows(r, "tradeNotional", "USD")}; rotación ${percent(r.rebalancing?.turnover)}, banda ${percent(r.rebalancing?.band)}, máximo ${percent(r.rebalancing?.maxTurnover)}, escalado ${flag(r.rebalancing?.scaled)}.`,
    "audit.writer": (r) =>
      `Verificó cadena ${r.valid === true ? "íntegra" : r.valid === false ? "rota" : "sin resultado"}; ${number(r.count)} registros, ruptura en ${number(r.brokenAt)} si corresponde.`,
    "research.miner": () =>
      "Strategy Miner no tiene motor implementado: 0 hipótesis verificables; no se interpreta un fallback como minería ni entrenamiento.",
    "research.backtest": (r) =>
      `Evaluó ${number(r.observations)} retornos; Sharpe ${number(metrics(r).sharpe)}, caída máxima ${percent(metrics(r).maxDrawdown)}, probabilidad de sobreajuste ${number(metrics(r).pbo)}, estado ${text(r.status)}. Procedencia de retornos no declarada en este informe.`,
    "research.walkforward": (r) =>
      `Validó ${number(r.folds?.length)} particiones purgadas sobre ${number(r.observations)} retornos; Sharpe fuera de muestra ${number(metrics(r).oosSharpe)}, estabilidad ${number(metrics(r).stability)}. No demuestra una búsqueda autónoma de parámetros.`,
    "sre.feeds": (r) =>
      `Observó feed: precio ${number(r.price)} USD, ${number(r.bookLevels?.bids)} niveles bid y ${number(r.bookLevels?.asks)} ask. La antigüedad se muestra en entradas; una recepción no mide un SLO histórico.`,
    "sre.api": (r) =>
      `Revisó disponibilidad ${percent(r.slis?.availability)}, latencia p95 ${number(r.slis?.p95LatencyMs)} ms, antigüedad de datos ${number(r.slis?.dataFreshnessMs)} ms y consumo de presupuesto ${number(r.slis?.burnRate)} veces; estado ${text(r.status)}.`,
    "sre.anomaly": (r) =>
      r.message
        ? `Registró error operativo: ${text(r.message)}; 0 mediciones estadísticas incluidas en este evento. No demuestra un detector ejecutado.`
        : `Calculó mediana ${evidence(r, "median")}, MAD ${evidence(r, "mad")}, z robusto ${evidence(r, "robust-z")}, anomalía ${evidence(r, "anomaly")}; ${signal(r)}. Unidad no declarada por el handler.`,
  };
  const scales = {
    "intake.data":
      "Precio en USD y conteos de observaciones; recibir un precio no implica señal ni orden.",
    "intake.news":
      "Tono informativo normalizado; textos sin relevancia o demasiado antiguos se descartan, no se convierten en votos de compra.",
    "intake.sentiment":
      "Conteos léxicos y señal de sentimiento; un texto optimista no es un pronóstico de retorno.",
    "intake.onchain":
      "Flujo relativo a su historia; entrada a exchange invierte la orientación, sin identificar intención de una billetera.",
    "intake.intel":
      "Cobertura de fuentes y dispersión; un hub bloqueado no constituye inteligencia lista para usar.",
    "desk.btc":
      "Mesa Bitcoin: cotización y propuesta son estados distintos; BTC solo puede avanzar si su consenso no se abstiene.",
    "desk.eth":
      "Mesa Ethereum: el análisis de ETH no se sustituye por el de Bitcoin; decisión NO_TRADE implica espera.",
    "desk.sol":
      "Mesa Solana: una señal de SOL no demuestra liquidez suficiente; los bloqueos del informe prevalecen.",
    "desk.bnb":
      "Mesa BNB: sus límites de concentración son propios; una cotización no autoriza una propuesta.",
    "consensus.technical":
      "EMA/ATR en USD y RSI de 0 a 100 puntos; EMA rápida mayor que lenta indica tendencia relativa, no rentabilidad garantizada.",
    "consensus.volume":
      "Z-score en desviaciones estándar y flujo OBV normalizado; actividad excepcional no prueba continuidad del precio.",
    "consensus.whale":
      "Umbral por notional en USD y presión compradora-vendedora; operación grande no identifica una ballena on-chain.",
    "consensus.liquidity":
      "Spread en puntos básicos y profundidad en unidades del activo; penaliza el desequilibrio cuando el spread crece.",
    "consensus.structure":
      "Tendencia −1/0/+1 y rupturas booleanas; sin swings, extremos ausentes no son niveles de soporte confirmados.",
    "consensus.orderblock":
      "Zona en USD y distancia en múltiplos de ATR; no encontrar desplazamiento válido es una salida legítima, no una zona inventada.",
    "consensus.signal":
      "Consenso probabilístico con abstención: una dirección positiva no anula sus controles de confianza, dependencia o evidencia.",
    "risk.manager":
      "Aprobación booleana y controles fallidos; un único fallo puede vetar, sin que aprobación garantice llenado.",
    "risk.drawdown":
      "Caída desde el máximo en porcentaje; se compara con maxDrawdown activo, sin reemplazar las excepciones reduce-only del Risk Gate.",
    "risk.exposure":
      "Exposiciones posteriores como fracción del patrimonio; importe bruto no es lo mismo que peso ni diversificación.",
    "risk.size":
      "Cantidad en unidades y riesgo en USD; el mínimo de las restricciones determina el tamaño, no el presupuesto máximo aislado.",
    "execution.queue":
      "Conteos de órdenes, no dinero ganado; cero pendientes no acredita que todas se llenaron.",
    "execution.router":
      "Fragmentos, importe programado y residual; el ruteo solo organiza, cada hija vuelve a validar riesgo.",
    "execution.broker":
      "Precio y comisión en USD, slippage en bps; un fill parcial no equivale a completar la orden y sigue siendo simulado.",
    "portfolio.manager":
      "Saldos y PnL en USD; patrimonio incluye posiciones valoradas, no solo ganancias realizadas.",
    "portfolio.allocation":
      "Pesos objetivo como porcentaje del patrimonio; asignación propuesta no modifica las posiciones por sí sola.",
    "portfolio.rebalance":
      "Rotación y banda como fracciones, ajustes en USD; un plan dentro de banda puede no requerir operaciones.",
    "audit.writer":
      "Integridad booleana y cantidad de registros; cadena válida demuestra consistencia del rastro, no veracidad económica del contenido.",
    "research.miner":
      "No existe escala de desempeño de minería: ausencia de motor no equivale a una estrategia neutra ni entrenada.",
    "research.backtest":
      "Sharpe sin unidad, drawdown fraccional y PBO de 0 a 1; resultado histórico no equivale a rendimiento futuro ni promoción automática.",
    "research.walkforward":
      "Sharpe fuera de muestra y particiones purgadas; la validación de una serie dada no prueba reentrenamiento walk-forward.",
    "sre.feeds":
      "Recepciones y vigencia del feed, no disponibilidad de todo el sistema; comprobar entradas antes de usar la cotización.",
    "sre.api":
      "Disponibilidad como fracción, latencia y frescura en ms; burn rate mide consumo relativo del presupuesto de error, no rentabilidad.",
    "sre.anomaly":
      "Z robusto sin unidad cuando hay MAD; un error operativo no es una anomalía estadística y MAD cero limita la interpretación.",
  };
  function narrate(
    id,
    {
      raw = {},
      asset = null,
      parameters = [],
      observed = true,
      error = null,
    } = {},
  ) {
    const context = asset || "Cartera/servicio (activo no informado)",
      ownNarrator = narrators[id],
      activity = !ownNarrator
        ? `${context}: empleado sin redacción registrada; no interpretar su salida.`
        : !observed
          ? `${context}: Todavía no recibió una actualización observable. ${id === "research.miner" ? narrators[id]() : profile(id).mission}`
          : error
            ? `${context}: la fuente informó error: ${text(error)}. No hay resultado nuevo verificable de ${profile(id).role}.`
            : `${context}: ${ownNarrator(raw, parameters)}`;
    let scale =
      scales[id] || "Interpretación no registrada; no utilizar este resultado.";
    if (id === "consensus.technical")
      scale += ` Ventanas EMA ${parameter(parameters, "fastWindow")}/${parameter(parameters, "slowWindow")} velas; RSI ${parameter(parameters, "rsiPeriod")}, ATR ${parameter(parameters, "atrPeriod")}.`;
    if (id === "consensus.liquidity")
      scale += ` Penalización completa a ${parameter(parameters, "spreadPenaltyBps")} bps.`;
    if (id === "consensus.whale")
      scale += ` Cuantil ${parameter(parameters, "notionalQuantile")}.`;
    if (id === "consensus.orderblock")
      scale += ` Desplazamiento mínimo ${parameter(parameters, "displacementAtr")} ATR; distancia de escala ${parameter(parameters, "distanceScaleAtr")} ATR.`;
    if (id === "risk.drawdown")
      scale += ` Límite vigente ${percent(param(parameters, "maxDrawdown"))}.`;
    if (id === "risk.exposure")
      scale += ` Máximo bruto ${parameter(parameters, "maxGrossExposure")}; por factor ${parameter(parameters, "maxFactorExposure")}.`;
    if (id === "consensus.signal")
      scale += ` Umbrales activos: ${parameters.map((row) => `${text(row.name)}=${typeof row.value === "number" ? number(row.value) : text(String(row.value))}`).join("; ") || "sin configuración disponible"}.`;
    if (finite(raw.signal))
      scale = `Lectura observada: ${signal(raw)}. ${scale} ${normalized}`;
    const consequence =
      profile(id).delivers +
      (id.startsWith("consensus.") && id !== "consensus.signal"
        ? ` ${weight(parameters)}`
        : " Es información, no una ejecución. No se ejecutan órdenes ni se invoca IA al consultar esta ficha.");
    return {
      activity: activity.slice(0, 1000),
      meaning: `${scale} ${consequence}`.slice(0, 1000),
      scale: scale.slice(0, 1000),
      consequence,
    };
  }
  function describe(id, event) {
    return narrate(id, {
      raw: { ...(event?.input || {}), ...(event?.output || {}) },
      asset:
        event?.input?.asset ||
        event?.output?.asset ||
        (id.startsWith("desk.") && profiles[id]
          ? id.slice(5).toUpperCase()
          : null),
      parameters: event?.parameters || [],
      observed: !!event,
      error:
        event?.output?.lastError ||
        (event?.output?.configured === false
          ? "falta que configure su proveedor de noticias en el servidor"
          : null),
    });
  }
  return {
    profile,
    describe,
    narrate,
    narrativeIds: Object.keys(narrators),
    ids: Object.keys(profiles),
  };
});
