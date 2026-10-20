# Risk Management Office

Riesgo es una barrera síncrona e independiente entre Signal Hub y Execution Queue. Una señal fuerte no puede omitirla. El resultado siempre contiene métricas, cada control evaluado y la causa exacta de cualquier veto.

## Tamaño de posición

La cantidad final es el mínimo de cuatro límites:

1. **Stop/ATR:** `risk budget / max(2×ATR, price×max(0.8%, 1.5×daily vol))`. El presupuesto por operación predeterminado es 0.5% del equity.
2. **Mandato:** `equity × max asset weight / price`.
3. **Volatility targeting:** `equity × 15% target vol / EWMA annual vol / price`. EWMA usa `λ=0.94` y anualiza retornos diarios con `√365`, porque el mercado cripto opera todos los días. `periodsPerYear` permite sobrescribir el horizonte cuando la frecuencia de la serie es otra.
4. **Kelly fraccional:** `max(0, p − (1−p)/payoff) × 0.25`; limita el Kelly completo al 25%.

El reporte conserva los cuatro techos y marca cuál fue vinculante.
También expone `annualizationPeriods`, de modo que una decisión pueda auditarse
sin inferir la frecuencia aplicada.

## Gates de veto

| Control | Límite predeterminado |
|---|---:|
| Drawdown desde high-water mark | 10% |
| VaR histórico 95% | 4% |
| CVaR / Expected Shortfall 95% | 6% |
| Pérdida de estrés | 20% del equity |
| Peso máximo por activo | Mandato de la mesa |
| Exposición bruta | 70% del equity |
| Correlación | 0.90 |
| Spread | 20 bps |
| Confianza de señal | 15% |
| Historia | 50 retornos |

VaR toma el percentil 95 de pérdidas históricas; CVaR promedia la cola igual o peor que VaR. El stress engine aplica shocks de mercado de −20%, liquidez de −8% y venue de −12% a la exposición bruta posterior a la orden.

## Estado y recuperación

El high-water mark, el estado halted y la causa del veto global se guardan en el checkpoint del pipeline. Un reinicio recupera estos valores antes de volver a operar. El Risk Manager puede detener y reabrir el sistema, pero reabrir no evita ninguno de los gates cuantitativos.

## API

- `GET /v1/risk/status`: límites, high-water, cartera y último dictamen.
- `POST /v1/risk/preview`: evaluación paper de una propuesta y su contexto.
- `POST /v1/pipeline/halt`: veto global con causa.
- `POST /v1/pipeline/resume`: retira el veto global.

Este módulo sigue siendo **paper-only**. Antes de capital real requiere identidad fuerte, aprobación de cuatro ojos, límites en el broker/exchange y reconciliación independiente.
