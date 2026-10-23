> **Retirado del alcance activo en R4. Recuperable en el tag `pre-recorte`.**
>
> Este documento se conserva únicamente como referencia histórica.

# Monitoreo secuencial de challengers

T26 vigila experimentos shadow/canary paper mediante pronósticos pareados del
champion y challenger. El sistema puede observarse después de cada label sin
repetir un test fijo ni inflar silenciosamente su tasa de falso positivo.

## Observación prequential

`POST /v1/governance/experiments/forecast` recibe:

- `experimentId` y `requestId` único;
- `championProbability` y `challengerProbability` de evento alcista;
- `regime` observado y `horizonMs` predeclarado.

El outcome no se admite en esta operación. Tras vencer horizonte y finalidad,
`POST /v1/governance/experiments/label` recibe solo `requestId`. El Outcome
Oracle deriva el resultado desde precios point-in-time Coinbase/Kraken y el
servidor verifica `predictedAt <= maturesAt = outcomeAt <= observedAt` antes de
calcular pérdida.

Las probabilidades se recortan por default a `[0,01; 0,99]`. Para cada modelo:

```text
L(p,y) = -y log(p) - (1-y) log(1-p)
d_t = L(challenger_t,y_t) - L(champion_t,y_t)
```

Un `d_t` positivo significa degradación del challenger. T28 impone la
temporalidad en el servidor y mantiene revisiones encadenadas; ya no depende de
una promesa del productor. Solo se persiste el hash del request, probabilidades,
label, régimen y métricas, no el request original. Véase
`docs/LABEL_LIFECYCLE.md`.

## E-process always-valid

La hipótesis nula es que la pérdida esperada adicional no supera el margen `δ`:

```text
H0: E[d_t | pasado] ≤ δ
E_n = Π exp(λ(d_t-δ) - λ²B²/2)
```

`B=-log(0,01)` acota la diferencia de pérdidas y `λ=0,5/B` es una apuesta fija
declarada antes de observar datos. Bajo la hipótesis condicional y el bound,
`E_n` es un supermartingale no negativo. Por la desigualdad de Ville,
`P(sup E_n ≥ 1/α) ≤ α`; por eso puede consultarse continuamente.

Defaults globales:

| Parámetro | Valor |
|---|---:|
| `alpha` | 0,01 |
| `degradationMargin` | 0 |
| `minimumObservations` | 30 |
| `probabilityFloor` | 0,01 |
| `bettingFraction` | 0,5 |
| Umbral global | 100 |

El rollback ocurre solo después de la muestra mínima y al cruzar el umbral. No
se interpreta el e-value como probabilidad de que el challenger sea malo.

## Regímenes y multiplicidad

Se mantienen e-processes separados para hasta ocho regímenes. El umbral por
régimen es `maximumRegimes/alpha` —800 con defaults—, equivalente a una
corrección Bonferroni conservadora. Cada régimen requiere 20 observaciones. Un
breach global o de régimen pone el experimento en `rolled-back`, lleva tráfico a
0 y registra `source: "sequential-monitor"`.

## Diebold–Mariano con Newey–West

Como diagnóstico se informa la media de `d_t` y su estadístico usando varianza
long-run Newey–West:

```text
L = floor(n^(1/3))
V_NW = γ_0 + 2 Σ_(l=1..L) (1-l/(L+1)) γ_l
z_DM = (mean(d)-δ) / sqrt(V_NW/n)
```

Esto corrige autocorrelación y heterocedasticidad aproximadas. El estadístico no
dispara rollback porque sus p-values asintóticos no son válidos bajo consultas
opcionales repetidas.

## Recuperación y límites

Los eventos `forecast`, `label` y `censor` se guardan en
`governance.experiments`. Durante recovery se validan transiciones, tiempo
causal y cadena de revisiones; se recalculan log-loss y diferencial desde la
revisión activa. Una divergencia falla cerrada. También se verifica que un
rollback secuencial corresponda a los breaches recalculados.

Supuestos aún abiertos:

- el horizonte, gracia y límite de censura requieren calibración por activo;
- el e-process exige el bound y la hipótesis condicional declarados;
- un régimen mal clasificado puede diluir evidencia local;
- los parámetros necesitan calibración por horizonte y activo;
- solo opera en paper trading y no autoriza promoción ni capital real.

