# Portfolio Management Desk

La mesa convierte señales y mandatos individuales en una asignación conjunta. Produce planes **paper-only** que requieren aprobación humana; no envía órdenes al broker.

## Optimización

El objetivo predeterminado invierte 85% y conserva 15% en efectivo:

- **Risk parity (65% del blend):** parte de inverse-vol y resuelve
  iterativamente equal risk contribution sobre la covarianza robusta, hasta que
  `wᵢ(Σw)ᵢ / (wᵀΣw)` converge o alcanza 500 iteraciones.
- **Media-varianza regularizada (35%):** projected gradient long-only sobre
  `μᵀw − λ/2·wᵀΣw`, con aversión al riesgo `λ=6`.
- **Proyección con límites:** normaliza iterativamente y fija cualquier activo que exceda su mandato; redistribuye solo entre activos todavía disponibles.

Topes actuales: BTC 35%, ETH 30%, SOL 15% y BNB 10%. La suma de topes es 90%, por lo que incluso con redistribución queda una reserva mínima estructural.

## Diagnóstico de cartera

Los retornos horarios se alinean y deben ser finitos. La covarianza se estima
mediante Oracle Approximating Shrinkage (OAS) hacia `μI`, donde
`μ = tr(S)/N`. La intensidad queda acotada a `[0,1]`. Después, una
descomposición propia de Jacobi recorta autovalores negativos a un piso pequeño
y reconstruye una matriz simétrica PSD. El plan conserva intensidad, número de
observaciones, estimador y menor autovalor.

A partir de esa matriz se calcula:

- Varianza: `wᵀΣw`.
- Volatilidad anual cripto desde velas horarias: `√(wᵀΣw) × √(24×365)`.
- Contribución al riesgo: `wᵢ(Σw)ᵢ / (wᵀΣw)`.
- Diversification ratio: `Σ(wᵢσᵢ) / σₚ`.
- VaR gaussiano por período: `zα·√(wᵀΣw)`, con `α=95%` configurable.
- Marginal VaR: `zα·(Σw)ᵢ/σₚ`.
- Component VaR: `wᵢ·MVaRᵢ`; por identidad de Euler, su suma debe coincidir
  con el VaR total salvo error numérico menor a `1e-14`.
- Concentración factorial: pesos absolutos agrupados por `factor`, HHI,
  cantidad efectiva de factores y mayor share.

El diagnóstico de cola evita depender solamente de normalidad:

- **Filtered Historical Simulation (FHS):** filtra cada retorno por su
  volatilidad EWMA (`λ=0.94`) y reescala los residuos con la volatilidad
  condicional pronosticada. De sus escenarios obtiene VaR y Expected Shortfall
  empíricos al 99%.
- **EVT/POT:** selecciona pérdidas sobre el percentil 90 y ajusta una
  Generalized Pareto por método de momentos. Extrapola VaR y Expected Shortfall
  al 99%; exige al menos 10 excesos, limita `ξ<1` para que la media de cola sea
  finita y publica tanto el shape crudo como el usado.
- **Estimación conservadora:** entre modelos disponibles, reporta el de mayor
  Expected Shortfall. No se interpreta como cota máxima garantizada.
- **Validación fuera de muestra:** una ventana móvil de 100 retornos vuelve a
  estimar FHS sin mirar el dato siguiente. Kupiec contrasta la frecuencia de
  excepciones, Christoffersen su independencia y el test conjunto usa dos
  grados de libertad. El semáforo binomial reproduce para 250 observaciones al
  99% las zonas Basel: verde 0–4, amarillo 5–9 y rojo desde 10.

Los p-values, conteos de transición y umbrales quedan dentro del plan. El
semáforo es diagnóstico: T16 no lo convierte por sí solo en autorización o
veto, porque una muestra fuera de mercado y una calibración no gobernada no
deben controlar ejecución automáticamente.

Los factores iniciales son `crypto-core` para BTC/ETH, `high-beta-l1` para SOL
y `venue-linked` para BNB. El plan informa breaches relativos al capital
invertido; no oculta el efectivo como factor diversificador.

## Rebalanceo

No se genera trade cuando la diferencia absoluta contra el objetivo es menor a 2%. El turnover es `½Σ|Δw|`; si supera 20% por ciclo, todas las órdenes se reducen proporcionalmente. Esto controla fees, slippage y churn.

Cada plan conserva pesos actuales, objetivos, contribuciones al riesgo,
órdenes notionals paper, efectivo objetivo, observaciones, modelos de cola,
backtests y estado de aprobación.

Cada plan ejecuta además el catálogo versionado de stress: pérdida de mercado,
liquidez, contraparte, equity posterior, dependencia adversa, reverse stress y
capital buffer. Las fórmulas, supuestos de datos faltantes y alcance se detallan
en `STRESS_TESTING.md`.

## API

- `GET /v1/portfolio/status`: cartera marcada, política y último plan.
- `POST /v1/portfolio/plan`: acepta una matriz de retornos por activo o consulta velas horarias del Data Plane.
- `GET /v1/risk/scenarios`: catálogo versionado de shocks.
- `POST /v1/risk/stress`: corrida adicional sobre un plan existente.
- `POST /v1/risk/reverse-stress`: distancia al drawdown objetivo.

Los planes se persisten en `portfolio.plans` con integridad SHA-256 del almacenamiento. Una fase futura puede transformar planes aprobados en órdenes, siempre pasando nuevamente por Risk Gate.
