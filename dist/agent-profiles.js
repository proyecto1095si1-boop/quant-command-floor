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
      "Su tarea es proponer reglas de operación a partir de patrones históricos.",
      "Explora hipótesis que deben someterse a pruebas antes de considerarse útiles.",
      "Históricos y una tarea de investigación configurada.",
      "Ideas de estrategia; no una rentabilidad garantizada.",
    ],
    "research.backtest": [
      "Responsable de pruebas históricas",
      "Estudia cómo habría funcionado una estrategia en el pasado.",
      "Simula sus reglas sobre datos históricos incluyendo costes y pérdidas.",
      "Reglas de estrategia y precios históricos.",
      "Resultados históricos que ayudan a evaluar una hipótesis.",
    ],
    "research.walkforward": [
      "Responsable de validación temporal",
      "Su función es comprobar si una estrategia mantiene su comportamiento fuera del período de ajuste.",
      "Separa períodos de preparación y prueba y avanza cronológicamente sin utilizar datos futuros.",
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
  function describe(id, event) {
    const p = profile(id);
    if (!event)
      return {
        activity: "Todavía no recibió una actualización observable.",
        meaning:
          "Esta ficha explica su función. Su actividad aparecerá cuando el sistema entregue datos a este empleado.",
      };
    const out =
        event.output && typeof event.output === "object" ? event.output : {},
      input = event.input && typeof event.input === "object" ? event.input : {};
    if (out.configured === false)
      return {
        activity:
          "Está esperando que se configure su proveedor de noticias en el servidor.",
        meaning: "Todavía no puede interpretar noticias de esa fuente.",
      };
    if (out.lastError)
      return {
        activity: "Su proveedor no pudo completar la última consulta.",
        meaning:
          "La lectura más reciente necesita revisarse antes de utilizarla.",
      };
    if (id === "intake.news" && finite(input.observations))
      return {
        activity: `Revisó ${input.observations} noticias relacionadas con ${{ BTC: "Bitcoin", ETH: "Ethereum", SOL: "Solana", BNB: "BNB" }[input.asset] || "el activo de su última actualización"}.`,
        meaning: finite(out.signal)
          ? `El tono conjunto de esas noticias es ${out.signal > 0.1 ? "favorable" : out.signal < -0.1 ? "desfavorable" : "equilibrado"}. Es contexto informativo para las mesas, no una orden de operación.`
          : p.delivers,
      };
    if (finite(out.price))
      return {
        activity: `Recibió una cotización de ${out.price.toLocaleString("es-AR", { maximumFractionDigits: 2 })} dólares.`,
        meaning: id.startsWith("desk.")
          ? "La mesa tiene un precio actualizado; eso todavía no significa que haya terminado su análisis ni decidido operar."
          : "Este dato alimenta el análisis del mercado. Su recepción por sí sola no constituye una señal de compra.",
      };
    if (out.halted === true)
      return {
        activity: "El sistema está detenido por un control de riesgo.",
        meaning:
          "No debe autorizar nuevas operaciones mientras siga vigente el bloqueo.",
      };
    if (typeof out.approved === "boolean")
      return {
        activity: out.approved
          ? "La última propuesta superó la revisión de riesgo."
          : "La última propuesta fue vetada.",
        meaning: out.approved
          ? "La ejecución paper puede continuar bajo los límites revisados."
          : "La propuesta necesita resolver sus controles pendientes antes de ejecutarse.",
      };
    if (typeof out.valid === "boolean")
      return {
        activity: out.valid
          ? "La última comprobación del registro no encontró inconsistencias."
          : "La última comprobación encontró una inconsistencia en el registro.",
        meaning:
          "Esta comprobación permite revisar la trazabilidad; no evalúa la rentabilidad de una estrategia.",
      };
    if (finite(out.queue))
      return {
        activity: out.queue
          ? `Tiene ${out.queue} órdenes simuladas esperando procesamiento.`
          : "La cola de órdenes simuladas está vacía.",
        meaning:
          "Las órdenes pendientes todavía deben completar su recorrido de ejecución y control.",
      };
    if (["NO_TRADE", "FLAT"].includes(out.action))
      return {
        activity: "Su última decisión fue esperar sin proponer una operación.",
        meaning:
          "La evidencia disponible no justificó actuar bajo las condiciones del análisis.",
      };
    if (finite(out.signal))
      return {
        activity: `Su último análisis encontró una orientación ${out.signal > 0.1 ? "compradora" : out.signal < -0.1 ? "vendedora" : "sin dirección marcada"}.`,
        meaning:
          "Es un resultado del análisis, no una ejecución. Debe interpretarse junto a las otras señales y los controles de riesgo.",
      };
    if (["blocked", "veto", "error"].includes(event.status))
      return {
        activity:
          "Su última tarea quedó pendiente de resolver una condición o una falta de información.",
        meaning:
          "Este empleado no puede dar por completado ese paso hasta resolver la condición observada.",
      };
    return {
      activity: "Recibió una actualización relacionada con su responsabilidad.",
      meaning: p.delivers,
    };
  }
  return { profile, describe, ids: Object.keys(profiles) };
});
