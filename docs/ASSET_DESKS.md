# Mesas de cripto majors — BTC, ETH, SOL y BNB

Las cuatro mesas usan el mismo contrato y código. Solo cambian el producto, la clase de riesgo y el límite máximo de cartera. Ninguna mesa puede emitir órdenes: produce una recomendación paper que después debe atravesar Risk Management.

| Mesa | Producto | Clase | Peso máximo |
|---|---|---|---:|
| BTC | BTC-USD | major | 35% |
| ETH | ETH-USD | major | 30% |
| SOL | SOL-USD | major-high-beta | 15% |
| BNB | BNB-USD | major-venue | 10% |

## Agentes y matemáticas

### Technical

Combina tendencia normalizada por volatilidad y momentum:

`trend = (EMA12 − EMA26) / ATR14`

`momentum = (RSI14 − 50) / 25`

`signal = tanh(0.7·trend + 0.3·momentum)`

### Volume

Calcula z-score del volumen actual contra 20 observaciones y flujo OBV normalizado. El z-score determina anomalía; el signo del OBV distingue acumulación y distribución.

### Whale

Calcula nocional `price × size`, selecciona operaciones sobre el percentil 95 y mide:

`pressure = (buyNotional − sellNotional) / (buyNotional + sellNotional)`

Coinbase informa el lado del maker; durante normalización se invierte para representar el lado agresor.

### Liquidity

`imbalance = (bidDepth − askDepth) / (bidDepth + askDepth)`

La señal se penaliza por spread: `signal = imbalance × (1 − min(1, spreadBps/20))`.

### Market Structure

Detecta fractales de cinco velas, secuencias HH/HL o LH/LL y rupturas BOS cuando el cierre supera el último swing confirmado.

### Order Block

Busca desplazamiento con cuerpo superior a `1.5 × ATR14`. La última vela opuesta anterior forma la zona de oferta o demanda. La fuerza disminuye según distancia expresada en ATR.

## Signal Hub

`S = Σ(signalᵢ × confidenceᵢ × weightᵢ) / Σ(confidenceᵢ × weightᵢ)`

Pesos iniciales: Technical 1.25, Market Structure 1.20, Liquidity 1.10, Whale 1.00, Volume 0.90 y Order Block 0.85. La confianza final se penaliza por dispersión entre agentes.

Umbrales: `LONG > 0.20`, `SHORT < −0.20`, en otro caso `FLAT`. Se produce `NO_TRADE` si hay menos de 50 velas, menos de 20 trades o calidad de datos degradada.

## API

- `GET /v1/desks`: catálogo y plantilla.
- `POST /v1/desks/BTC/analyze`: análisis con contexto real del Data Plane.
- También disponibles `ETH`, `SOL` y `BNB`.

La respuesta conserva señal, confianza, acuerdo, evidencias, métricas, bloqueos y política de riesgo por agente.
