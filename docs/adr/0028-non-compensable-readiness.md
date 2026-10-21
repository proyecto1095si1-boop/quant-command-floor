# ADR-0028: readiness no compensable por capacidades

- Estado: aceptada para paper trading
- Fecha: 2026-10-21

## Contexto

Los servicios exponían estados separados. Un consumidor podía observar un
gateway sano e ignorar que riesgo estaba detenido, el mercado cuarentenado o la
telemetría incompleta.

## Decisión

Centralizar una evaluación con controles `halt` y `degrade`. Cualquier fallo
`halt` determina `HALTED`; los fallos no se promedian. Además del estado global,
calcular capacidades independientes y reevaluar `paperExecution` inmediatamente
antes de enviar un plan al simulador.

Persistir una transición sellada cuando cambien estado, capacidades o razones.
La configuración de un LLM es sólo un control de disponibilidad declarada, no
una prueba de salud remota.

## Consecuencias

La decisión es explicable y conservadora, y un componente IA opcional no detiene
por sí solo estrategias matemáticas. La evaluación consulta varios servicios y
puede fallar cerrada si uno no responde. Los defaults requieren calibración y
nunca autorizan trading real.
