# ADR-0026: burn rate SLO multi-ventana

- Estado: aceptada para paper trading
- Fecha: 2026-10-21

## Contexto

Los contadores acumulados mezclaban toda la vida del proceso y
`1 - burnRate` se presentaba incorrectamente como presupuesto restante. Una
única ventana además puede alertar por un pico ya terminado o reaccionar tarde.

## Decisión

Medir availability y latencia por request fechado, y frescura e integridad por
probe. Calcular cumplimiento, eventos malos, presupuesto permitido, presupuesto
restante y burn rate sobre una ventana configurable. Una alerta sólo dispara si
el umbral se supera simultáneamente en sus ventanas larga y corta.

Se adoptan inicialmente las políticas fast 14,4× (1 h/5 min) y slow 6×
(6 h/30 min). El reporte expone si la muestra cubre toda la ventana nominal.

## Consecuencias

El cálculo es auditable, distingue ausencia de datos de éxito y limita el ruido.
La memoria local no acredita un SLO mensual ni sobrevive reinicios; telemetría
durable y paging externo requieren una decisión separada. Ninguna alerta puede
habilitar trading real ni eludir el Risk Gate.
