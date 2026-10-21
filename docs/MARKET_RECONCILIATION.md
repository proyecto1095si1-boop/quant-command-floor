# Reconciliación multifonte y cuarentena

T31 decide si el snapshot de un producto puede alimentar mesas, riesgo y
pipeline paper. No predice precios: verifica coherencia observable entre fuentes
y estructura de mercado.

## Métodos

Para precios frescos de fuentes únicas, la referencia es la mediana:

```text
p* = mediana(p₁, …, pₙ)
divergenciaᵢ_bps = |pᵢ - p*| / p* × 10 000
divergencia_pareada_bps = maxᵢⱼ |pᵢ-pⱼ| / ((pᵢ+pⱼ)/2) × 10 000
```

La mediana limita el efecto de outliers cuando hay tres o más fuentes. El gate
se aplica a la máxima divergencia pareada para no reducir artificialmente a la
mitad el desacuerdo cuando solo existen dos observaciones. Con solo
Coinbase y Kraken detecta desacuerdo, pero no permite atribuir cuál fuente está
equivocada. Por eso una tercera fuente sigue siendo requisito previo a uso real.

La completitud de una ventana de trades con IDs numéricos se estima como:

```text
cobertura = IDs únicos observados / (ID máximo - ID mínimo + 1)
```

El libro exige bids/asks positivos, ambos lados presentes, `bestBid < bestAsk` y:

```text
spread_bps = (bestAsk - bestBid) / midpoint × 10 000
```

## Máquina de estados

- `healthy`: el ciclo cumple toda la política.
- `degraded`: primer incumplimiento; `eligible=false` inmediatamente.
- `quarantined`: dos incumplimientos consecutivos por defecto.
- recuperación: tres ciclos sanos consecutivos por defecto.

La asimetría evita que un único tick favorable libere datos inestables. El
estado se expone en health y snapshot; `analysisContext` propaga `degraded` o
`quarantined`, por lo que las mesas se abstienen y el Risk Gate no recibe una
propuesta aparentemente sana.

## Límites

Los defaults son controles operativos paper, no calibración económica. La
secuencia de un venue puede no ser estrictamente contigua según su contrato; los
umbrales deben validarse por instrumento. Este control tampoco reemplaza la
procedencia T30, un feed independiente, reconciliación de balances ni vigilancia
humana. El repositorio permanece `PAPER_ONLY`.
