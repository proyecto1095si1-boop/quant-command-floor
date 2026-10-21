# Consenso matemático multiagente

T22 reemplaza el promedio lineal del Signal Hub por un agregador de log-odds
ajustado por dependencia. Su salida es evidencia para Risk Gate; nunca lo evita
ni ejecuta órdenes reales.

## Contrato de entrada

Cada empleado aporta `agent`, `signal ∈ [-1,1]` y `confidence ∈ [0,1]`. La
confianza debe venir de una versión calibrada y gobernada del empleado. El motor
convierte cada señal en probabilidad:

```text
pᵢ = 0.5 + signalᵢ × confidenceᵢ / 2
```

Una confianza cero produce evidencia neutral. Los valores no finitos o fuera de
rango se rechazan; no se corrigen silenciosamente.

## Peso efectivo y correlación

```text
redundancyᵢ = 1 + Σⱼ≠ᵢ max(0, ρᵢⱼ)
wᵢ = baseWeightᵢ × regimeWeightᵢ × confidenceᵢ / redundancyᵢ
logit(p*) = logit(prior) + Σᵢ wᵢ × logit(pᵢ)
```

La matriz inicial descuenta Technical/Market Structure/Order Block y, en menor
grado, Volume/Whale y Liquidity/Volume. Solo usa correlaciones positivas: una
relación negativa no se interpreta automáticamente como diversificación.

T23 reemplaza esa matriz por una estimación EWMA regularizada cuando existe
historia suficiente y estable. La matriz estática sigue siendo el fallback. Los
detalles y el checkpoint se documentan en `DYNAMIC_DEPENDENCE.md`.

El tamaño efectivo informa cuántas fuentes independientes equivalen al comité:

```text
n_eff = (Σwᵢ)² / ΣᵢΣⱼ wᵢwⱼρᵢⱼ
```

Los multiplicadores de régimen priorizan liquidez y ballenas en crisis, y
estructura/técnico en tendencias. Si la clasificación de régimen existe pero su
probabilidad es menor a 50%, el comité se abstiene.

## Incertidumbre y abstención

El intervalo operativo aproxima la incertidumbre en log-odds:

```text
information = Σ wᵢ × max(confidenceᵢ, 0.05)
SE_log_odds = 1 / sqrt(information)
IC95 = sigmoid(logit(p*) ± 1.959964 × SE_log_odds)
```

Se devuelve `NO_TRADE` si falla cualquiera de estos gates:

| Gate | Default |
|---|---:|
| Empleados válidos | ≥ 3 |
| Empleados efectivos | ≥ 2 |
| Señal absoluta | ≥ 0,20 |
| Peso máximo de un empleado | ≤ 70% |
| Probabilidad direccional | ≥ 55% |
| IC95 | excluye 50% |
| Probabilidad de régimen conocido | ≥ 50% |
| Bloqueos de datos | 0 |

Estos límites no son estimaciones universales. Deben calibrarse por activo,
horizonte y régimen mediante T18–T21 antes de capital real.

## Sala de debate y auditoría

La salida conserva aportes individuales y resume:

- `bull`: suma de contribuciones alcistas;
- `bear`: magnitud de contribuciones bajistas;
- `moderator`: LONG, SHORT o ABSTAIN;
- `investmentCommittee`: todos los gates;
- `cio`: decisión, probabilidad e intervalo.

El pipeline incluye el consenso completo en `pipeline.signal`; luego crea una
propuesta solo si no hubo abstención. Risk Gate conserva su veto independiente.
