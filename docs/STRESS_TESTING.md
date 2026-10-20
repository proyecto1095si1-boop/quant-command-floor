# Stress Testing y riesgo sistémico

T17 agrega una capa diagnóstica **paper-only** sobre Portfolio Desk. No envía
órdenes, no relaja Risk Gate y no convierte automáticamente un escenario en
veto.

## Orden de cálculo

Cada escenario se procesa siempre en este orden:

1. exposición objetivo por activo: `|weight × equity|`;
2. pérdida mark-to-market: `−notional × shock`;
3. costo de spread stressed;
4. impacto de liquidación;
5. haircut de contraparte;
6. equity posterior y capital buffer.

El catálogo versionado contiene calibraciones internas inspiradas en COVID
2020, mayo 2021, Terra, FTX y el depeg de USDC, más un escenario sistémico
hipotético. No son reconstrucciones tick-by-tick ni predicciones. Los valores
son supuestos explícitos que deben recalibrarse con fuentes gobernadas antes de
capital real.

## Liquidez

Para notional `Q`, volumen diario `ADV`, volatilidad `σ`, profundidad stressed
`d` y coeficiente `η`:

`impactRate = σ × η × √(Q / (ADV × d))`

El costo agrega medio spread, ampliado por el escenario. La política inicial
usa `η=0.5` y participación máxima diaria de 10%. El resultado informa días de
salida y fracción liquidable en 1, 3 y 5 días. Un venue inaccesible produce
fracción cero, pero la posición sigue formando parte del equity.

Si faltan `ADV` o spread, se aplica un haircut conservador de 5% por componente,
se reduce `completeness` y se publica una advertencia. Nunca se sustituye un dato
faltante por liquidez infinita o costo cero.

## Dependencia adversa y factores

Se comparan correlaciones completas con las observadas durante el peor 10% del
retorno medio. Dependencias positivas toman la mayor correlación; coberturas
negativas se deterioran 0,25 hacia cero. La matriz se proyecta a PSD y se
renormaliza a diagonal uno. También se informa dependencia empírica de cola
inferior.

Cuando el request incluye `factorReturns`, las sensibilidades se estiman con
ridge regression:

`β = (XᵀX + λI)⁻¹Xᵀy`

El intercept no se penaliza. Se publican `β`, `R²`, observaciones y `λ`; no se
inventan series factoriales cuando faltan.

## Reverse stress

Una búsqueda binaria encuentra el shock uniforme mínimo necesario para alcanzar
el drawdown objetivo. El intervalo inicial es `[0%, −95%]`, la tolerancia es
`1e-10` y el máximo son 100 iteraciones. Si los costos fijos ya rompen el límite,
el shock crítico es cero; si ni −95% alcanza el objetivo, el resultado declara
`reachable=false`.

## Capital buffer e integridad

El buffer interno suma Expected Shortfall, costo de liquidación del peor
escenario, haircut de contraparte y 1% de reserva operacional. No es capital
regulatorio. Cada corrida persiste sus inputs y resultados en `risk.stress` y
lleva un SHA-256 determinista del payload canónico; el almacenamiento agrega sus
propios controles de integridad.

## API

- `GET /v1/risk/scenarios`
- `GET /v1/risk/stress/status`
- `POST /v1/risk/stress`
- `POST /v1/risk/reverse-stress`

Los POST requieren rol `risk`. `stress` recibe `portfolioPlanId`,
`scenarioIds`, `liquidityData`, `returnsMatrix`, `factorReturns` y overrides
indexados por scenario id. Todos los resultados incluyen `paperOnly: true`.
