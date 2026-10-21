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

## 3. APIs externas necesarias para completar todos los agentes

### Noticias financieras

Elegir inicialmente **un proveedor**, no todos.

Proveedores posibles: Benzinga, Finnhub, Polygon.io, Alpha Vantage News o NewsAPI.

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

### Acciones, ETFs e índices

Elegir Polygon.io, Finnhub, Twelve Data, Tiingo o un feed profesional según latencia/licencia.

Datos requeridos:

- OHLCV ajustado y corporate actions.
- Quotes y trades si se necesita intradía.
- Fundamentals normalizados.
- Earnings calendar y estimates.
- Insider transactions.
- Constituents de índices/ETFs.

```env
EQUITIES_PROVIDER=polygon
EQUITIES_BASE_URL=https://api.polygon.io
EQUITIES_API_KEY=
```

Consumidores: Fundamental, Growth, Value, Cashflow, Balance Sheet, Insider y Earnings.

### Argentina, CEDEARs y tipo de cambio

Se necesitan fuentes autorizadas para:

- Cotizaciones CEDEAR y Merval.
- Ratios de conversión CEDEAR/acción.
- CCL y MEP reproducibles.
- Bonos soberanos para riesgo país.
- BCRA para variables monetarias y FX oficial.

Posibles integraciones: BYMA Data, Matba Rofex, broker argentino autorizado, BCRA API y datos públicos oficiales.

```env
AR_MARKET_BASE_URL=
AR_MARKET_API_KEY=
BCRA_BASE_URL=https://api.bcra.gob.ar
CEDEAR_RATIOS_FILE=./config/cedear-ratios.json
```

Consumidores: Scanner, CCL, MEP, Argentina Risk, Merval y Macro Argentina.

### DeFi

Fuentes recomendadas:

- DefiLlama para TVL y yields agregados.
- APIs/subgraphs oficiales de Aave, Compound y Maker/Sky.
- RPC propio o proveedor para verificar on-chain.
- 0x/1inch solo para cotizaciones; nunca firmar desde el servicio de análisis.

```env
DEFI_LLAMA_BASE_URL=https://api.llama.fi
EVM_RPC_URL=
RPC_API_KEY=
DEX_QUOTE_BASE_URL=
```

Datos: APY base/rewards, TVL, utilization, borrow rate, chain ID, contract address, block number y timestamp.

Consumidores: Yield Farmer, Funding Arbitrageur y DEX Triangle Scanner.

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

`/v1/data/health` incluye `provenance`: algoritmo, alcance diario, heads,
secuencias, gaps detectados y estado del reloj monotónico. Un reloj no saludable
degrada el Data Plane y la ingesta nueva falla cerrada.

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
| POST | `/v1/sre/backup` | admin |
| POST | `/v1/sre/incidents/{id}/ack` | admin |

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
