# ADR 0023: TCA causal separado del modelo de fill

- Estado: aceptada
- Fecha: 2026-10-21

## Contexto

El ledger registraba slippage del modelo, pero no un benchmark uniforme ni
selección adversa posterior. Usar el mismo snapshot como markout introduciría
información ficticia.

## Decisión

Medir costo de precio contra arrival midpoint, sumar fees al implementation
shortfall y calcular markouts únicamente cuando llega una observación posterior
al horizonte. Mantener TCA como diagnóstico: no modifica fills ni Risk Gate.

## Consecuencias

La comparación entre fills es consistente y causal. Los markouts pueden quedar
pendientes si el feed se detiene, lo que es evidencia de incompletitud y no debe
imputarse. La calibración contra ejecución real permanece fuera de alcance.
