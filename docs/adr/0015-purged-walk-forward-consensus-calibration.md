# ADR 0015: calibración purgada walk-forward del consenso

- Estado: aceptada
- Fecha: 2026-10-21

## Contexto

T22 incorporó consenso probabilístico ajustado por correlación y T23 estimó la
dependencia de agentes con EWMA. Sus defaults eran razonables para simulación,
pero no existía evidencia temporal que comparara hiperparámetros ni robustez por
régimen. Una división aleatoria produciría leakage en series financieras.

## Decisión

Usar validación walk-forward expansiva con purga y embargo. Reiniciar el estado
por candidato/fold, calentar el EWMA solo con el pasado y predecir cada muestra
antes de observarla. Comparar una grilla determinista y acotada mediante proper
scoring rules, calibración, abstención y peor régimen. Emitir una recomendación
hasheada de investigación con `autoApply: false`.

## Consecuencias

- Las comparaciones son reproducibles y respetan el orden temporal.
- Purga y embargo deben calibrarse según el horizonte real del label; un valor
  incorrecto todavía puede filtrar información.
- Elegir el mejor candidato sobre los mismos folds introduce sesgo de selección;
  para capital real hace falta un holdout final intocable y revisión externa.
- La recomendación no cambia el runtime ni autoriza promoción o ejecución.

