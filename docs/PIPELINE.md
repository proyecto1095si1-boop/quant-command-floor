# Pipeline operativo end-to-end

Flujo obligatorio:

`Data Plane → Asset Desk → Signal Hub → Proposal → Risk Gate → Paper Ledger → Reconcile → SHA-256 Audit`

No existe ruta directa entre una señal y el broker. Toda propuesta atraviesa el Risk Gate y todas las ejecuciones son paper-only.

## Dimensionamiento

Riesgo monetario por operación: `riskBudget = equity × 0.5%`.

Distancia de stop teórica: `max(2 × ATR14, price × max(0.8%, 0.35 × volatility))`.

`qtyRisk = riskBudget / stopDistance`

`qtyMandate = equity × maxAssetWeight / price`

`qty = min(qtyRisk, qtyMandate)`

El sizing no coloca todavía el stop; lo utiliza para limitar el capital antes de la simulación.

## Risk Gate

Veta ante cualquiera de estas condiciones:

- sistema detenido;
- calidad de datos distinta de healthy;
- confianza inferior a 15%;
- drawdown superior a 10%;
- VaR superior a 4%;
- peso del activo sobre su mandato;
- exposición bruta superior a 70%;
- correlación superior a 0.90;
- spread superior a 20 bps;
- cantidad inválida.

## Paper Ledger

Mantiene efectivo, posiciones por símbolo, precio promedio, PnL realizado/no realizado, fees e idempotencia. El fill simulado incluye medio spread, slippage base y penalización de impacto según participación contra profundidad L2.

Cada checkpoint contiene ledger, métricas, estado de Riesgo y cadena SHA-256. Al reiniciar, la recuperación verifica la cadena antes de habilitar el pipeline; una corrupción coloca Risk Gate en halt.

## API

- `GET /v1/pipeline/status`
- `POST /v1/pipeline/BTC/run`
- `GET /v1/pipeline/runs/{runId}`
- `POST /v1/pipeline/halt`
- `POST /v1/pipeline/resume`

ETH, SOL y BNB utilizan la misma ruta. `runId` es idempotente: repetirlo devuelve el resultado original y no crea otro fill.
