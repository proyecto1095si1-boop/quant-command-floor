# Inventario de empleados — E0

Total canónico: **33** empleados visuales, repartidos en nueve áreas. La cifra
anterior de 32 era incorrecta. No significa 33 ejecutores autónomos.

## Identidades y registros

La lista de IDs es `FLOOR_TOPOLOGY.areas[].nodes[]`, en
`server/floor/topology.js`. `server/employees/registry.js` proyecta esa misma
lista con los datos del área; no mantiene una segunda lista manual. Los perfiles
actuales son `dist/agent-profiles.js:ids`; el DOM real usa `.agent[data-node-id]`.

`DeskRegistry.list()`, en `server/desks/registry.js`, tiene cuatro mesas y ocho
nombres por mesa: siete resultados ponderados más Signal Hub. Son 32
asociaciones mesa/analista, no el inventario visual. Cada informe tiene seis
calculadores técnicos e Intel Hub en `agents`; Signal Hub representa el consenso
del informe, no un octavo elemento de ese array.

`server/agent-engine.js` registra seis handlers por nombres legados. Un nombre
desconocido devuelve `fallback:no-local-engine`, señal 0 y confianza 0.25:
eso no demuestra que exista un ejecutor para ese empleado. El Runtime del
navegador registra el catálogo legado de `dist/app.js`, no los 33 `nodeId` de
backend. Las etiquetas y los nombres de handlers no deben confundirse con IDs.

## Lista canónica y salidas reales

Las formas se obtuvieron de los `return`, publicaciones y lecturas del código,
no de eventos supuestos. Se muestran campos relevantes; no es un contrato de
fichas ya implementado. `[]` denota arrays y `?` datos opcionales.

Clases: **A** = lectura automática ya conectada a la UI por evento o snapshot;
**M** = ejecución manual con handler, sin feed propio; **P** = cálculo o
servicio padre existente, sin observación individual conectada; **N** = motor
inexistente. Una ruta conectada puede estar sin observaciones si falta una
fuente, configuración o ejecución.

| ID | Área | Clase | Fuente y salida existente | Estado de integración o carencia |
| --- | --- | --- | --- | --- |
| `intake.data` | Intake | A | `data/service.js`: `market.snapshot {symbol,ticker,secondary,divergenceBps,book,reconciliation}`; orquestador: etapa intake con cantidades y calidad. | Precio/libro o etapa; aún no hay entradas tipadas por fuente en la ficha. |
| `intake.news` | Intake | A | `intelligence/dag.js`: snapshot I y nodo news `{id,employee,method,signal,confidence,observations,metrics:{dispersion,rejected,evidenceHash}}`. | Polling del DAG. Su alternativa `agent.result` usa Macro News Reader, un handler bayesiano distinto al clasificador léxico del DAG. |
| `intake.sentiment` | Intake | M | `agent-engine.js`, Social Sentiment Scanner: sobre H, evidence positivos/negativos/tokens. | Entrada manual de textos. No hay feed automático de Reddit, X o Telegram. |
| `intake.onchain` | Intake | M | Handler On-Chain Analyst: sobre H; evidence net-flow, z-score, destination. | Requiere `history,net_flow,destination`; no hay fuente blockchain conectada. |
| `intake.intel` | Intake | A | `desks/registry.js`: Intel Hub, sobre S y `metrics:{snapshotHash,asOf,dispersion?,coverage?}`. | La UI también lo enlaza erróneamente al nodo market del DAG, donde `market=[]`, aun con consenso ready. Hay que distinguir ambas fuentes. |
| `desk.btc` | Mesas | A | `DeskRegistry.analyze('BTC',context)`: informe D, evento desk.analysis. | Precio BTC automático; informe solo cuando se analiza la mesa. |
| `desk.eth` | Mesas | A | `DeskRegistry.analyze('ETH',context)`: informe D. | Precio ETH no equivale a análisis ejecutado. |
| `desk.sol` | Mesas | A | `DeskRegistry.analyze('SOL',context)`: informe D. | Puede faltar por subconjunto configurado o feed no disponible. |
| `desk.bnb` | Mesas | A | `DeskRegistry.analyze('BNB',context)`: informe D. | Mismas condiciones; no inventar una cotización ni un análisis ausentes. |
| `consensus.technical` | Consenso | A | `desks/agents.js:technical`, S; `metrics:{fast,slow,rsi,atr}`; evidence EMA12, EMA26, RSI14, ATR14. | Extraído de D.agents. Usa EMA12/26, no EMA9/21 del modelo visual antiguo. |
| `consensus.volume` | Consenso | A | `agents.js:volume`, S; `metrics:{z,flow}`; evidence volume-z y OBV-flow. | Se emite al analizar una mesa. No hay acierto posterior medido. |
| `consensus.whale` | Consenso | A | `agents.js:whale`, S; `metrics:{threshold,largeTrades,buy,sell}`. | Operaciones grandes del exchange, no identidad de billeteras. |
| `consensus.liquidity` | Consenso | A | `agents.js:liquidity`, S; `metrics:{imbalance,spreadBps,bidDepth,askDepth}`. | Profundidad y spread del contexto de análisis. |
| `consensus.structure` | Consenso | A | `agents.js:marketStructure`, S; `metrics:{trend,bullBos,bearBos,lastHigh,lastLow}`. | Sin swings los extremos pueden ser infinitos en memoria y serializarse como null. |
| `consensus.orderblock` | Consenso | A | `agents.js:orderBlock`, S; sin zona `metrics:{atr}`; con zona `{direction,low,high,index,distanceAtr,inZone,atr}`. | Ausencia de zona es una salida válida, no un dato para completar. |
| `consensus.signal` | Consenso | A | `D.consensus`, campos `action,signal,confidence,agreement,blockers` y etapa signal del orquestador. | Consenso por activo; no es una predicción evaluada fuera de muestra. |
| `risk.manager` | Riesgo | A | `RiskGate.evaluate`: `{at,proposalId,decision,approved,failed,checks,metrics,stress,reduceOnlyOverrides,haltReason}`; estado `{halted,reason,limits,annualizationPeriods,highWater,reviews,lastReview}`. | Etapa risk y polling de estado, que puede reemplazar el detalle de una propuesta. |
| `risk.drawdown` | Riesgo | P | `risk-gate.js:evaluate` calcula `review.metrics.drawdown`; estado contiene highWater. | No hay evento/timestamp propio del empleado. |
| `risk.exposure` | Riesgo | P | `review.metrics` contiene pesos/exposiciones previas y posteriores, factor y exposure. | Cálculo interno de Riesgo sin enlace individual. |
| `risk.size` | Riesgo | P | `RiskGate.size`: `{qty,stopDistance,riskBudget,annualVol,annualizationPeriods,kelly,limits:{byStop,byMandate,byVol,byKelly},binding}`. | Se conserva en `proposal.sizing`, sin evento individual. |
| `execution.queue` | Ejecución | A | `ExecutionService.status`: `{paperOnly,policy,metrics,parents,queue,lastChildren,portfolio,tca}`; queued produce `{planId,approvedBy,parents,queued,paperOnly}`. | UI lee snapshot y etapa execution; applyFloorEvent no procesa execution.queued ni execution.reconciled. |
| `execution.router` | Ejecución | P | `execution/router.js:schedule`: `{children,scheduledNotional,residualNotional,profile}`; cada hijo tiene símbolo, lado, cantidad, notional, hora, estado, algoritmo y tipo. | Plan interno de submit, sin evento del empleado. |
| `execution.broker` | Ejecución | P | `PaperLedger.execute`: éxito `{status,fill,remainingQty}`; espera/rechazo `{status,reason}`. Fill incluye símbolo, lado, qty, price, mid, notional, fee, feeRate, liquidityRole, fillModel, slippageBps, horas, latencyMs, liquidity y journal. | La etapa execution se asigna a queue, no a broker. |
| `portfolio.manager` | Cartera | A | `PaperLedger.snapshot`: `{initialCash,cash,equity,marketValue,grossExposure,realizedPnl,unrealizedPnl,fees,fills,positions,journal,accounting}`. | Mapa proyecta pipeline.portfolio; existe además PortfolioService.status con policy, lastPlan y plans. |
| `portfolio.allocation` | Cartera | P | `PortfolioService.plan`: `{id,createdAt,method,observations,equity,cashTarget,allocations,diagnostics,rebalancing,approval}`. | Persistido en portfolio.plans, no conectado al nodo ni incluido como plan en floor snapshot. |
| `portfolio.rebalance` | Cartera | P | Plan anterior: `allocations[].{currentWeight,targetWeight,tradeWeight,tradeNotional}` y `rebalancing:{turnover,rawTurnover,scaled,band,maxTurnover}`. | Una propuesta de rebalanceo no es una orden ejecutada ni una observación del empleado. |
| `audit.writer` | Auditoría | A | `Sha256AuditChain.verify`: `{valid:true,count,head}` o `{valid:false,brokenAt}`; filas `{seq,type,payload,prev,at,hash}`. | Snapshot pipeline.audit. Etapa reconcile contiene datos de cartera, no una nueva verificación de la cadena. |
| `research.miner` | Laboratorio | N | No hay motor Strategy Miner en backend. Un nombre desconocido recibe fallback en agent-engine. | Los retornos sintéticos por defecto de ResearchLab no son minería ni ML entrenado. |
| `research.backtest` | Laboratorio | P | `ResearchLab.evaluate`: `{id,version,createdAt,status,observations,metrics,checks,folds,foldMetrics,sensitivity,pbo,promotion}`. | Persistido en research.evaluation, sin enlace al empleado; declarar cuando sus entradas sean sintéticas. |
| `research.walkforward` | Laboratorio | P | `validation.js:purgedKFold`: `[{fold,start,end,train,test,purge,embargo}]`; laboratorio añade foldMetrics con trainSharpe/oosSharpe y tamaños. | Validación purgada, no un optimizador autónomo con ese nombre. `dist/research.js` es otra simulación local. |
| `sre.feeds` | SRE | A | Proyección market.snapshot. `data.health()` aporta status, products, cycleAgeMs, source, secondary, stream, quality, metrics, provenance y reconciliation. | UI recibe cotización, no historial de SLO. El handler legado Data Engineer (Feed Manager) no coincide con Feed Manager. |
| `sre.api` | SRE | P | `SreService.snapshot`: `{at,status,slos,slis,objectives,burnAlerts,telemetry,checks,services,journal,incidents,backups}`; slis incluye availability, p95LatencyMs, dataFreshnessMs, burnRate, errorBudgetRemaining, audit. | Servicio existente, no conectado al ID. API Monitor tampoco coincide con el handler legado API Optimizer. |
| `sre.anomaly` | SRE | M | Handler Anomaly Detector: H, evidence median/mad/robust-z/anomaly. También recibe etapa error con `{message}`. | Un error operativo no demuestra detección estadística ni ejecución de ML. |

## Sobres compartidos y contexto

**S**, `server/desks/math.js:result`:

```text
{agent, version, status, signal, confidence, evidence, metrics}
```

No contiene activo/hora propios; ambos deben conservarse desde el informe padre.

**D**, `server/desks/registry.js:analyze`:

```text
{asset, product, at, status, action, signal, confidence, agreement,
 consensus, dependence, blockers, agents:[S],
 inputSummary:{candles,trades,bids,asks,quality,intelligence},
 policy:{paperOnly,maxPortfolioWeight,riskClass,factor}, formula}
```

**H**, `server/agent-engine.js:base`:

```text
{agent_id, version, status, signal, confidence, evidence, latency_ms, at}
```

No contiene el activo ni una copia completa de las entradas. El gateway puede
emitir también resultados de IA con su contrato/fallback; H describe el motor
local, no toda respuesta posible del proveedor externo.

**I**, `server/intelligence/dag.js:refresh`:

```text
{version, asset, asOf, paperOnly, nodes, consensus, provenance, hash}
```

Provenance contiene provider, operation, records, error y dataHash, no claves.

**Etapa**, `server/pipeline/orchestrator.js:stage`:

```text
{type:"pipeline.stage", runId, asset, stage:{name,status,at,payload}}
```

Etapas reales: intake, signal, proposal, risk, execution, reconcile y error.
La topología declara audit.writer.stage=“audit”, que el orquestador no emite;
la UI lo asigna a reconcile. Las relaciones deben usar el cableado comprobado.

## Disponibilidad, desempeño y límites del inventario

Hay 19 nodos con alguna lectura automática, 3 con handler manual/error y 11 sin
observación personal conectada: 10 proyecciones de cálculos/servicios y un motor
inexistente. No significa que los 19 estén trabajando constantemente.

Los feeds consultan cuatro activos por defecto, pero MARKET_PRODUCTS puede
restringirlos. Finnhub/FRED requieren configuración; precios y noticias además
deben superar frescura, calidad y elegibilidad. Este inventario se verificó por
código y pruebas sin red externa, no consultando exchanges con credenciales.

No existe aún EmployeeCard ni GET /v1/employees. Las entradas de las fichas son
textos, no listas tipadas de observaciones. Confidence es heurístico: no es tasa
de acierto medida ni calibración empírica.

El historial de fichas retiene 20 eventos en el navegador. El gateway conserva
hasta 100 últimas claves tipo/activo/etapa. Se pierden al reiniciar cada proceso;
no son una serie de desempeño por empleado.

El Outcome Oracle fue retirado en R4, confirmado en
`docs/DECISIONES_PENDIENTES.md` y el informe de recorte. El FxOracle aún presente
en `server/finance/provenance.js` verifica tipos de cambio contables, no retornos
futuros. Ejecución sí tiene TCA y markouts de 60/300 s; precios persistidos y
auditoría existen. No hay evaluador de aciertos a 5 min por empleado. E4 debe
resolver esa medición expresamente dentro del alcance, sin restaurar gobernanza
retirada de manera silenciosa.

Muchos parámetros reales son literales internos, no constantes exportadas:
por ejemplo EMA12/26 y ventanas 60/100. E1 deberá exponer la misma configuración
que utiliza el cálculo; copiar esos números en una ficha no cumple la regla de
una sola fuente de verdad.

## Verificación automática

`tests/employee-inventory.test.js` compara exactamente registro, perfiles y DOM
del mapa, tanto fallback como topología cargada. Contrasta las cuatro mesas y
todos sus analistas. Selecciona los 33 empleados y comprueba que no se emitan
peticiones de ejecución. También compara los IDs de esta tabla con el registro.
El test no usa red.

```sh
node --test tests/employee-inventory.test.js
npm ci && npm test && npm run lint && npm run format:check && npm run coverage
```

E0 no añade telemetría ni cambia riesgo, ejecución o contabilidad. E1 debe crear
el contrato y el servicio backend distinguiendo observaciones reales de vacíos
accionables.

Línea base: 63 tests, 63 pass, 0 fail, cobertura de líneas 89.97%. Después de
E0: 64 tests, 64 pass, 0 fail, cobertura 89.99%. Lint y formato correctos en
ambas ejecuciones. No se verificaron aquí respuestas reales de exchanges ni
proveedores de noticias; las pruebas usan entradas y fetch controlados.
