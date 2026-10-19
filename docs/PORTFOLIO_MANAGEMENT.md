# Portfolio Management Desk

La mesa convierte señales y mandatos individuales en una asignación conjunta. Produce planes **paper-only** que requieren aprobación humana; no envía órdenes al broker.

## Optimización

El objetivo predeterminado invierte 85% y conserva 15% en efectivo:

- **Risk parity (65% del blend):** pesos iniciales proporcionales a `1/σᵢ`, reduciendo concentración en activos volátiles.
- **Media-varianza regularizada (35%):** score long-only `max(0, μᵢ)/(λσᵢ²)` con aversión al riesgo `λ=6`.
- **Proyección con límites:** normaliza iterativamente y fija cualquier activo que exceda su mandato; redistribuye solo entre activos todavía disponibles.

Topes actuales: BTC 35%, ETH 30%, SOL 15% y BNB 10%. La suma de topes es 90%, por lo que incluso con redistribución queda una reserva mínima estructural.

## Diagnóstico de cartera

La matriz de covarianza muestral usa retornos horarios alineados. A partir de ella se calcula:

- Varianza: `wᵀΣw`.
- Volatilidad anual cripto desde velas horarias: `√(wᵀΣw) × √(24×365)`.
- Contribución al riesgo: `wᵢ(Σw)ᵢ / (wᵀΣw)`.
- Diversification ratio: `Σ(wᵢσᵢ) / σₚ`.

## Rebalanceo

No se genera trade cuando la diferencia absoluta contra el objetivo es menor a 2%. El turnover es `½Σ|Δw|`; si supera 20% por ciclo, todas las órdenes se reducen proporcionalmente. Esto controla fees, slippage y churn.

Cada plan conserva pesos actuales, objetivos, contribuciones al riesgo, órdenes notionals paper, efectivo objetivo, observaciones, método y estado de aprobación.

## API

- `GET /v1/portfolio/status`: cartera marcada, política y último plan.
- `POST /v1/portfolio/plan`: acepta una matriz de retornos por activo o consulta velas horarias del Data Plane.

Los planes se persisten en `portfolio.plans` con integridad SHA-256 del almacenamiento. Una fase futura puede transformar planes aprobados en órdenes, siempre pasando nuevamente por Risk Gate.
