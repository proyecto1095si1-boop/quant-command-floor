# Ciclo de vida temporal de labels

T28 evita que un resultado conocido contamine la evaluación prequential. El
registro del pronóstico y el del resultado son operaciones separadas y todos los
tiempos de recepción provienen del reloj del servidor.

## Estados y reloj causal

Cada pronóstico nace `pending` con `predictedAt`, `horizonMs` y:

```text
maturesAt = predictedAt + horizonMs
```

`POST /v1/governance/experiments/forecast` no acepta un outcome. Solo conserva
el hash del request, régimen y probabilidades champion/challenger. El default de
`forecastHorizonMs` es una hora.

`POST /v1/governance/experiments/label` ya no acepta outcomes manuales. T29
deriva `outcomeAt=maturesAt` y el resultado desde evidencia Coinbase/Kraken
point-in-time. `horizonMs`, cuando se repite en el request, debe ser idéntico al
del pronóstico. La pérdida se calcula recién después de validar:

```text
predictedAt <= maturesAt <= outcomeAt <= observedAt
```

Así, una fila no puede aportar log-loss antes de que venza el horizonte que se
declaró sin conocer el resultado.

El contrato de precios, ventanas, consenso y finalidad está en
`docs/OUTCOME_ORACLE.md`.

## Correcciones inmutables

Un label corregido no reemplaza al anterior. Agrega una revisión con número,
`previousHash` y SHA-256 canónico. La corrección mantiene el mismo `outcomeAt`,
requiere motivo, operador y segundo aprobador distintos. El monitor recalcula
todo desde la revisión activa; recovery valida la cadena completa y falla
cerrado ante alteraciones.

Este hash detecta divergencias dentro del journal paper. No sustituye firma de
workload, sello de tiempo externo ni almacenamiento WORM; esos controles siguen
abiertos para una futura operación real.

## Labels ausentes y censura

Después de `maturesAt + labelGraceMs` —24 horas por default— un operador puede
marcar un pronóstico `censored` con motivo. La censura es terminal y esa fila no
entra en el e-process. Se informan total, pendientes, pendientes maduros,
etiquetados, censurados, corregidos y tasa de censura.

Graduar exige:

- cero pronósticos pendientes, incluso si todavía no maduraron;
- tasa de censura menor o igual a `maxCensorRate` —5 % por default—;
- todos los gates estadísticos y operativos de T27.

No se aplica inverse-probability-of-censoring weighting automáticamente. IPCW
solo es consistente si el mecanismo de observación y sus probabilidades están
identificados; inventarlas produciría evidencia aparentemente precisa pero
sesgada. Hasta disponer de ese modelo, el sistema muestra la censura y bloquea
la graduación cuando supera el límite.

## Recuperación y migración

Los eventos `forecast`, `label` y `censor` se reproducen en orden. Se verifican
horizonte, secuencia de estados, hashes, doble aprobación y tiempos causales.
Un evento de forecast anterior a T28 que contenía outcome carece de la separación
temporal demostrable y falla cerrado; los experimentos afectados deben cerrarse
y reiniciarse, no migrarse como evidencia válida.

Todo este flujo sigue siendo exclusivamente `paperOnly: true`.
