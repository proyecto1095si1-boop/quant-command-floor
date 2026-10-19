# Mega plan — Quant Command Floor

## Visión

Construir un sistema operativo visual para un hedge fund cripto multiagente. El mapa no será solo una representación: mostrará estado, dependencias, evidencia, decisiones, riesgo, ejecución paper y auditoría en una misma superficie.

## Principios no negociables

1. Paper trading por defecto; ninguna clave privada ni orden real en el navegador.
2. Riesgo tiene veto técnico y no puede ser omitido por un agente IA.
3. Cada señal conserva evidencia, versión del modelo y trazabilidad.
4. Los datos simulados y reales deben estar etiquetados explícitamente.
5. Todo conector externo aplica timeout, rate limit y circuit breaker.
6. Una IA propone; los motores deterministas limitan y verifican.

## Fase 1 — Núcleo operativo ✅

- Modelo canónico de las nueve áreas y 27 agentes.
- Command Center con pausa, escenarios y Kill Switch.
- Estado global: `running`, `paused`, `halted`.
- Configuración local de cerebro, peso y endpoint por agente.
- Grafo visual y trazas de decisión reproducibles.

**Salida:** simulador coherente, navegable y seguro sin dependencias externas.

## Fase 2 — Runtime multiagente 🚧

- Contrato uniforme `AgentInput → AgentResult` con evidencia y confianza.
- Adaptadores para nodos matemáticos, modelos locales y APIs IA.
- Orquestador con DAG, dependencias, reintentos y presupuestos de tiempo.
- Registro de versiones de prompt, modelo, parámetros y datasets.
- Sandbox de Code Generator; nunca ejecutar código generado directamente.

**Implementado:** contrato de resultado, EventBus acotado, registro versionado, adaptadores matemático/IA/híbrido, timeout, reintentos y ejecución DAG. Pendiente: backend seguro para proveedores reales y sandbox de código.

**Salida:** agentes sustituibles sin acoplar la interfaz a un proveedor.

## Fase 3 — Data plane ✅

- WebSockets de exchanges con normalización de trades y order books.
- Velas multi-timeframe, funding, open interest y volatilidad.
- Ingesta on-chain, macro, noticias y sentimiento.
- Detección de huecos, datos viejos, outliers y divergencia entre fuentes.
- Replay determinista para depurar cualquier decisión histórica.

**Salida:** datos confiables con salud y procedencia visibles.

**Implementado:** normalización, frescura, detección de huecos/outliers, divergencia multi-fuente, snapshot y replay determinista. Los conectores reales de exchange quedan para la integración backend.

## Fase 4 — Research y backtesting ✅

- Catálogo versionado de estrategias y features.
- Backtests vectorizados con fees, slippage y latencia.
- Walk-forward, Monte Carlo, sensibilidad y purged cross-validation.
- Reglas anti-overfitting y aprobación humana antes de promoción.
- Comparación champion/challenger y degradación automática.

**Salida:** pipeline research → validación → paper con puertas formales.

**Implementado:** catálogo versionado, backtest con fees/slippage, equity curve, Sharpe, drawdown, walk-forward y Monte Carlo reproducible.

## Fase 5 — Riesgo y cartera

- Límites por agente, estrategia, activo, venue y cartera.
- Drawdown, VaR/CVaR, correlaciones, beta, concentración y liquidez.
- Kelly fraccionado con topes conservadores.
- Kill Switch, circuit breakers y modo reduce-only.
- Escenarios de estrés: flash crash, depeg, exchange down y latencia.

**Salida:** veto independiente, testeable y auditable.

## Fase 6 — Paper execution

- Simulador de fills basado en libro y latencia.
- TWAP/VWAP, colas, cancel/replace y medición de slippage.
- Ledger de órdenes, fills, posiciones, fees y funding.
- Reconciliación con balances paper y PnL realizado/no realizado.
- Idempotencia para impedir órdenes duplicadas.

**Salida:** ciclo completo de trading sin riesgo financiero real.

## Fase 7 — DeFi, derivados y tesorería

- Simulación de funding arbitrage, ciclos DEX y APY neto.
- Black-Scholes, superficie IV, Greeks y cobertura delta-neutral.
- Riesgo de protocolo, bridge, oracle, depeg y smart contract.
- Optimización de gas y conciliación de wallets simuladas.

**Salida:** estrategias avanzadas bajo el mismo mandato de riesgo.

## Fase 8 — Auditoría y observabilidad

- Event sourcing y hash chain para señales, vetos y órdenes.
- Métricas, logs y traces por agente y decisión.
- SLOs de latencia, frescura de datos y disponibilidad.
- Timeline reproducible y exportación de reportes.
- Alertas graduadas y runbooks operativos.

**Salida:** cada decisión puede explicarse y reconstruirse.

## Fase 9 — Seguridad y producción

- Backend aislado para secretos; rotación y mínimo privilegio.
- Autenticación, roles, aprobaciones de cuatro ojos y sesiones firmadas.
- CSP, validación de payloads, allowlists y protección SSRF.
- CI con pruebas unitarias, integración, escenarios y regresión visual.
- Despliegue privado, backups, recuperación y rollback.

**Salida:** plataforma endurecida para uso operativo controlado.

## Próximos tres incrementos

1. Command Center y máquina de estados global.
2. Contrato de eventos + ledger paper persistente.
3. Data adapters simulados y replay determinista.

