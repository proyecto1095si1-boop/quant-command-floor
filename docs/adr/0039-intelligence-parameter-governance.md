# ADR 0039: gobierno de parámetros de Intel Hub

- Estado: aceptada para paper trading
- Fecha: 2026-10-23

## Decisión

Usar datasets firmados, holdout de un solo uso, gates no compensables y
aprobación dual antes de iniciar shadow/canary. Tratar `intelligence` como clase
de modelo que requiere graduación positiva antes de promoción.

## Motivo

Una recomendación reproducible puede seguir estando sobreajustada o provenir de
ground truth manipulado. Separar evaluación, aprobación, experimento y promoción
evita que una sola persona o métrica cambie los pesos activos.

## Consecuencias

El proceso es más lento y consume datasets de holdout. A cambio, cada transición
queda ligada a hashes, identidades y evidencia paper. La aplicación efectiva de
parámetros queda fuera de esta decisión.
