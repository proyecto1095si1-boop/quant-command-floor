# Research governance

El laboratorio convierte una hipótesis en un **challenger** medible, pero no la conecta automáticamente al capital. El flujo es `evaluar → gates → aprobación humana → champion`.

## Métodos matemáticos

- **Purged K-Fold:** divide la serie en cinco ventanas contiguas. Quita tres observaciones alrededor del test y aplica dos de embargo posterior para impedir que etiquetas solapadas filtren futuro al entrenamiento.
- **Sharpe anualizado:** `mean(r) / sample_std(r) × √365` para retornos diarios de cripto.
- **Probabilistic Sharpe Ratio:** estima la probabilidad de superar un benchmark considerando cantidad de observaciones, asimetría y curtosis.
- **Deflated Sharpe Ratio:** eleva el benchmark según `√(2 ln(N)/(T−1)) × √365`, donde `N` es la cantidad de configuraciones ensayadas. Penaliza data snooping.
- **PBO:** Combinatorial Symmetric Cross-Validation elige el ganador in-sample y mide su rango out-of-sample. La proporción con logit de rango `≤ 0` es la probabilidad de sobreajuste.
- **Sensibilidad:** compara el Sharpe de la grilla; `stability = max(0, 1 − sample_std / |median|)`.
- **Maximum drawdown:** peor caída porcentual desde un máximo del capital compuesto.

## Política predeterminada

| Gate                    | Límite |
| ----------------------- | -----: |
| Observaciones           |  ≥ 120 |
| Probabilidad DSR        |  ≥ 95% |
| PBO                     |  ≤ 35% |
| Maximum drawdown        |  ≤ 25% |
| Estabilidad paramétrica |  ≥ 55% |
| Sharpe fuera de muestra |    ≥ 0 |

Un fallo deja el reporte en `rejected`. Superar todos los gates produce `eligible`, no un despliegue. `POST /v1/research/promote` exige `candidateId` y `approvedBy`; registra el champion anterior, el aprobador y el instante de promoción.

La configuración compartida está en `server/config/annualization.js`: 365
períodos para retornos diarios y `365 × 24 = 8.760` para retornos horarios.
Las funciones cuantitativas y `POST /v1/research/evaluate` admiten el parámetro
`periods` para sobrescribirlo cuando el dataset tiene otra frecuencia. El valor
usado queda registrado como `metrics.annualizationPeriods`.

## API

- `GET /v1/research/catalog`: política, champion, evaluaciones y promociones.
- `POST /v1/research/evaluate`: acepta `returns`, `returnsMatrix`, `trials`, `folds`, `purge`, `embargo`, `slices` y una política opcional.
- `POST /v1/research/promote`: promoción controlada, únicamente para candidatos elegibles y con aprobación humana explícita.

Los reportes y eventos se guardan en los streams SHA-256 `research.evaluation` y `research.promotion`. El generador determinista incluido sirve para demos y pruebas; una investigación operativa debe enviar retornos netos de fees y slippage desde un dataset versionado.
