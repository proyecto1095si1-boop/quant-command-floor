# Dependencia dinámica entre empleados

T23 estima por separado para cada activo cómo se relacionan las señales de los
empleados a través del tiempo.
El resultado alimenta T22 antes de incorporar la observación actual, evitando
look-ahead. Durante warm-up, inestabilidad o mala condición numérica se conserva
la matriz estática.

## EWMA online

Para cada vector de señales `xₜ`, con `α = 1 − λ` y `λ = 0,94`:

```text
δₜ = xₜ − μₜ₋₁
μₜ = μₜ₋₁ + αδₜ
Σₜ = λΣₜ₋₁ + α δₜ(xₜ − μₜ)ᵀ
```

La ventana efectiva aproximada es `(1 + λ) / (1 − λ) = 32,33`
observaciones. El set de empleados debe permanecer idéntico; un cambio se
rechaza para impedir mezclar series incompatibles.

## Shrinkage y condición

La covarianza se normaliza a correlación y se contraen los términos fuera de la
diagonal hacia identidad:

```text
R_shrunk = (1 − γ)R + γI
```

`γ` comienza en 0,20 y sube de 0,05 en 0,05 hasta que el condition number sea
menor o igual a 100. Los autovalores se calculan con rotaciones de Jacobi, sin
dependencias externas. Varianzas nulas quedan neutrales, no perfectamente
correlacionadas.

T22 solo descuenta correlaciones positivas. Una anticorrelación observada no se
considera automáticamente diversificación ni aumenta el voto de un agente.

## Estados y fallback

| Estado | Condición | Matriz usada |
|---|---|---|
| `warmup` | menos de 30 observaciones | estática T22 |
| `ready` | muestra suficiente y condición ≤ 100 | EWMA shrunk |
| `structural-change` | cambio máximo > 0,30 | estática T22 |
| `ill-conditioned` | condición > 100 aun con shrinkage | estática T22 |

Después de un cambio estructural se exigen 10 actualizaciones consecutivas con
cambio máximo ≤ 0,05 para aceptar el nuevo régimen. Este detector es un
guardrail operacional; no es una prueba formal de cambio de distribución.

## Durabilidad

Media, covarianza, correlación, baseline, diagnósticos y política forman un
checkpoint SHA-256 por activo y otro hash sobre el mapa completo. El pipeline
lo persiste junto al ledger y la cadena de auditoría. Hash, dimensiones, números finitos, activo
desconocido o política divergentes bloquean la recuperación y activan el
fail-closed ya existente.

La salida `desk.dependence` identifica `dynamic-ewma` o `static-fallback`, razón,
matriz utilizada y diagnóstico posterior a la observación.
