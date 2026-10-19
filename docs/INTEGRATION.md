# Contrato de integración — Etapa 0 y 1

El navegador solo conoce el gateway. Las credenciales de LLM, exchanges, RPC y noticias deben existir como secretos del backend y jamás aparecer en `localStorage`, URLs o respuestas.

## Variables del backend

```env
PORT=8787
ALLOWED_ORIGIN=http://localhost:8080
LLM_BASE_URL=http://localhost:11434/v1
LLM_API_KEY=server-side-only
EXCHANGE_BASE_URL=https://api.exchange.example
EXCHANGE_API_KEY=server-side-only
EXCHANGE_API_SECRET=server-side-only
PAPER_ONLY=true
```

## Endpoints mínimos

`GET /v1/health` devuelve HTTP 200:

```json
{"status":"ok","version":"0.1.0","services":{"llm":"ok","market_data":"ok"}}
```

`POST /v1/agents/execute` recibe:

```json
{"request_id":"qcf_123","agent_id":"Macro News Reader","input":{"headline":"...","scenario":"normal"},"model":{"provider":"openai-compatible","name":"local-model","temperature":0,"top_p":0.2,"max_tokens":500,"responseSchema":"classified-signal-v1"},"policy":{"paper_only":true,"timeout_ms":8000}}
```

La respuesta uniforme es:

```json
{"agent_id":"Macro News Reader","version":"prompt-2026-10-19.1","status":"ok","signal":0.42,"confidence":0.91,"evidence":["source-id:CPI-2026-10"],"latency_ms":284,"at":"2026-10-19T12:00:00.000Z"}
```

Restricciones: `signal ∈ [-1,1]`, `confidence ∈ [0,1]`, máximo 20 evidencias. El gateway debe validar el esquema, autenticar al usuario, aplicar rate limits y rechazar cualquier intento de quitar `paper_only` durante estas etapas.

## Parámetros IA iniciales

| Perfil | temperature | top_p | max_tokens | Uso |
|---|---:|---:|---:|---|
| classification | 0.00 | 0.20 | 500 | sentimiento, noticias y anomalías |
| research | 0.35 | 0.90 | 1800 | hipótesis de estrategia |
| code | 0.10 | 0.85 | 2400 | artefactos que luego pasan por sandbox |
| board | 0.20 | 0.80 | 1200 | CIO y debate con salida estructurada |
| audit | 0.00 | 0.10 | 1000 | hallazgos de contratos y seguridad |

## Infraestructura matemática

- Latencia suavizada: `EWMA_t = αx_t + (1−α)EWMA_(t−1)`, con `α=0.20`.
- Anomalía robusta: `z = 0.6745(x−mediana)/MAD`; alerta cuando `|z| > 3.5`.
- Circuit breaker: abre tras 3 fallos consecutivos, espera 30 segundos y pasa a half-open.
- Reintentos: máximo 2 antes de contabilizar el fallo final. En producción se debe añadir backoff exponencial con jitter.

El stream `WS /v1/stream` queda reservado para eventos normalizados de mercado y salud; no debe transportar secretos.

## Data Plane real

Coinbase Exchange es la fuente pública primaria porque Binance puede responder `451` según la región. Variables:

```env
MARKET_DATA_ENABLED=true
MARKET_PRODUCTS=BTC-USD,ETH-USD
MARKET_POLL_MS=5000
DATA_DIR=./var/data
MARKET_WS_ENABLED=false
DATA_RETENTION_DAYS=30
```

Endpoints de observación:

- `GET /v1/data/health`: frescura, errores, latencia y ciclos.
- `GET /v1/data/snapshot/BTC-USD`: ticker, libro L2 y velas abiertas.
- `GET /v1/data/replay?stream=trades.BTC-USD&limit=1000`: replay verificado.

Los eventos se persisten como JSONL particionado por fecha. Cada fila guarda SHA-256 del payload; el replay se detiene ante corrupción. Los libros se ordenan por precio, calculan spread, spread en bps e imbalance. Las velas se agregan simultáneamente a 1m, 5m, 15m y 1h.

En un host con salida WebSocket, `MARKET_WS_ENABLED=true` activa `ticker`, `matches`, `level2` y `heartbeat` de Coinbase con reconexión exponencial y jitter. El polling REST permanece como mecanismo de snapshot, recuperación y fallback. Los archivos anteriores al día activo se comprimen con gzip y la retención elimina particiones que exceden `DATA_RETENTION_DAYS`.
