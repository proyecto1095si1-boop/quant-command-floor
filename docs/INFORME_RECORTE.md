# Informe de recorte

## R0 · Línea base

Fecha UTC: 2026-10-23.

### Punto de recuperación

- Tag anotado: `pre-recorte`.
- Commit protegido: `fe4692c6c5b6b1dda460709e89fad440480ba143`.
- Tag publicado en `origin`; no se reescribió historial ni se usó force push.

### Verificación funcional

El comando obligatorio de línea base fue:

```text
npm ci && npm test && npm run lint && npm run format:check && npm run coverage
```

Resultado:

```text
npm ci: added 157 packages
npm test: exit 0
npm run lint: exit 0
npm run format:check: All matched files use Prettier code style!
npm run coverage: exit 0
```

### Tests

El proyecto todavía usa scripts ejecutables independientes, no el runner
`node:test`. Para que la futura comparación R5 sea inequívoca se guardan tres
medidas:

| Medida                                      | Línea base |
| ------------------------------------------- | ---------: |
| Archivos invocados por `pretest` + `test`   |         60 |
| Archivos `.test.js` existentes              |         71 |
| Llamadas estáticas a assertions reconocidas |      1.279 |

La diferencia de 11 archivos demuestra el riesgo que R5 pretende corregir: un
archivo nuevo puede existir y no ser ejecutado por las cadenas manuales.

### Cobertura de `server/`

| Métrica    | Cubierto |  Total | Porcentaje |
| ---------- | -------: | -----: | ---------: |
| Líneas     |   17.302 | 18.905 |    91,52 % |
| Statements |   17.302 | 18.905 |    91,52 % |
| Funciones  |      671 |    728 |    92,17 % |
| Branches   |    4.106 |  5.252 |    78,17 % |

El umbral obligatorio de líneas es 84 %; la línea base lo supera por 7,52
puntos porcentuales.

### Tamaño antes del recorte

Las líneas se calcularon sobre todos los archivos regulares de cada directorio;
los bytes corresponden a `du -sb`.

| Directorio | Archivos |     Líneas |         Bytes |
| ---------- | -------: | ---------: | ------------: |
| `server/`  |       78 |     18.905 |       602.689 |
| `tests/`   |       74 |      8.811 |       271.951 |
| `docs/`    |       81 |      4.297 |       207.910 |
| **Total**  |  **233** | **32.013** | **1.082.550** |

### Estado de R0

Cumplido. Este documento todavía no contiene la clasificación módulo por
módulo solicitada en R2; esa inspección pertenece a una tarea y PR separados.
No se eliminó ni archivó ningún archivo.

## R2 · Informe de módulos (solo lectura)

Fecha UTC: 2026-10-23. Rama: `docs/r2-module-cutback-report`.

Esta sección es un análisis estático y de composición del runtime. No se eliminó,
movió ni modificó código de producción. Se resolvieron los `require()` relativos
desde `server/index.js` y se contrastaron con la construcción de servicios y las
rutas de `server/gateway.js`.

### Criterio de clasificación

- **núcleo**: participa en el camino que puede producir o rechazar una decisión
  paper: datos → desks/inteligencia → consenso → risk gate → fill paper →
  auditoría/contabilidad.
- **soporte**: operación, observabilidad, investigación, API o diagnóstico; se
  ejecuta en producción, pero no decide por sí mismo una orden del camino
  canónico.
- **gobernanza**: evaluación, promoción, calibración o procedencia de modelos y
  datasets. Si algún archivo de esta clase es dependencia del camino real queda
  congelado y no es candidato automático.
- **fuera de alcance**: implementa, total o parcialmente, acciones, ETFs o forex.

En la columna «camino» se usa **sí** para el camino canónico, **control** para un
bloqueo de seguridad/readiness, **alterno** para endpoints paper que pueden
ejecutarse por fuera del orquestador canónico y **no** para capacidades auxiliares.

### Inventario completo de `server/`

Los 78 archivos están alcanzables estáticamente desde `server/index.js`; no hay
un módulo completamente huérfano por imports. Alcanzable no equivale a estar en
el camino real: muchos solo respaldan endpoints administrativos.

| Archivo                                    | Líneas | Importado por                                                                                                                                                                                                                                                                                             | Clase                      | Camino    |
| ------------------------------------------ | -----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | --------- |
| `server/agent-engine.js`                   |    211 | `gateway.js`                                                                                                                                                                                                                                                                                              | soporte                    | no        |
| `server/ai/cost-ledger.js`                 |    269 | `index.js`                                                                                                                                                                                                                                                                                                | soporte                    | no        |
| `server/ai/cost-reconciliation.js`         |    412 | `index.js`                                                                                                                                                                                                                                                                                                | soporte                    | no        |
| `server/ai/provider-health.js`             |    397 | `index.js`                                                                                                                                                                                                                                                                                                | soporte                    | control   |
| `server/ai/provider-pool.js`               |    252 | `index.js`                                                                                                                                                                                                                                                                                                | soporte                    | no        |
| `server/config/annualization.js`           |      8 | `pipeline/risk-gate.js`, `portfolio/math.js`, `regime/service.js`, `research/lab.js`, `research/statistics.js`, `research/validation.js`, `risk/math.js`                                                                                                                                                  | núcleo                     | sí        |
| `server/config/checkpoint.js`              |     36 | `ai/cost-ledger.js`, `ai/cost-reconciliation.js`, `ai/provider-health.js`, `data/backfill.js`, `data/reconciliation.js`, `execution/tca.js`, `finance/provenance.js`, `sre/readiness.js`, `sre/telemetry.js`                                                                                              | soporte                    | control   |
| `server/config/trading-mode.js`            |      5 | `pipeline/paper-ledger.js`                                                                                                                                                                                                                                                                                | núcleo                     | sí        |
| `server/dashboard/analytics.js`            |     64 | `dashboard/service.js`                                                                                                                                                                                                                                                                                    | soporte                    | no        |
| `server/dashboard/service.js`              |    188 | `index.js`                                                                                                                                                                                                                                                                                                | soporte                    | no        |
| `server/data/backfill.js`                  |    222 | `data/service.js`                                                                                                                                                                                                                                                                                         | soporte                    | no        |
| `server/data/candles.js`                   |     54 | `data/service.js`                                                                                                                                                                                                                                                                                         | núcleo                     | sí        |
| `server/data/coinbase-stream.js`           |    107 | `data/service.js`                                                                                                                                                                                                                                                                                         | núcleo                     | sí        |
| `server/data/coinbase.js`                  |     97 | `data/service.js`                                                                                                                                                                                                                                                                                         | núcleo                     | sí        |
| `server/data/http-client.js`               |     82 | `data/coinbase.js`, `data/kraken.js`, `intelligence/connectors.js`                                                                                                                                                                                                                                        | núcleo                     | sí        |
| `server/data/jsonl-store.js`               |    158 | `data/service.js`                                                                                                                                                                                                                                                                                         | núcleo                     | sí        |
| `server/data/kraken.js`                    |     85 | `data/service.js`                                                                                                                                                                                                                                                                                         | núcleo                     | sí        |
| `server/data/normalizers.js`               |     86 | `data/coinbase.js`, `data/service.js`                                                                                                                                                                                                                                                                     | núcleo                     | sí        |
| `server/data/order-book.js`                |     97 | `data/service.js`                                                                                                                                                                                                                                                                                         | núcleo                     | sí        |
| `server/data/provenance.js`                |    174 | `data/service.js`                                                                                                                                                                                                                                                                                         | núcleo                     | sí        |
| `server/data/quality.js`                   |     86 | `data/service.js`                                                                                                                                                                                                                                                                                         | núcleo                     | sí        |
| `server/data/reconciliation.js`            |    251 | `data/service.js`                                                                                                                                                                                                                                                                                         | núcleo                     | sí        |
| `server/data/service.js`                   |    415 | `index.js`                                                                                                                                                                                                                                                                                                | núcleo                     | sí        |
| `server/data/trusted-clock.js`             |     65 | `data/service.js`                                                                                                                                                                                                                                                                                         | núcleo                     | sí        |
| `server/decision/consensus.js`             |    269 | `desks/registry.js`, `governance/calibration.js`, `research/consensus-calibration.js`                                                                                                                                                                                                                     | núcleo                     | sí        |
| `server/decision/dependence.js`            |    392 | `desks/registry.js`, `research/consensus-calibration.js`                                                                                                                                                                                                                                                  | núcleo                     | sí        |
| `server/desks/agents.js`                   |    193 | `desks/registry.js`                                                                                                                                                                                                                                                                                       | núcleo                     | sí        |
| `server/desks/math.js`                     |     60 | `desks/agents.js`, `desks/registry.js`                                                                                                                                                                                                                                                                    | núcleo                     | sí        |
| `server/desks/registry.js`                 |    209 | `gateway.js`, `pipeline/orchestrator.js`                                                                                                                                                                                                                                                                  | núcleo                     | sí        |
| `server/env.js`                            |     24 | `index.js`                                                                                                                                                                                                                                                                                                | soporte                    | no        |
| `server/execution/book.js`                 |     73 | `pipeline/paper-ledger.js`                                                                                                                                                                                                                                                                                | núcleo                     | sí        |
| `server/execution/microstructure.js`       |     96 | `data/service.js`, `execution/tca.js`                                                                                                                                                                                                                                                                     | núcleo                     | sí        |
| `server/execution/router.js`               |     65 | `execution/service.js`                                                                                                                                                                                                                                                                                    | núcleo                     | alterno   |
| `server/execution/service.js`              |    273 | `index.js`                                                                                                                                                                                                                                                                                                | núcleo                     | alterno   |
| `server/execution/tca.js`                  |    138 | `execution/service.js`                                                                                                                                                                                                                                                                                    | soporte                    | alterno   |
| `server/finance/provenance.js`             |    152 | `ai/cost-reconciliation.js`, `index.js`                                                                                                                                                                                                                                                                   | soporte                    | no        |
| `server/gateway.js`                        |  1.549 | `index.js`                                                                                                                                                                                                                                                                                                | soporte                    | sí        |
| `server/governance/ai-evaluation.js`       |    649 | `index.js`                                                                                                                                                                                                                                                                                                | gobernanza                 | no        |
| `server/governance/calibration.js`         |    514 | `index.js`                                                                                                                                                                                                                                                                                                | gobernanza                 | no        |
| `server/governance/experiments.js`         |    931 | `index.js`                                                                                                                                                                                                                                                                                                | gobernanza                 | no        |
| `server/governance/intelligence.js`        |    615 | `index.js`                                                                                                                                                                                                                                                                                                | gobernanza                 | no        |
| `server/governance/labels.js`              |    125 | `governance/experiments.js`                                                                                                                                                                                                                                                                               | gobernanza                 | no        |
| `server/governance/math.js`                |    142 | `governance/service.js`                                                                                                                                                                                                                                                                                   | gobernanza                 | no        |
| `server/governance/outcome-oracle.js`      |    267 | experimentos, `index.js`                                                                                                                                                                                                                                                                                  | gobernanza                 | no        |
| `server/governance/provenance.js`          |    168 | `governance/ai-evaluation.js`, `governance/calibration.js`, `governance/intelligence.js`, `index.js`                                                                                                                                                                                                      | gobernanza                 | no        |
| `server/governance/sequential.js`          |    245 | `governance/experiments.js`                                                                                                                                                                                                                                                                               | gobernanza                 | no        |
| `server/governance/service.js`             |    505 | `decision/dependence.js`, `desks/registry.js`, `governance/ai-evaluation.js`, `governance/calibration.js`, `governance/experiments.js`, `governance/intelligence.js`, `governance/labels.js`, `governance/outcome-oracle.js`, `governance/provenance.js`, `research/consensus-calibration.js`, `index.js` | gobernanza                 | sí (hash) |
| `server/index.js`                          |    551 | entrada del proceso                                                                                                                                                                                                                                                                                       | soporte                    | sí        |
| `server/intelligence/calibration.js`       |    360 | gobernanza de inteligencia, research                                                                                                                                                                                                                                                                      | gobernanza                 | no        |
| `server/intelligence/connectors.js`        |    472 | `index.js`                                                                                                                                                                                                                                                                                                | fuera de alcance (parcial) | sí        |
| `server/intelligence/dag.js`               |    457 | `index.js`                                                                                                                                                                                                                                                                                                | núcleo                     | sí        |
| `server/llm-client.js`                     |    113 | pool IA, `gateway.js`                                                                                                                                                                                                                                                                                     | soporte                    | no        |
| `server/math/fixed-decimal.js`             |     77 | `ai/cost-ledger.js`, `ai/cost-reconciliation.js`, `execution/book.js`, `execution/service.js`, `finance/provenance.js`, `pipeline/paper-ledger.js`                                                                                                                                                        | núcleo                     | sí        |
| `server/pipeline/audit.js`                 |     47 | journal, orquestador y SRE                                                                                                                                                                                                                                                                                | núcleo                     | sí        |
| `server/pipeline/journal.js`               |    243 | `pipeline/paper-ledger.js`                                                                                                                                                                                                                                                                                | núcleo                     | sí        |
| `server/pipeline/orchestrator.js`          |    322 | `index.js`                                                                                                                                                                                                                                                                                                | núcleo                     | sí        |
| `server/pipeline/paper-ledger.js`          |    522 | `pipeline/orchestrator.js`                                                                                                                                                                                                                                                                                | núcleo                     | sí        |
| `server/pipeline/risk-gate.js`             |    272 | `pipeline/orchestrator.js`                                                                                                                                                                                                                                                                                | núcleo                     | sí        |
| `server/portfolio/math.js`                 |    370 | `portfolio/service.js`, `risk/dependency.js`                                                                                                                                                                                                                                                              | soporte                    | alterno   |
| `server/portfolio/service.js`              |    206 | `index.js`                                                                                                                                                                                                                                                                                                | soporte                    | alterno   |
| `server/regime/math.js`                    |     90 | `regime/service.js`                                                                                                                                                                                                                                                                                       | núcleo                     | sí        |
| `server/regime/service.js`                 |    110 | `index.js`                                                                                                                                                                                                                                                                                                | núcleo                     | sí        |
| `server/research/consensus-calibration.js` |    349 | gobernanza de calibración, research                                                                                                                                                                                                                                                                       | gobernanza                 | no        |
| `server/research/lab.js`                   |    184 | `index.js`                                                                                                                                                                                                                                                                                                | soporte                    | no        |
| `server/research/statistics.js`            |    111 | lab y validación                                                                                                                                                                                                                                                                                          | soporte                    | no        |
| `server/research/validation.js`            |     93 | `research/lab.js`                                                                                                                                                                                                                                                                                         | soporte                    | no        |
| `server/risk/dependency.js`                |    190 | stress engine                                                                                                                                                                                                                                                                                             | soporte                    | alterno   |
| `server/risk/liquidity.js`                 |     76 | stress engine                                                                                                                                                                                                                                                                                             | soporte                    | alterno   |
| `server/risk/math.js`                      |     82 | `pipeline/orchestrator.js`, `pipeline/risk-gate.js`, `portfolio/service.js`, `risk/dependency.js`, `risk/tail.js`                                                                                                                                                                                         | núcleo                     | sí        |
| `server/risk/reverse-stress.js`            |     76 | stress engine                                                                                                                                                                                                                                                                                             | soporte                    | alterno   |
| `server/risk/scenarios.js`                 |    125 | stress engine                                                                                                                                                                                                                                                                                             | soporte                    | alterno   |
| `server/risk/stress-engine.js`             |    261 | cartera                                                                                                                                                                                                                                                                                                   | soporte                    | alterno   |
| `server/risk/tail.js`                      |    368 | cartera                                                                                                                                                                                                                                                                                                   | soporte                    | alterno   |
| `server/security/manager.js`               |    121 | `gateway.js`                                                                                                                                                                                                                                                                                              | soporte                    | control   |
| `server/sre/readiness.js`                  |    477 | `index.js`                                                                                                                                                                                                                                                                                                | soporte                    | control   |
| `server/sre/service.js`                    |    339 | `index.js`                                                                                                                                                                                                                                                                                                | soporte                    | control   |
| `server/sre/slo.js`                        |    158 | `sre/service.js`                                                                                                                                                                                                                                                                                          | soporte                    | control   |
| `server/sre/telemetry.js`                  |    208 | `sre/service.js`                                                                                                                                                                                                                                                                                          | soporte                    | control   |

### Camino real verificado

El camino canónico se compone en `server/index.js` y se ejecuta en
`TradingPipeline.run()`:

1. `MarketDataService` entrega velas, trades, libro L2, calidad y procedencia.
2. `IntelligenceDag` puede aportar el snapshot externo al `DeskRegistry`.
3. `DeskRegistry` ejecuta agentes matemáticos y `ConsensusEngine`; la dependencia
   dinámica ajusta señales correlacionadas.
4. `RiskGate` evalúa exposición, volatilidad, stops y bloqueos antes de crear la
   orden paper.
5. `PaperLedger` aplica `PAPER_ONLY`, consume L2 o impacto y contabiliza el fill.
6. `DoubleEntryJournal` y `Sha256AuditChain` registran contabilidad y auditoría.

`PortfolioService` + `ExecutionService` forman una ruta paper alterna de
rebalanceo con revalidación de riesgo. No envían órdenes reales, pero no son la
ruta invocada por `TradingPipeline.run()`. La gobernanza expuesta por API no
promueve ni modifica automáticamente una señal del pipeline actual.

### Inventario de ADRs

«Real» significa que describe código del camino canónico anterior. «No» no
significa que el código esté huérfano: puede respaldar seguridad, SRE,
investigación o endpoints administrativos.

|  ADR | Decisión                             | Código del camino real   | Clasificación            |
| ---: | ------------------------------------ | ------------------------ | ------------------------ |
| 0001 | anualización cripto 365              | sí                       | núcleo                   |
| 0002 | fills paper L2                       | sí                       | núcleo                   |
| 0003 | riesgo side-aware/reduce-only        | sí                       | núcleo                   |
| 0004 | contabilidad decimal fija            | sí                       | núcleo                   |
| 0005 | journal de doble entrada             | sí                       | núcleo                   |
| 0006 | riesgo robusto de cartera            | no                       | soporte alterno          |
| 0007 | riesgo de cola/backtesting           | no                       | soporte alterno          |
| 0008 | stress testing avanzado              | no                       | soporte alterno          |
| 0009 | champion/challenger y drift          | no                       | gobernanza               |
| 0010 | shadow/canary paper                  | no                       | gobernanza               |
| 0011 | evaluación adversarial IA            | no                       | gobernanza               |
| 0012 | procedencia firmada de datasets      | no                       | gobernanza               |
| 0013 | consenso ajustado por correlación    | sí                       | núcleo                   |
| 0014 | dependencia dinámica EWMA            | sí                       | núcleo                   |
| 0015 | calibración purgada walk-forward     | no                       | gobernanza               |
| 0016 | holdout firmado de uso único         | no                       | gobernanza               |
| 0017 | monitoreo secuencial e-process       | no                       | gobernanza               |
| 0018 | evidencia positiva para promoción    | no                       | gobernanza               |
| 0019 | ciclo causal de labels               | no                       | gobernanza               |
| 0020 | outcome oracle point-in-time         | no                       | gobernanza               |
| 0021 | cadena de mercado y reloj monotónico | sí                       | núcleo                   |
| 0022 | reconciliación y cuarentena          | sí                       | núcleo                   |
| 0023 | TCA causal paper                     | no                       | soporte alterno          |
| 0024 | checkpoints ligados a política       | no                       | soporte/control          |
| 0025 | backfill histórico staged            | no                       | soporte                  |
| 0026 | burn rate SLO multi-ventana          | no                       | soporte/control          |
| 0027 | buckets SLO durables                 | no                       | soporte/control          |
| 0028 | readiness no compensable             | no                       | soporte/control          |
| 0029 | recovery chain de readiness          | no                       | soporte/control          |
| 0030 | circuit breaker de proveedor IA      | no                       | soporte/control          |
| 0031 | salud IA durable                     | no                       | soporte/control          |
| 0032 | pool IA aislado                      | no                       | soporte                  |
| 0033 | ledger de costos IA                  | no                       | soporte                  |
| 0034 | conciliación de costos IA            | no                       | soporte                  |
| 0035 | facturas firmadas y FX               | no                       | soporte                  |
| 0036 | conectores de inteligencia read-only | parcial                  | fuera de alcance parcial |
| 0037 | DAG de inteligencia point-in-time    | sí                       | núcleo                   |
| 0038 | calibración y recuperación Intel DAG | parcial: recuperación sí | núcleo/gobernanza        |
| 0039 | gobierno de parámetros Intel Hub     | no                       | gobernanza               |
| 0040 | ciclo de outcomes de inteligencia    | no                       | gobernanza               |
| 0041 | conector Yahoo read-only             | no                       | fuera de alcance         |

Resumen: 12 ADRs describen directamente el camino real (`0001`–`0005`, `0013`,
`0014`, `0021`, `0022`, `0037` y las partes operativas de `0036`/`0038`); 12 son
solo gobernanza (`0009`–`0012`, `0015`–`0020`, `0039`, `0040`); 16 documentan
soporte o rutas alternas; `0041` es enteramente fuera de alcance. Las partes de
`0036` referidas a Yahoo, Polygon, FMP bursátil y categorías no cripto también
están fuera de alcance.

### Candidatos propuestos para aprobación

Nada de esta lista se eliminó. R3 tiene un mandato independiente para recortar
conectores; R4 solo podrá aplicar los candidatos que el dueño apruebe después de
leer este informe.

| Candidato                                                                      | Acción propuesta                             | Motivo                                                                                            | Riesgo de retirarlo                                                       |
| ------------------------------------------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Yahoo en `intelligence/connectors.js` y `intelligence/dag.js`                  | R3: eliminar                                 | ADR 0041 y proveedor multiactivo fuera del alcance                                                | perder una fuente histórica secundaria; adaptar recuperación de snapshots |
| Polygon en conectores/DAG                                                      | R3: eliminar                                 | proveedor de acciones/forex fuera del alcance                                                     | menor redundancia de precios; actualizar quorum y tests                   |
| FMP (`profile`, `stock-latest`)                                                | R3: eliminar el proveedor bursátil completo  | el scope test lo identifica como acciones y R3 exige que `stock-latest` desaparezca               | retirar estado/UI/tests y confirmar que ningún nodo cripto esperaba FMP   |
| categorías Finnhub `general`, `forex`, `merger`                                | R3: dejar solo `crypto`                      | noticias no cripto fuera del producto                                                             | menor cobertura macro; el pipeline debe degradar explícitamente           |
| `governance/ai-evaluation.js`                                                  | R4 opcional                                  | endpoint administrativo, no altera decisiones paper                                               | se pierde evaluación adversarial y evidencia previa a cambios de IA       |
| `governance/calibration.js`                                                    | R4 opcional                                  | calibración gobernada no aplicada automáticamente al pipeline                                     | se pierde flujo reproducible para calibrar consenso                       |
| `governance/experiments.js`, `labels.js`, `outcome-oracle.js`, `sequential.js` | R4 opcional como conjunto                    | plataforma experimental no está en el camino canónico                                             | alto: se pierde evaluación causal, promoción y tests asociados            |
| `governance/intelligence.js` e `intelligence/calibration.js`                   | R4 opcional como conjunto                    | gobierno offline de Intel Hub, no inferencia activa                                               | alto: se pierde calibración auditada y preparación para IA futura         |
| `governance/provenance.js`                                                     | R4 solo si se retiran todos sus consumidores | soporte exclusivo de gobernanza                                                                   | alto si queda un consumidor; rompería firmas y recuperación               |
| `research/consensus-calibration.js`                                            | conservar por ahora                          | no está en inferencia, pero lo usan dos flujos de calibración                                     | retirarlo obliga a recortar también calibración y research                |
| `governance/service.js` y `governance/math.js`                                 | **no eliminar; congelar**                    | `fingerprint()` es dependencia del consenso/dependencia del camino real; readiness también lo usa | crítico: rompe checkpoints y el camino real                               |
| `agent-engine.js`                                                              | conservar                                    | los agentes locales son endpoints dentro del alcance cripto y útiles sin proveedor IA             | eliminarlo reduce el producto sin ser un desvío claro                     |
| research, cartera, stress, TCA, SRE y AI ops                                   | conservar/congelar                           | son soporte paper, riesgo u observabilidad, no mercados prohibidos                                | retirarlos reduce diagnóstico, seguridad y verificabilidad                |

### Recomendación de aprobación para R4

La opción de menor riesgo es aprobar para R4 solamente la plataforma de
gobernanza que no participa en el camino real:

- `governance/ai-evaluation.js`;
- `governance/calibration.js`;
- `governance/experiments.js`;
- `governance/intelligence.js`;
- `governance/labels.js`;
- `governance/outcome-oracle.js`;
- `governance/provenance.js`, solo después de retirar todos sus consumidores;
- `governance/sequential.js`;
- `intelligence/calibration.js`, si se retira gobernanza de inteligencia;
- `research/consensus-calibration.js`, si ya no queda consumidor.

La eliminación debe hacerse como un conjunto coherente, ajustando composición,
rutas, readiness y tests, y demostrando que la cadena canónica conserva todos
sus tests. Se recomienda **no aprobar** el retiro de `governance/service.js` ni
`governance/math.js`: aunque su nombre diga gobernanza, hoy el primero provee el
hash usado por módulos del camino real.

### Estado de R2 y bloqueo humano

Informe completo. No hubo eliminaciones ni cambios de comportamiento. R2 se
detiene aquí: R3 puede ejecutar únicamente su recorte explícito de conectores;
R4 requiere que el dueño apruebe por nombre los candidatos anteriores.

## R4 · Recorte aprobado de gobernanza offline

El dueño aprobó explícitamente la recomendación anterior. R4 retiró únicamente
los diez módulos clasificados fuera del camino real:

- `server/governance/{ai-evaluation,calibration,experiments,intelligence,labels,outcome-oracle,provenance,sequential}.js`;
- `server/intelligence/calibration.js`;
- `server/research/consensus-calibration.js`.

También se retiraron sus 16 archivos de prueba asociados, sus rutas HTTP,
composición, recovery/readiness, variables de entorno y paneles de estado. Los
diez documentos temáticos y once ADRs históricos se movieron a `docs/archive/`
con una nota de recuperación. No se retiró ningún test del camino canónico de
datos, mesas, consenso, riesgo, ejecución paper, ledger o auditoría.

Se conservaron congelados `server/governance/service.js` y
`server/governance/math.js`: el primero aporta el fingerprint usado por el
consenso y ambos sostienen el registro cuantitativo champion/challenger.

### Tamaño antes y después

| Directorio | R0 archivos | R0 líneas | R0 bytes | R4 archivos | R4 líneas | R4 bytes |
| ---------- | ----------: | --------: | -------: | ----------: | --------: | -------: |
| `server/`  |          78 |    18.905 |  602.689 |          68 |    13.780 |  434.285 |
| `tests/`   |          74 |     8.811 |  271.951 |          59 |     6.187 |  191.570 |
| `docs/`    |          81 |     4.297 |  207.910 |          84 |     4.685 |  257.376 |

El aumento de documentación se debe a que el material retirado se archivó en
vez de borrarse y al informe/ADR de alcance. El código activo de servidor bajó
5.125 líneas (27,1 %) y las pruebas retiradas corresponden solo a los módulos
aprobados. Todo es recuperable desde `pre-recorte`.

## R5 · Ejecución mantenible de pruebas

La línea base posterior a R4 ejecutaba 48 archivos enumerados manualmente: 11
en `pretest` y 37 en `test`. Esa lista omitía nueve archivos `.test.js`
existentes, incluido el control de alcance. R5 elimina `pretest` y usa el runner
nativo con el patrón `node --test tests/*.test.js`; ahora se descubren y pasan
los 57 archivos de prueba activos.

El comando solicitado literalmente como `node --test tests/` no es aceptado por
las versiones soportadas de Node: trata el directorio como un módulo y termina
con `MODULE_NOT_FOUND`. El patrón explícito mantiene el descubrimiento
automático para cualquier prueba nueva que respete la convención `.test.js`.
CI ejecuta `npm test` con ese mismo runner antes de `npm run coverage`, que lo
reutiliza para medir el umbral de líneas.
