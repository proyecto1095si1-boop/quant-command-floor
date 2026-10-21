# Graduación gobernada de experimentos paper

T27 impide promover una nueva versión de consenso cuando ya existe un champion
sin completar primero un experimento paper. La graduación no promueve: produce
un artefacto verificable que luego Model Governance consume durante una promoción
manual independiente.

## Evidencia positiva de no inferioridad

Sea `d_t = logLoss(challenger)-logLoss(champion)` y `M` el deterioro máximo
aceptable. Para graduar se contrasta `H0: E[d_t] >= M` mediante el e-process de
T26 aplicado a `-d_t`, con margen `-M`. No basta con no detectar degradación: el
e-value debe superar `1/alpha` globalmente y `maximumRegimes/alpha` en cada
régimen observado.

Defaults:

| Parámetro | Valor |
|---|---:|
| Alpha | 0,01 |
| Margen de no inferioridad | 0,02 log-loss |
| Mejora objetivo para diseño | 1,0 log-loss |
| Muestra mínima | 100 |
| Regímenes mínimos | 2 |
| Observaciones mínimas por régimen | 30 |

La muestra planificada conservadora es:

```text
n = ceil(2 B² log(1/alpha) / targetImprovement²)
required = max(n, minimumObservations)
```

La fracción de apuesta se fija coherentemente como
`min(1, targetImprovement/B)`. El diseño es deliberadamente conservador y sus
valores deben aprobarse por activo/horizonte.

## Gates adicionales

Todos son obligatorios:

- evidencia global y por régimen;
- cobertura mínima de regímenes;
- muestra planificada completa;
- observaciones operativas del experimento suficientes;
- cero breaches de schema, grounding, política, error o latencia;
- experimento nunca revertido;
- dos aprobadores distintos.

`POST /v1/governance/experiments/graduate` pone tráfico en cero, cambia el estado
a `graduated` y genera un artefacto SHA-256 con diseño, evidencia, métricas,
versiones y aprobadores. Recovery recalcula la evidencia y verifica el hash.

## Vínculo con promoción

Model Governance registra el artefacto en `governance.graduations`. Cuando ya
existe un champion y el modelo es `kind: "consensus"`, `promote` exige una
graduación que coincida con `modelId` y versión challenger. La promoción conserva
sus propios gates offline y cuatro ojos, y registra `graduationId`.

El primer champion puede establecerse sin experimento porque todavía no existe
comparador operativo. Esta excepción de bootstrap no permite reemplazar un
champion existente.

Todo el flujo sigue siendo paper-only; no autoriza órdenes reales ni capital.

