# ADR-0027: telemetría SLO durable en buckets sellados

- Estado: aceptada para paper trading
- Fecha: 2026-10-21

## Contexto

Las observaciones de T35 estaban sólo en memoria. Un reinicio restablecía el
presupuesto y una ráfaga superior al buffer podía perder requests antes del
siguiente cálculo. Persistir cada request aumentaría cardinalidad y escritura.

## Decisión

Agregar good/total por objetivo y minuto. Persistir cada versión sucia como
checkpoint SHA-256 append-only con revisión creciente y hash de la política.
Durante el arranque, verificar todos los checkpoints, seleccionar la última
revisión por bucket y bloquear snapshots y Risk Gate si falla la recuperación.

Un contador secuencial detecta observaciones HTTP expulsadas. Frescura e
integridad se muestrean autónomamente y sus buckets permiten detectar períodos
internos ausentes. La retención elimina un archivo sólo cuando el día completo
queda fuera de ventana.

## Consecuencias

Los conteos sobreviven reinicios con cardinalidad acotada y cualquier cambio de
política exige migración explícita. Un bucket pierde distribución intraminuto y
el almacenamiento local comparte dominio de fallo con la aplicación. Por eso no
reemplaza telemetría redundante/WORM ni paging humano externo. El mecanismo no
habilita trading real.
