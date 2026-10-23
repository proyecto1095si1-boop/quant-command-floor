# API master guide

Este documento reúne las APIs que necesita Quant Command Floor. Distingue claramente:

- **Implementada:** ya existe un adaptador o endpoint funcional en el repositorio.
- **Necesaria:** debe conectarse para completar un agente o departamento.
- **Opcional:** mejora cobertura, redundancia o calidad, pero no bloquea el modo paper actual.

La plataforma continúa siendo **paper-only**. Una API key de exchange con permisos de retiro no debe utilizarse nunca.

## 1. Configuración mínima actual

Para ejecutar el sistema existente solo se necesita acceso saliente a Coinbase y Kraken; sus endpoints públicos no requieren API key.

```env
PORT=8787
ALLOWED_ORIGIN=http://localhost:8080
PAPER_ONLY=true
MARKET_DATA_ENABLED=true
MARKET_PRODUCTS=BTC-USD,ETH-USD,SOL-USD,BNB-USD
MARKET_POLL_MS=5000
MARKET_CLOCK_MAX_DRIFT_MS=2000
MARKET_EVENT_MAX_FUTURE_MS=2000
MARKET_MIN_SOURCES=2
MARKET_RECONCILIATION_MAX_AGE_MS=15000
MARKET_RECONCILIATION_MAX_DIVERGENCE_BPS=25
MARKET_MAX_SPREAD_BPS=100
MARKET_MIN_TRADE_COVERAGE=0.98
MARKET_QUARANTINE_AFTER=2
MARKET_RECOVER_AFTER=3
BACKFILL_MAX_RANGE_DAYS=7
BACKFILL_MAX_CANDLES=10000
SRE_AVAILABILITY_TARGET=0.999
SRE_LATENCY_TARGET=0.95
SRE_LATENCY_MS=500
SRE_FRESHNESS_TARGET=0.99
SRE_FRESHNESS_MS=15000
SRE_WINDOW_DAYS=30
SRE_BUCKET_MS=60000
SRE_SAMPLE_MS=60000
SRE_FAST_LONG_MIN=60
SRE_FAST_SHORT_MIN=5
SRE_FAST_BURN=14.4
SRE_SLOW_LONG_MIN=360
SRE_SLOW_SHORT_MIN=30
SRE_SLOW_BURN=6
READINESS_MAX_QUEUE=100
READINESS_MAX_REJECTION_RATE=0.2
READINESS_MIN_EXECUTIONS=20
READINESS_REQUIRE_CHAMPION=false
OUTCOME_MAX_STALENESS_MS=30000
OUTCOME_MAX_LAG_MS=30000
OUTCOME_FINALITY_DELAY_MS=30000
OUTCOME_MAX_CLOCK_SKEW_MS=2000
OUTCOME_MAX_DIVERGENCE_BPS=25
MARKET_WS_ENABLED=false
DATA_DIR=./var/data
```

Para conectar agentes IA OpenAI-compatible:

```env
LLM_BASE_URL=http://localhost:11434/v1
LLM_API_KEY=
LLM_MODEL=local-model
LLM_HEALTH_WINDOW=20
LLM_HEALTH_MIN_SAMPLES=5
LLM_HEALTH_FAILURE_RATE=0.5
LLM_HEALTH_CONSECUTIVE_FAILURES=3
LLM_HEALTH_P95_MS=5000
LLM_HEALTH_COOLDOWN_MS=30000
LLM_PRIORITY=0
LLM_COST_PER_1K=0
LLM_MAX_CONCURRENT=2
LLM_SECONDARY_BASE_URL=
LLM_SECONDARY_API_KEY=
LLM_SECONDARY_MODEL=local-model
LLM_SECONDARY_PRIORITY=1
LLM_SECONDARY_COST_PER_1K=0
LLM_SECONDARY_MAX_CONCURRENT=2
LLM_POOL_MAX_ATTEMPTS=2
LLM_POOL_RPM=60
LLM_POOL_LATENCY_WEIGHT=1
LLM_POOL_COST_WEIGHT=1
LLM_POOL_PRIORITY_WEIGHT=0.1
LLM_PROVIDER_DAILY_USD=10
LLM_AGENT_DAILY_USD=2
LLM_INPUT_COST_PER_1K=0
LLM_OUTPUT_COST_PER_1K=0
LLM_PRICE_EFFECTIVE_FROM=1970-01-01
LLM_SECONDARY_INPUT_COST_PER_1K=0
LLM_SECONDARY_OUTPUT_COST_PER_1K=0
LLM_SECONDARY_PRICE_EFFECTIVE_FROM=1970-01-01
LLM_INVOICE_VARIANCE_BPS=500
INVOICE_TRUSTED_ISSUERS={}
INVOICE_REQUIRE_SIGNATURE=true
FX_REQUIRE_EVIDENCE=true
FX_TRUSTED_SOURCES=central-bank,market-data
FX_MIN_SOURCES=2
FX_MAX_AGE_MS=86400000
FX_MAX_FUTURE_MS=60000
FX_MAX_DIVERGENCE_BPS=50
FX_INVOICE_TOLERANCE_BPS=1
LLM_ESTIMATED_TOKENS=500
FINNHUB_API_KEY=
FINNHUB_RPM=60
FRED_API_KEY=
FRED_RPM=60
INTELLIGENCE_GOVERNANCE_TRUSTED_REVIEWERS=
```

Para producción controlada:

```env
NODE_ENV=production
AUTH_SECRET=generar-un-secreto-aleatorio-de-32-caracteres-o-mas
REQUIRE_FOUR_EYES=true
ALLOWED_ORIGIN=https://tu-dominio-privado.example
```

Nunca subir `.env`, API keys, secretos, seed phrases o private keys a GitHub.

### Calibración del consenso (interna, paper-only)

### Inteligencia externa read-only

`GET /v1/intelligence/status` informa qué conectores están configurados sin
exponer claves. `POST /v1/intelligence/query` acepta únicamente estas parejas:

- `finnhub/news`
- `fred/series`

No acepta URLs, métodos ni cabeceras suministradas por el usuario. Ejemplo:

```json
{
  "provider": "fred",
  "operation": "series",
  "params": {"seriesId": "FEDFUNDS", "limit": 120}
}
```

El contrato completo está en
[`docs/INTELLIGENCE_CONNECTORS.md`](docs/INTELLIGENCE_CONNECTORS.md).

`POST /v1/intelligence/dag/refresh` consulta las cinco fuentes permitidas para
un `asset`, aplica filtros point-in-time y guarda un snapshot hasheado. Acepta
opcionalmente `asOf`, `from` y `to`. `GET /v1/intelligence/dag/status` devuelve
estado, confianza y hash por activo, sin exponer el contenido ni secretos. El
modelo matemático está en
[`docs/INTELLIGENCE_DAG.md`](docs/INTELLIGENCE_DAG.md).

`POST /v1/research/intelligence-calibration` recibe observaciones causales con
`timestamp`, `outcomeAt`, `outcome` y nodos `macro/news/market`. Ejecuta
walk-forward anidado con purga y embargo, y devuelve únicamente una
recomendación `research-only` con `autoApply: false`. Contrato matemático:
[`docs/INTELLIGENCE_CALIBRATION.md`](docs/INTELLIGENCE_CALIBRATION.md).

Gobierno formal:

- `GET /v1/governance/intelligence`
- `POST /v1/governance/intelligence/datasets`
- `POST /v1/governance/intelligence/evaluate`
- `POST /v1/governance/intelligence/approve-experiment`
- `POST /v1/governance/intelligence/forecast`
- `POST /v1/governance/intelligence/resolve`
- `POST /v1/governance/intelligence/graduate`
- `POST /v1/governance/intelligence/activate`

El último endpoint exige dos aprobadores distintos. Solo permite `shadow` al 0%
o `canary` paper hasta 5%. Detalles en
[`docs/INTELLIGENCE_GOVERNANCE.md`](docs/INTELLIGENCE_GOVERNANCE.md).

El ciclo posterior respeta `forecast → resolve → graduate → activate`.
`forecast` recibe `requestId`, `symbol`, `horizonMs`, `thresholdBps`, `regime`,
`championProbability` y `challengerProbability`. `resolve` rechaza outcomes
aportados por el cliente y usa exclusivamente el oracle. Graduación y activación
exigen cuatro ojos; activar solo promueve a `paper-champion`.

`POST /v1/research/consensus-calibration` ejecuta una búsqueda determinista de
parámetros del consenso y la dependencia EWMA. Requiere observaciones temporales
con `timestamp`, `outcome`, `regime` y `signals`; acepta políticas `folds`,
`grid`, `dependencePolicy` y `consensusPolicy`. Devuelve hashes, ranking y una
recomendación con `autoApply: false`. No necesita API externa ni modifica las
mesas activas. El detalle matemático está en
`docs/CONSENSUS_CALIBRATION.md`.

### Gobierno de calibración y holdout

Configuración del registro de revisores:

```env
CALIBRATION_TRUSTED_REVIEWERS={"risk-reviewer":"-----BEGIN PUBLIC KEY-----..."}
```

- `GET /v1/governance/calibration`: estado, política y último run.
- `POST /v1/governance/calibration/datasets`: registra observaciones, split,
  manifiesto y attestation Ed25519; el holdout queda sellado.
- `POST /v1/governance/calibration/evaluate`: calibra con desarrollo y consume
  el holdout una sola vez.
- `POST /v1/governance/calibration/approve-experiment`: verifica run,
  challenger y dos aprobadores; inicia únicamente shadow o canary paper.

Para la última ruta se envían `x-second-approver` y, cuando
`REQUIRE_FOUR_EYES=true`, también `x-approver`. Canary está limitado a 5 %. El
contrato completo de firma y gates se encuentra en
`docs/CALIBRATION_GOVERNANCE.md`.

### Monitoreo secuencial del experimento

`POST /v1/governance/experiments/forecast` registra un pronóstico pareado
pendiente, sin outcome:

```json
{
  "experimentId": "uuid",
  "requestId": "id-estable",
  "symbol": "BTC-USD",
  "championProbability": 0.61,
  "challengerProbability": 0.58,
  "regime": "risk_on_low_vol",
  "horizonMs": 3600000,
  "thresholdBps": 0
}
```

El servidor sella un anchor Coinbase/Kraken en esa llamada. Después de
`maturesAt` y la demora de finalidad,
`POST /v1/governance/experiments/label` recibe únicamente `experimentId` y
`requestId`: el Outcome Oracle deriva el resultado desde el retorno point-in-time.
Enviar `outcome` u `outcomeAt` se rechaza. Una corrección agrega
`correctionReason` y exige el header `x-second-approver`. Para resultados ausentes,
`POST /v1/governance/experiments/censor` recibe `reason` una vez agotada la
gracia. La respuesta incluye estado de labels, e-values y breaches. Véanse
`docs/OUTCOME_ORACLE.md`, `docs/LABEL_LIFECYCLE.md` y
`docs/SEQUENTIAL_MONITORING.md`.

`POST /v1/governance/experiments/graduate` recibe `experimentId` y `reason`, y
requiere dos aprobadores. Solo genera un artefacto si pasan no inferioridad,
muestra, regímenes y guardrails. Model Governance exige ese artefacto para
reemplazar un champion de consenso. Véase `docs/EXPERIMENT_GRADUATION.md`.

## 2. APIs externas implementadas

### Coinbase Exchange — mercado primario

| Campo | Valor |
|---|---|
| Estado | Implementada |
| Base URL | `https://api.exchange.coinbase.com` |
| Autenticación | No requerida para market data público |
| Consumidor | Data Collector, Technical, Volume, Liquidity, Market Structure |
| Datos | ticker, trades, order book y velas |

Rutas utilizadas:

- `GET /products/{product}/ticker`
- `GET /products/{product}/book?level=2`
- `GET /products/{product}/trades?limit={limit}`
- `GET /products/{product}/candles?granularity={seconds}`
- WebSocket público opcional para ticker, matches y level 2.

Permisos requeridos: ninguno. No crear credenciales privadas para esta integración.

### Kraken — fuente secundaria

| Campo | Valor |
|---|---|
| Estado | Implementada |
| Base URL | `https://api.kraken.com` |
| Autenticación | No requerida |
| Consumidor | Data Quality, divergencia de precios y fallback |

Ruta utilizada:

- `GET /0/public/Ticker?pair={pair}`

La diferencia Coinbase/Kraken se mide en basis points y puede degradar el Data Plane.

### LLM OpenAI-compatible

| Campo | Valor |
|---|---|
| Estado | Adaptador implementado |
| Base URL | Configurable mediante `LLM_BASE_URL` |
| Autenticación | Bearer mediante `LLM_API_KEY` |
| Ruta esperada | `POST /chat/completions` |
| Consumidor | Sentimiento, Macro News Reader, CIO, Moderator, Code Generator |

Compatible con un servidor local Ollama/vLLM o un proveedor que implemente el contrato OpenAI. Parámetros restringidos por el backend:

- `temperature`: 0–0.5.
- `top_p`: 0.1–1.
- `max_tokens`: 64–2.000.
- Timeout: 500–60.000 ms.
- Salida obligatoria: JSON estructurado.

Las claves viven únicamente en el backend.

El proveedor se observa con una ventana rodante de éxitos, fallos y latencia.
El circuito abre por tasa de error o fallos consecutivos, espera
`LLM_HEALTH_COOLDOWN_MS` y permite una única prueba `HALF_OPEN`. Si la llamada
falla o el circuito no la admite, la respuesta usa el motor matemático local e
incluye `fallback.used=true`; nunca reintenta una orden ni habilita trading real.

El pool admite un proveedor primario y uno secundario OpenAI-compatible. Cada
uno conserva circuito, historial durable y límite de concurrencia independiente.
El score menor se elige de forma determinista:

`penalidadEstado + pesoLatencia × (p95/límiteP95) + pesoCosto × costoPor1k + pesoPrioridad × prioridad`

Sólo se realiza failover después de un fallo terminado; no hay llamadas
especulativas paralelas. `LLM_POOL_MAX_ATTEMPTS` limita proveedores por request
y `LLM_POOL_RPM` reserva un presupuesto rodante por proveedor. Si todos están
abiertos, saturados, sin presupuesto o fallan, se usa el motor matemático local.

## 3. APIs externas dentro del alcance cripto

### Noticias cripto

El proveedor configurado es Finnhub y la categoría admitida es únicamente
`crypto`.

Datos mínimos requeridos:

- ID estable de noticia.
- Titular y cuerpo/resumen.
- Timestamp UTC de publicación.
- Fuente y URL canónica.
- Símbolos/activos relacionados.
- Correcciones o updates.

Variables propuestas:

```env
NEWS_PROVIDER=finnhub
NEWS_BASE_URL=https://finnhub.io/api/v1
NEWS_API_KEY=
NEWS_POLL_MS=30000
```

Consumidores: Noticias, Macro News Reader, Sentimiento y AI Board.

### X / Twitter

Proveedor: X API v2 o un agregador autorizado.

Permisos mínimos: lectura de posts públicos y búsqueda reciente. No se necesitan permisos para publicar, seguir usuarios ni administrar cuentas.

```env
X_BASE_URL=https://api.x.com/2
X_BEARER_TOKEN=
X_QUERY_LIMIT=100
```

Datos: post ID, autor, timestamp, texto, idioma, métricas públicas y referenced tweets. Se deben deduplicar IDs, detectar bots y respetar términos de retención.

Consumidor: Social Sentiment Scanner.

### Reddit

Proveedor: Reddit OAuth API.

Permisos mínimos: `read`. No solicitar `submit`, `mod*` ni mensajes.

```env
REDDIT_CLIENT_ID=
REDDIT_CLIENT_SECRET=
REDDIT_USER_AGENT=quant-command-floor/1.0
REDDIT_SUBREDDITS=Bitcoin,CryptoCurrency,ethtrader
```

Datos: post/comment ID, subreddit, score, timestamp, texto y permalink.

Consumidor: Social Sentiment Scanner.

### Telegram

Solo si se cuenta con acceso legítimo a canales públicos o propios. Usar Telegram Bot API para canales administrados; MTProto requiere una revisión de cumplimiento adicional.

```env
TELEGRAM_BOT_TOKEN=
TELEGRAM_ALLOWED_CHANNELS=
```

Consumidor: Social Sentiment Scanner. Nunca intentar acceder a grupos privados sin autorización.

### On-chain y ballenas

Elegir un proveedor multichain como Glassnode, CryptoQuant, Nansen, Arkham, CoinMetrics o Alchemy. Para comenzar, CoinMetrics/Glassnode sirven para métricas agregadas; Alchemy sirve para datos raw EVM.

```env
ONCHAIN_PROVIDER=coinmetrics
ONCHAIN_BASE_URL=
ONCHAIN_API_KEY=
WHALE_USD_THRESHOLD=1000000
```

Datos mínimos:

- Flujos hacia/desde exchanges.
- Supply en profit/loss.
- Active addresses.
- Large transfers con tx hash.
- Timestamp, chain, token, amount y valoración USD.
- Etiquetas de wallet con procedencia y confianza.

Consumidores: On-Chain Analyst y Whale.

### Macroeconomía

Fuentes recomendadas:

- FRED para series de Estados Unidos.
- BLS para CPI y empleo.
- BEA para GDP/PCE.
- Federal Reserve para calendario y comunicados.
- SEC EDGAR para filings y enforcement.

```env
FRED_API_KEY=
BLS_API_KEY=
SEC_USER_AGENT=Nombre contacto@example.com
MACRO_POLL_MS=3600000
```

Series iniciales: CPI, Core CPI, PCE, Fed Funds, 2Y/10Y yields, unemployment, payrolls, DXY proxy y balance de la Fed.

Consumidores: Macro, Economy, Macro News Reader y CIO.

### Derivados y opciones

Para cripto, Deribit es una opción habitual para market data de opciones. También pueden usarse APIs públicas del venue elegido.

```env
OPTIONS_PROVIDER=deribit
OPTIONS_BASE_URL=https://www.deribit.com/api/v2
OPTIONS_CLIENT_ID=
OPTIONS_CLIENT_SECRET=
```

Datos: option chain, expiry, strike, call/put, bid/ask, IV, delta, gamma, vega, theta, open interest y funding.

Consumidores: Options Trader y Delta-Neutral Strategist.

Las credenciales privadas solo serán necesarias cuando exista ejecución real aprobada. Para analytics, usar endpoints públicos.

### Smart-contract security

Integraciones posibles: Slither local, Mythril local, Sourcify/Etherscan para source verification y bases de vulnerabilidades como OSV.

```env
ETHERSCAN_API_KEY=
SOURCIFY_BASE_URL=https://sourcify.dev/server
```

Consumidor: Smart Contract Auditor. Un resultado automático nunca reemplaza una auditoría profesional.

### Alertas operativas

Elegir Slack, Microsoft Teams, PagerDuty u Opsgenie.

```env
ALERT_PROVIDER=slack
ALERT_WEBHOOK_URL=
PAGERDUTY_ROUTING_KEY=
```

Consumidor: SRE. El webhook debe aceptar únicamente mensajes salientes; no necesita permisos administrativos.

### Almacenamiento y secretos de producción

Necesarios antes de operar fuera de una única máquina:

- PostgreSQL/TimescaleDB o ClickHouse para series y eventos.
- Object storage S3-compatible para backups inmutables.
- Secret manager: AWS Secrets Manager, GCP Secret Manager, Azure Key Vault o Vault.
- Redis para rate limits, locks e idempotencia distribuidos.

```env
DATABASE_URL=
OBJECT_STORAGE_ENDPOINT=
OBJECT_STORAGE_BUCKET=
REDIS_URL=
SECRET_MANAGER_PROVIDER=
```

## 4. API interna de Quant Command Floor

Base local: `http://localhost:8787`.

### Autenticación

En producción, todas las rutas salvo `/v1/health` y `/v1/security/status` requieren:

```http
Authorization: Bearer <token-firmado>
```

Roles: `viewer`, `operator`, `risk`, `admin`. Si `REQUIRE_FOUR_EYES=true`, las acciones críticas también requieren:

```http
X-Approver: identidad-uno
X-Second-Approver: identidad-dos
```

Los valores deben ser distintos.

### Sistema y seguridad

| Método | Ruta | Rol | Uso |
|---|---|---|---|
| GET | `/v1/health` | Público | Liveness del gateway |
| GET | `/v1/security/status` | Público | Perfil de seguridad sin exponer secretos |
| GET | `/v1/stream` | Bearer `viewer` o superior en producción | WebSocket de eventos |

### Régimen de mercado

| Método | Ruta | Rol |
|---|---|---|
| GET | `/v1/regime/status` | viewer |
| POST | `/v1/regime/{asset}/analyze` | operator |

El handshake WebSocket aplica la misma allowlist de `Origin`, rate limit por IP
y autenticación Bearer que el gateway HTTP. Los tokens no se aceptan en query
strings. Un navegador de producción requerirá que el futuro IdP/proxy convierta
su sesión segura en una identidad verificable para el upgrade.

### Data Plane

| Método | Ruta | Rol |
|---|---|---|
| GET | `/v1/data/health` | viewer |
| GET | `/v1/data/storage` | viewer |
| GET | `/v1/data/snapshot/{product}` | viewer |
| GET | `/v1/data/replay?stream=...&from=...&to=...&limit=...` | viewer |
| POST | `/v1/data/backfill/plan` | operator |
| POST | `/v1/data/backfill/execute` | operator + cuatro ojos opcional |

`/v1/data/health` incluye `provenance`: algoritmo, alcance diario, heads,
secuencias, gaps detectados y estado del reloj monotónico. Un reloj no saludable
degrada el Data Plane y la ingesta nueva falla cerrada.

También incluye `reconciliation`, con referencia mediana multifonte, desviación
por fuente, frescura, spread/profundidad L2, cobertura de secuencias y estado de
cuarentena por producto. `eligible=false` impide que el contexto llegue como
saludable a las mesas, incluso antes de que la histéresis declare cuarentena.

Backfill requiere primero un plan dry-run con `product`, `start`, `end` y
`granularity`. La ejecución recibe `{ "plan": ..., "approvedBy": "..." }`.
Los datos se escriben únicamente en `backfill.candles.*` con estado `staged`;
no reemplazan `candles.*` ni se vuelven elegibles automáticamente.

### Agentes y mesas

| Método | Ruta | Rol |
|---|---|---|
| POST | `/v1/agents/execute` | operator |
| GET | `/v1/desks` | viewer |
| POST | `/v1/desks/{asset}/analyze` | operator |

`/v1/agents/execute` exige `policy.paper_only=true`.

### Pipeline

| Método | Ruta | Rol |
|---|---|---|
| GET | `/v1/pipeline/status` | viewer |
| GET | `/v1/pipeline/runs/{runId}` | viewer |
| POST | `/v1/pipeline/{asset}/run` | operator |
| POST | `/v1/pipeline/halt` | risk |
| POST | `/v1/pipeline/resume` | risk + cuatro ojos opcional |

Activos implementados: `BTC`, `ETH`, `SOL` y `BNB`.

La respuesta incluye `desk.consensus`: posterior, IC95, tamaño efectivo,
concentración, aportes Bull/Bear y gates del Investment Committee. Si el motor
se abstiene, la acción es `NO_TRADE` y no se crea una propuesta.
`desk.dependence` informa si se usó correlación `dynamic-ewma` o
`static-fallback`, su razón, muestra, ventana efectiva, shrinkage, condition
number y detección de cambio estructural.

### Riesgo

| Método | Ruta | Rol |
|---|---|---|
| GET | `/v1/risk/status` | viewer |
| POST | `/v1/risk/preview` | risk |
| GET | `/v1/risk/scenarios` | viewer |
| GET | `/v1/risk/stress/status` | viewer |
| POST | `/v1/risk/stress` | risk |
| POST | `/v1/risk/reverse-stress` | risk |

El stress engine es paper-only. Evalúa un `portfolioPlanId` existente; los
overrides se indexan por identificador de escenario y no pueden contener campos
fuera de shocks, liquidez, venues inaccesibles y haircuts de contraparte.

### Research

| Método | Ruta | Rol |
|---|---|---|
| GET | `/v1/research/catalog` | viewer |
| POST | `/v1/research/evaluate` | operator |
| POST | `/v1/research/promote` | admin + cuatro ojos opcional |

### Portfolio

| Método | Ruta | Rol |
|---|---|---|
| GET | `/v1/portfolio/status` | viewer |
| POST | `/v1/portfolio/plan` | operator |

### Execution

| Método | Ruta | Rol |
|---|---|---|
| GET | `/v1/execution/status` | viewer |
| POST | `/v1/execution/submit` | operator + cuatro ojos opcional |
| POST | `/v1/execution/drain` | operator |

`GET /v1/execution/status` incluye `tca`: costo de precio, fees,
implementation shortfall ponderado por notional, effective spread y markouts
pendientes/resueltos. Los markouts solo se resuelven al observar un snapshot
posterior al horizonte; nunca reutilizan el precio contemporáneo del fill.

El estado TCA se persiste en `execution.tca`; la cuarentena multifonte, en
`data.reconciliation`. Ambos streams contienen checkpoints versionados con
SHA-256. Un hash inválido o una política distinta bloquea la recuperación.

Todas las órdenes son paper. `submit` necesita un plan existente y aprobación humana.

### Gobierno de modelos

| Método | Ruta | Rol |
|---|---|---|
| GET | `/v1/governance/status` | viewer |
| GET | `/v1/governance/models` | viewer |
| POST | `/v1/governance/register` | admin |
| POST | `/v1/governance/evaluate` | admin |
| POST | `/v1/governance/promote` | admin + dos aprobadores |
| GET | `/v1/governance/experiments` | viewer |
| POST | `/v1/governance/experiments/start` | admin |
| POST | `/v1/governance/experiments/assign` | admin |
| POST | `/v1/governance/experiments/observe` | admin |
| POST | `/v1/governance/experiments/forecast` | admin |
| POST | `/v1/governance/experiments/label` | admin |
| POST | `/v1/governance/experiments/censor` | admin |
| POST | `/v1/governance/experiments/graduate` | admin |
| POST | `/v1/governance/experiments/stop` | admin |
| GET | `/v1/governance/ai-evaluation` | viewer |
| POST | `/v1/governance/ai-evaluation/datasets` | admin |
| POST | `/v1/governance/ai-evaluation/run` | admin |

El registro acepta configuraciones y hashes, no código ejecutable ni secretos.
Las promociones requieren evaluación cuantitativa elegible.
Los experimentos solo enrutan evaluaciones paper y conservan hashes, no prompts
ni outputs completos.
La evaluación IA solo admite hashes y evidencia estructurada; rechaza campos de
prompt o respuesta libre.
El alta de datasets requiere `manifest` y `attestation`. El manifiesto contiene
metadatos de procedencia y hashes; `attestation` usa `reviewerId`, algoritmo
`Ed25519` y firma base64 del hash que vincula manifiesto, identidad, versión y
casos. La clave pública debe existir en
`AI_EVALUATION_TRUSTED_REVIEWERS`. Las corridas devuelven hashes de
reproducibilidad, ECE, Brier e intervalos Wilson 95%.

### Dashboard

| Método | Ruta | Rol |
|---|---|---|
| GET | `/v1/dashboard/overview` | viewer |
| GET | `/v1/dashboard/runs?asset=BTC&status=completed&limit=100` | viewer |
| GET | `/v1/dashboard/export.csv` | viewer |

### SRE y auditoría

| Método | Ruta | Rol |
|---|---|---|
| GET | `/v1/sre/status` | viewer |
| GET | `/v1/readiness` | viewer |
| GET | `/v1/ai/provider-health` | viewer |
| GET | `/v1/ai/costs` | viewer |
| POST | `/v1/sre/backup` | admin |
| POST | `/v1/sre/incidents/{id}/ack` | admin |

`GET /v1/sre/status` devuelve `objectives` para availability, latencia,
frescura e integridad. Cada objetivo incluye cumplimiento, eventos buenos/malos,
presupuesto permitido y restante, burn rate, cobertura temporal y evaluaciones
fast/slow. `burnAlerts` contiene sólo las políticas cuya ventana larga y corta
superan simultáneamente el umbral.

`telemetry` informa tamaño y hash de política, buckets restaurados, escrituras
pendientes y gaps. El arranque rechaza checkpoints alterados o creados con otra
política; mientras la recuperación no termina, el snapshot SRE permanece
fail-closed. `SRE_SAMPLE_MS` debe ser menor o igual a `SRE_BUCKET_MS`, y
`DATA_RETENTION_DAYS` no puede ser menor que `SRE_WINDOW_DAYS`.

`GET /v1/readiness` devuelve `READY`, `DEGRADED` o `HALTED`, las capacidades
`marketAnalysis`, `paperExecution` y `aiSignals`, los 18 controles evaluados y
las razones no compensables. `HALTED` responde HTTP 503. La ruta
`POST /v1/execution/submit` y `/v1/execution/drain` vuelven a evaluar readiness
y responden 409 sin llamar al ejecutor cuando `paperExecution=false`.

Durante el arranque, readiness recupera `sre.readiness-transitions`. Hasta
validar sellos, política, decisiones derivadas y continuidad interna,
`GET /v1/readiness` responde 503 y ejecución permanece bloqueada. Un corte del
inicio por retención se informa como `boundaryTruncated`; una ruptura dentro del
historial disponible detiene el Risk Gate.

`GET /v1/ai/provider-health` devuelve `CLOSED`, `OPEN` o `HALF_OPEN`, tamaño de
muestra, éxitos, fallos, tasa de error, fallos consecutivos, p95, cooldown y
última causa sanitizada. No expone URL, token ni cabeceras. Readiness sólo
habilita `aiSignals` cuando el proveedor está configurado, fue observado,
permanece `CLOSED` y su p95 está dentro de política. Esta degradación no bloquea
la ejecución paper independiente de IA.

La respuesta incluye un arreglo `providers` sin URLs ni claves, con salud,
latencia, error, bulkhead, presupuesto y contadores por proveedor. El campo
`recovery` agregado sólo queda listo cuando se validaron todos los proveedores
configurados. Durante el arranque las llamadas externas usan fallback local.
Los historiales son `sre.ai-provider-health` para el primario y
`sre.ai-provider-health.secondary` para el secundario. Una falla de persistencia
retira sólo ese proveedor, pero readiness degrada `aiSignals` si la recuperación
agregada no está completa.

`GET /v1/ai/costs` expone el día UTC, consumo por proveedor y agente, tokens,
costo con ocho decimales, límite, remanente, reservas activas y recuperación.
Antes de cada request se reserva `max_tokens` —o `LLM_ESTIMATED_TOKENS`— usando:

`costoAtoms = round(costoPor1kAtoms × tokens / 1000)`

Si proveedor o agente excedería su presupuesto diario, ese candidato no recibe
la llamada. Al finalizar se reemplaza la reserva por tokens reportados; cuando
el proveedor no reporta uso se conserva la estimación. El ledger declara
siempre `paperOnly=true` y `liveTrading=false`.

## 5. Ejemplos internos

### Ejecutar una mesa

```bash
curl -X POST http://localhost:8787/v1/desks/BTC/analyze \
  -H "Authorization: Bearer $QCF_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{}'
```

### Evaluar riesgo

```json
{
  "proposal": {
    "id": "preview-1",
    "symbol": "BTC-USD",
    "qty": 0.1,
    "notional": 6800,
    "confidence": 0.72,
    "maxWeight": 0.35
  },
  "context": {
    "equity": 100000,
    "grossExposure": 12000,
    "assetExposure": 6000,
    "dataStatus": "healthy",
    "spreadBps": 8,
    "correlation": 0.55,
    "returns": [0.001, -0.002, 0.003]
  }
}
```

### Encolar ejecución con cuatro ojos

```bash
curl -X POST http://localhost:8787/v1/execution/submit \
  -H "Authorization: Bearer $QCF_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Approver: portfolio-director' \
  -H 'X-Second-Approver: risk-director' \
  -d '{
    "planId":"<plan-id>",
    "approvedBy":"portfolio-director",
    "algorithm":"TWAP",
    "prices":{"BTC":68420,"ETH":3600,"SOL":180,"BNB":610},
    "idempotencyKey":"rebalance-2026-10-20"
  }'
```

## 6. Contrato de errores

### Conciliación de costos IA

`GET /v1/ai/cost-reconciliation` devuelve catálogo efectivo, facturas,
desvíos y alertas. `POST /v1/sre/ai-cost-reconciliation/invoices` importa una
factura declarada y requiere rol admin en producción. Con cuatro ojos activo,
también exige `X-Approver` y `X-Second-Approver` distintos.

```json
{
  "invoiceId": "provider-2026-10",
  "providerId": "primary",
  "currency": "EUR",
  "periodStart": "2026-10-01",
  "periodEnd": "2026-10-31",
  "issuedAt": "2026-11-01T00:00:00Z",
  "fxRateToUsd": 1.2,
  "subtotal": 100,
  "tax": 21,
  "attestation": {
    "issuerId": "provider-finance",
    "algorithm": "Ed25519",
    "signature": "BASE64_SIGNATURE"
  },
  "fxObservations": [
    {"source":"central-bank","observedAt":1792670400000,"rateToUsd":1.2},
    {"source":"market-data","observedAt":1792670401000,"rateToUsd":1.2001}
  ],
  "lines": [
    {
      "model": "local-model",
      "day": "2026-10-22",
      "promptTokens": 50000,
      "completionTokens": 10000
    }
  ]
}
```

El contrato y sus límites están en
[`docs/AI_COST_RECONCILIATION.md`](docs/AI_COST_RECONCILIATION.md).
La firma, el oracle FX y sus límites se especifican en
[`docs/FINANCIAL_PROVENANCE.md`](docs/FINANCIAL_PROVENANCE.md).

Errores comunes:

| HTTP | Significado |
|---:|---|
| 400 | JSON inválido |
| 401 | Falta autenticación o token inválido/expirado |
| 403 | Rol insuficiente, origen rechazado o falta segundo aprobador |
| 404 | Recurso/plan/run inexistente |
| 409 | Pipeline ocupado, riesgo detenido o candidato no elegible |
| 413 | Payload mayor a 256 KiB |
| 422 | Campos, datos o historia insuficientes |
| 429 | Rate limit excedido |
| 502 | Error de proveedor IA/upstream |
| 503 | Servicio interno deshabilitado |

Formato:

```json
{"error":"machine-readable-code"}
```

## 7. Orden recomendado para contratar/conectar

1. Mantener Coinbase + Kraken públicos para el núcleo de mercado.
2. Conectar un LLM OpenAI-compatible local o privado.
3. Contratar una API de noticias y FRED/BLS/SEC para macro.
4. Conectar Reddit y X con permisos read-only.
5. Elegir un proveedor on-chain con cobertura BTC, Ethereum, Solana y BNB Chain.
6. Contratar equities/fundamentals antes de habilitar mesas C.
7. Contratar BYMA/broker/BCRA antes de habilitar CEDEARs.
8. Añadir DeFi, RPC y opciones únicamente después de límites de riesgo específicos.
9. Incorporar PostgreSQL/object storage/Redis/secret manager antes de escalar réplicas.
10. Mantener cualquier API privada de trading desactivada hasta aprobar seguridad, compliance y reconciliación live.

## 8. Checklist al agregar una API

- Credencial read-only y mínimo privilegio.
- Base URL en allowlist; HTTPS obligatorio fuera de localhost.
- Timeout, retry con backoff y circuit breaker.
- Límite por minuto documentado.
- IDs y timestamps UTC conservados.
- Normalizador con esquema versionado.
- Deduplicación e idempotencia.
- Fuente, latencia y calidad visibles en SRE.
- Replay determinista y fixture para tests.
- Política de retención/licencia revisada.
- Secretos únicamente en backend/secret manager.
- Fallback o comportamiento fail-closed definido.
