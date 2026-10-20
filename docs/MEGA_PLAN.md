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

**Incremento real completo:** Coinbase primario y Kraken secundario con divergencia automática; snapshots L2, ticker, trades incrementales, velas 1m/5m/15m/1h, WebSocket opcional con reconexión, polling de recuperación, calidad robusta, persistencia JSONL con SHA-256, recuperación tras reinicio, compresión, retención, inventario, replay, carga y endpoints de observación. Para gran escala, JSONL puede sustituirse por TimescaleDB o ClickHouse sin cambiar los contratos.

## Fase 4 — Research y backtesting ✅

- Catálogo versionado de estrategias y features.
- Backtests vectorizados con fees, slippage y latencia.
- Walk-forward, Monte Carlo, sensibilidad y purged cross-validation.
- Reglas anti-overfitting y aprobación humana antes de promoción.
- Comparación champion/challenger y degradación automática.

**Salida:** pipeline research → validación → paper con puertas formales.

**Implementado:** catálogo versionado, backtest con fees/slippage, equity curve, Sharpe, drawdown, walk-forward y Monte Carlo reproducible.

## Fase 5 — Riesgo y cartera ✅

- Límites por agente, estrategia, activo, venue y cartera.
- Drawdown, VaR/CVaR, correlaciones, beta, concentración y liquidez.
- Kelly fraccionado con topes conservadores.
- Kill Switch, circuit breakers y modo reduce-only.
- Escenarios de estrés: flash crash, depeg, exchange down y latencia.

**Salida:** veto independiente, testeable y auditable.

**Implementado:** límites de drawdown, VaR, exposición, correlación y liquidez; Kelly fraccionado y halt independiente.

## Fase 6 — Paper execution ✅

- Simulador de fills basado en libro y latencia.
- TWAP/VWAP, colas, cancel/replace y medición de slippage.
- Ledger de órdenes, fills, posiciones, fees y funding.
- Reconciliación con balances paper y PnL realizado/no realizado.
- Idempotencia para impedir órdenes duplicadas.

**Salida:** ciclo completo de trading sin riesgo financiero real.

**Implementado:** broker paper idempotente, fills con fees/slippage, TWAP, posiciones, ledger y conciliación.

## Punto 2 — Mesas de cripto majors ✅

- Plantilla única para BTC, ETH, SOL y BNB.
- Technical, Volume, Whale, Liquidity, Market Structure y Order Block independientes.
- Signal Hub ponderado por confianza, penalización por desacuerdo y salida LONG/SHORT/FLAT/NO_TRADE.
- Datos Coinbase reales, controles de calidad heredados y límites máximos por activo.
- API, consola visual, evidencias por nodo y pruebas funcionales/de carga.

## Punto 3 — Pipeline operativo ✅

- Data Plane → Mesa → Signal Hub → Proposal → Risk Veto → Paper Ledger → Reconcile → Audit.
- Sizing por riesgo monetario, ATR y mandato máximo por activo.
- Límites de drawdown, VaR, exposición, correlación, liquidez y confianza.
- Ledger multi-activo con fees, slippage, impacto, PnL e idempotencia.
- Checkpoints recuperables y cadena SHA-256 verificada antes de reanudar.
- Halt/resume, bloqueo de concurrencia por activo, API y Command Center visual.

## Punto 4 — Dashboard y observabilidad ✅

- Equity curve, retorno, drawdown, VaR/CVaR, exposición, fees y desglose por activo.
- Correlaciones horarias de BTC, ETH, SOL y BNB.
- Latencias p50/p95/p99, salud de proveedores, almacenamiento y auditoría.
- Alertas graduadas, historial filtrable, inspector de runs y exportación CSV.
- Dashboard visual alimentado exclusivamente por datos persistidos y estado real.

## Fase 7 — DeFi, derivados y tesorería ✅

- Simulación de funding arbitrage, ciclos DEX y APY neto.
- Black-Scholes, superficie IV, Greeks y cobertura delta-neutral.
- Riesgo de protocolo, bridge, oracle, depeg y smart contract.
- Optimización de gas y conciliación de wallets simuladas.

**Salida:** estrategias avanzadas bajo el mismo mandato de riesgo.

**Implementado:** Black-Scholes/Delta, arbitraje triangular neto de fees, funding yield, gas optimizer y conciliación.

## Fase 8 — Auditoría y observabilidad ✅

- Event sourcing y hash chain para señales, vetos y órdenes.
- Métricas, logs y traces por agente y decisión.
- SLOs de latencia, frescura de datos y disponibilidad.
- Timeline reproducible y exportación de reportes.
- Alertas graduadas y runbooks operativos.

**Salida:** cada decisión puede explicarse y reconstruirse.

**Implementado:** cadena hash verificable, event log, métricas y estado visible. Persistencia durable queda para backend.

## Fase 9 — Seguridad y producción 🚧

- Backend aislado para secretos; rotación y mínimo privilegio.
- Autenticación, roles, aprobaciones de cuatro ojos y sesiones firmadas.
- CSP, validación de payloads, allowlists y protección SSRF.
- CI con pruebas unitarias, integración, escenarios y regresión visual.
- Despliegue privado, backups, recuperación y rollback.

**Salida:** plataforma endurecida para uso operativo controlado.

**Implementado:** validación de endpoints por allowlist, sanitización de configuración, token bucket y fronteras paper-only. Pendiente: identidad, secretos backend, CI/CD y revisión de seguridad antes de producción.

## Incremento backend local — Etapas 0 y 1 ✅

- Gateway Node sin dependencias con health check, CORS estricto y límite de payload.
- Contrato uniforme de ejecución y política `paper_only` obligatoria.
- WebSocket de eventos para que el mapa reciba resultados en vivo.
- Motores locales para Feed Manager, API Optimizer, Anomaly Detector, Social Sentiment, On-Chain y Macro News.
- Adaptador opcional OpenAI-compatible para Sentiment y Macro; credenciales únicamente en variables del servidor.
- EWMA, token bucket, Bayes, z-score clásico y z-score robusto con MAD implementados y testeados.

## Próximos tres incrementos

1. Command Center y máquina de estados global.
2. Contrato de eventos + ledger paper persistente.
3. Data adapters simulados y replay determinista.

## Incremento avanzado — Gobierno estadístico de estrategias ✅

- Purged K-Fold con zona de purga y embargo configurables.
- Probabilistic y Deflated Sharpe Ratio para corregir no normalidad y múltiples ensayos.
- Probability of Backtest Overfitting con combinaciones simétricas IS/OOS.
- Sensibilidad de parámetros, maximum drawdown y Sharpe fuera de muestra.
- Registro challenger/champion, gates parametrizables y promoción con aprobación humana obligatoria.
- API, persistencia auditable y panel interactivo de Research integrados.

## Punto 6 — Oficina avanzada de riesgo ✅

- Position sizing por stop/ATR, mandato, volatility targeting EWMA y Kelly fraccional.
- VaR histórico, CVaR, drawdown high-water, correlación, concentración y exposición bruta.
- Stress tests de crash, shock de liquidez y caída del venue sobre exposición post-trade.
- Veto explicable, halt/resume soberano y restauración del estado desde checkpoints.
- API de estado/preview y cabina visual con límites y último dictamen.

## Punto 7 — Portfolio Management ✅

- Blend configurable de risk parity y media-varianza regularizada long-only.
- Proyección iterativa con topes por activo y reserva objetivo de efectivo.
- Covarianza, volatilidad anual, contribuciones de riesgo y diversification ratio.
- Rebalanceo por banda del 2% y turnover máximo del 20% por ciclo.
- Planes paper con aprobación humana obligatoria, persistencia, API y mesa visual.

## Punto 8 — Execution Management ✅

- Aprobación humana, idempotencia y órdenes parent/child con máquina de estados.
- TWAP uniforme y VWAP por perfil de volumen, seis slices e intervalo configurable.
- Participation cap del 10% y residual explícito para no forzar liquidez.
- Revalidación independiente de Risk Gate antes de cada child order.
- Slippage/impacto, fees, conciliación, persistencia, API y panel visual paper-only.

