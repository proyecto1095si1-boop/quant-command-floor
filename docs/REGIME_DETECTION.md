# Regime Detection

El clasificador estima un estado probabilístico antes de elegir estrategias. Usa cuatro estados: `risk_on_low_vol`, `range_mean_reverting`, `trend_high_vol` y `risk_off_crisis`.

## Modelo

Un Hidden Markov Model filtra observaciones móviles de retorno medio, volatilidad, tendencia y spread. Las emisiones son gaussianas diagonales y la matriz de transición favorece persistencia; la duración esperada es `1/(1-pᵢᵢ)`. La inferencia forward se normaliza en cada paso para evitar underflow.

Diagnósticos adicionales:

- Volatilidad anualizada cripto con `√8760`.
- Hurst mediante rango reescalado para tendencia/reversión.
- Entropía normalizada de retornos positivos, negativos y neutros.
- Change point por diferencia de medias normalizada; su probabilidad reduce 25% adicional el risk multiplier cuando supera 80%.
- Entropía de las probabilidades HMM como incertidumbre del clasificador.

## Política

| Régimen | Multiplicador | Estrategias permitidas |
|---|---:|---|
| Risk-on low vol | 1.00 | momentum, breakout, carry |
| Range | 0.80 | mean reversion, market neutral, options income |
| Trend high vol | 0.60 | trend, volatility, hedged momentum |
| Risk-off crisis | 0.35 | cash, protective put, short trend |

La salida incluye probabilidades completas, duración, riesgo de transición, estrategias permitidas/bloqueadas y diagnósticos. Se persiste en `regime.analysis`.

## API

- `GET /v1/regime/status`
- `POST /v1/regime/{asset}/analyze`

Se requieren al menos 60 velas. Los parámetros actuales son priors explícitos y versionables; antes de capital real deben recalibrarse solo con ventanas de entrenamiento y validarse walk-forward sin leakage.
