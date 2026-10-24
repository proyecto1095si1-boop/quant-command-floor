# Changelog

Todos los cambios relevantes del proyecto se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el
proyecto usa [versionado semántico](https://semver.org/lang/es/).

## [Sin publicar]

### Añadido

- Sincronización inicial y periódica del mapa 2D con precios, inteligencia y
  estado operativo; carteles con actividad observada, antigüedad y conexión.
- El pipeline publica su análisis de mesas para actualizar los empleados durante
  una ejecución. Los valores de confianza y fórmulas fijos se sustituyen por
  resultados observados; la cabecera muestra precios cripto del mismo feed.

- El mapa 2D consume una topología canónica del backend y refleja en cada nodo
  los eventos reales de agentes, mesas y etapas del pipeline paper.
- Cada empleado incluye un inspector de sus últimos eventos reales con fuente,
  timestamp, entrada, evidencia, fórmula y salida; los campos sensibles se
  redactan antes de mostrarse.

### Eliminado

- Se retiró, con aprobación humana, la plataforma offline de calibración,
  experimentación, labels, Outcome Oracle y evaluación adversarial de IA que no
  participaba en el camino real de decisiones. Código y diseño siguen
  recuperables desde el tag `pre-recorte`.
- Se retiraron sus rutas, composición, estado visual, variables de entorno y
  pruebas asociadas. Se conservaron sin cambios los controles de riesgo,
  ejecución paper, contabilidad y auditoría.

### Cambiado

- El cartel de noticias usa la vigencia del snapshot del DAG en lugar del límite
  de 30 segundos de mercado. Así conserva el estado correcto entre refrescos
  automáticos, sin modificar elegibilidad ni consenso.

- Los feeds incluyen SOL y BNB en el arranque por defecto, con par BNBUSD
  explícito en Kraken. El DAG de inteligencia se refresca periódicamente cuando
  hay proveedores configurados; el mapa muestra el motivo de noticias sin datos.
- Las consultas actuales de inteligencia fijan `asOf` al recibir los datos,
  evitando descartar noticias que llegaron durante la petición. Los cortes
  históricos explícitos mantienen sus reglas temporales.

- La compactación de históricos comprime por bloques a un archivo temporal,
  verifica los bytes descomprimidos con SHA-256 y publica el gzip completo sin
  sobrescribir destinos. Un fallo de publicación, validación o retiro del
  original conserva el JSONL fuente y limpia los artefactos creados.

- La recuperación JSONL/gzip lee por bloques y valida checksums sin convertir
  archivos completos a strings. `tail` retiene solo su ventana y `verify` cuenta
  sin acumular eventos. La restauración de procedencia recorre la historia
  completa, incluso después del límite de 10.000 eventos del endpoint replay.

- La ejecución de pruebas usa el runner nativo de Node y descubre
  automáticamente todos los archivos `tests/*.test.js`; CI ejecuta el mismo
  comando antes de medir cobertura.
- La inteligencia externa queda limitada a Finnhub `crypto` y FRED; se retiran
  los conectores multiactivo, sus variables, UI y pruebas conforme al ADR 0042.
- El nodo técnico externo queda sin observaciones y degrada explícitamente en
  vez de usar una fuente fuera del alcance.
- La UI publicada usa Coinbase y Kraken como fallback público read-only cuando
  el backend configurado no está disponible, en vez de mostrar datos vacíos.
- Intel Hub conecta forecasts, resultados del oracle, graduación y activación
  gobernada exclusivamente como champion paper.
- Los parámetros de Intel Hub pasan por datasets Ed25519, holdout sellado de uso
  único, gates probabilísticos, cuatro ojos y shadow/canary paper antes de poder
  solicitar graduación.
- Intelligence DAG recupera snapshots con verificación SHA-256 y secuencia
  causal; sus pesos pueden evaluarse mediante walk-forward anidado purgado y
  embargado, sin autoaplicación.
- Las APIs externas alimentan un DAG point-in-time hasheado con nodos Macro,
  Noticias/Sentimiento y Técnico externo; su consenso penaliza desacuerdo y se
  incorpora a las mesas como `Intel Hub` solo con dos fuentes activas.
- Cada llamada IA reserva y concilia tokens/costo con aritmética decimal fija,
  presupuestos diarios por proveedor y agente, ledger durable y una consola
  visual `AI COST` integrada al mapa.
- Las llamadas IA usan un pool primario/secundario con circuitos e historiales
  aislados, selección determinista por salud, latencia, costo y prioridad,
  bulkheads, presupuesto por minuto y failover secuencial acotado.
- El estado del circuit breaker IA se persiste después de cada observación y
  transición mediante checkpoints encadenados; el arranque y los errores de
  almacenamiento bloquean llamadas al proveedor hasta una recuperación válida.
- Readiness ahora usa salud activa del proveedor IA —muestra rodante, tasa de
  fallos, p95 y circuit breaker— y el gateway cae explícitamente al motor
  matemático local cuando el proveedor no está disponible.
- El monitoreo secuencial separa pronóstico y resultado: impone madurez causal,
  revisiones inmutables y gates de completitud/censura antes de graduar.
- Portfolio Desk estima covarianza con shrinkage OAS y proyección PSD, calcula
  VaR Euler por activo y factor, y Risk Gate limita exposición factorial.
- Cada fill paper genera postings de doble entrada encadenados con SHA-256; los
  checkpoints y la recuperación fallan si divergen fills, journal o saldos.
- Ledger, fills L2 y métricas de ejecución usan contabilidad decimal fija de
  ocho posiciones; checkpoints conservan átomos exactos y cada snapshot expone
  el balance del invariante de equity.
- Risk Gate proyecta exposición neta firmada y exposición bruta posterior a la
  orden. Las ventas ya no se consideran siempre aumento de riesgo y los cierres
  `reduceOnly` válidos pueden reducir posiciones durante un halt.
- El WebSocket de eventos valida origen, rate limit y autenticación en
  producción; el Kill Switch principal detiene el pipeline backend y los
  controles halt/resume quedan auditados y recuperables tras reinicios.
- El gateway convierte rechazos asíncronos no manejados en respuestas HTTP
  controladas sin exponer detalles internos fuera de desarrollo.
- CI fija explícitamente Ubuntu 24.04 para evitar cambios no controlados cuando
  GitHub migra la etiqueta móvil `ubuntu-latest`.
- La cobertura mínima de líneas del servidor sube de 80 % a 84 %, respaldada
  por pruebas de los clientes HTTP directo/proxy y del conector público Kraken.
- Las herramientas de desarrollo ahora requieren una línea soportada de Node.js
  (`^20.19.0`, `^22.13.0` o `>=24`) y CI verifica las tres líneas.
- ESLint, c8, jsdom y el runtime de GitHub Actions fueron actualizados sin
  agregar dependencias de runtime.
- Riesgo e investigación anualizan retornos diarios cripto con 365 períodos en
  lugar de 252; riesgo, investigación, cartera y régimen comparten ahora una
  configuración sobrescribible.

### Añadido

- Señal read-only de noticias para BTC, ETH, SOL y BNB con causalidad
  point-in-time, deduplicación, relevancia por activo, sentimiento explicable,
  decaimiento temporal, penalización por desacuerdo y evidencia hasheada.
- Conectores read-only para Finnhub y FRED, con operaciones allowlisted,
  secretos solo backend, límites por minuto, timeout, retry, normalización, API
  interna y consola visual de estado.

- Procedencia financiera de facturas IA con firma Ed25519, allowlist de emisores,
  oracle FX multifFuente, límites de frescura/divergencia y aprobación contable
  independiente preservada en recovery.

- Conciliación point-in-time de costos IA con tarifas por proveedor/modelo,
  precios separados de entrada/salida, FX, impuestos, idempotencia, alertas de
  desvío y recuperación encadenada fail-closed.

- Recuperación fail-closed del historial de readiness con validación semántica,
  continuidad de transiciones y frontera de retención explícita.
- Readiness operacional explicable con estados READY/DEGRADED/HALTED,
  capacidades independientes, bloqueo previo a ejecución paper y estado real
  del Data Plane en cada revalidación de orden hija.
- Telemetría SLO durable en buckets sellados, recuperación fail-closed,
  detección de gaps y muestreo autónomo.
- SLO por eventos con ventanas móviles, presupuesto de error matemáticamente
  consumido y alertas de burn rate multi-ventana fast/slow.
- Backfill histórico read-only con planificación de gaps, dry-run, aprobación,
  staging separado y manifiesto de dataset hasheado.
- Checkpoints SHA-256 versionados para cuarentenas de mercado y TCA, con
  restauración fail-closed y rechazo de políticas incompatibles.
- Microestructura determinista y TCA paper con microprice, imbalance, Amihud,
  Kyle lambda, toxicidad de flujo, implementation shortfall y markouts.
- Reconciliación multifonte con mediana, frescura, cobertura de trades,
  validación L2 y cuarentena con histéresis por producto.
- Cadena SHA-256 diaria por stream de mercado, restauración de heads, detección
  de regresiones/gaps y reloj civil contrastado con tiempo monotónico.
- Outcome Oracle point-in-time multifonte: mediana robusta, staleness, finalidad,
  clock skew, divergencia, evidencia hasheada y labels sin outcomes manuales.
- Graduación de experimentos con evidencia positiva de no inferioridad global y
  por régimen, diseño de muestra, cuatro ojos y vínculo obligatorio al promover
  reemplazos del champion de consenso.
- Monitoreo prequential champion/challenger mediante log-loss pareado, e-process
  always-valid, corrección por regímenes, diagnóstico Diebold–Mariano/Newey–West
  y rollback automático exclusivamente paper.
- Gobierno de calibraciones con datasets Ed25519, split hasheado, holdout de uso
  único, gates no compensables, recuperación fail-closed y autorización de dos
  personas exclusivamente para shadow/canary paper.
- Calibración offline del consenso y dependencia multiagente mediante
  walk-forward expansivo, purga, embargo, proper scoring rules, robustez por
  régimen, ranking reproducible y recomendación sin autoaplicación.
- Correlaciones dinámicas EWMA con shrinkage adaptativo, condition number,
  detección de cambio, fallback estático y checkpoint verificable.
- Consenso multiagente por log-odds con descuento de correlación, pesos por
  régimen, tamaño efectivo, intervalo 95% y abstención obligatoria.
- Procedencia firmada Ed25519, linaje por hashes, identidad reproducible,
  calibración ECE/Brier e intervalos Wilson para datasets y empleados IA.
- Evaluación adversarial versionada de agentes IA para exactitud, prompt
  injection, grounding, schema, sesgo, estabilidad, costo y latencia, integrada
  con promotion gates de Model Governance.
- Experimentos shadow/canary paper con asignación determinista, comparación
  champion/challenger, datos hasheados, guardrails y rollback automático.
- Gobierno champion/challenger para modelos matemáticos e IA con registro
  versionado, parámetros sin secretos, PSI, KS, mean shift, evidencia fuera de
  muestra y promoción auditada por dos aprobadores.
- Motor paper de stress sistémico con catálogo versionado, shocks factoriales,
  costo de liquidación, dependencia adversa PSD, ridge factorial, reverse
  stress, capital buffer y API auditada.
- Riesgo de cola de cartera con Filtered Historical Simulation, EVT/POT,
  Expected Shortfall, backtests de Kupiec y Christoffersen y semáforo binomial
  de calidad del modelo.
- Lockfile de npm para instalaciones reproducibles en desarrollo y CI.
- Reglas editoriales compartidas mediante `.editorconfig`.
- Registro de decisiones del proyecto que requieren definición del propietario.
