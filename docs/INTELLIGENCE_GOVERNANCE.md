# Gobierno de parámetros de Intel Hub

Este control convierte una calibración de investigación en un challenger
trazable. No cambia los pesos activos y no autoriza capital real.

## Flujo obligatorio

1. Registrar un dataset con manifiesto, ground truth, linaje y firma Ed25519 de
   un revisor incluido en `INTELLIGENCE_GOVERNANCE_TRUSTED_REVIEWERS`.
2. Separar cronológicamente development, purga y holdout sellado.
3. Calibrar solamente sobre development mediante walk-forward anidado.
4. Abrir el holdout una única vez y aplicar gates no compensables.
5. Registrar un modelo `kind: intelligence` cuyos parámetros y artifact hash
   coincidan exactamente con la corrida elegible.
6. Obtener aprobación de dos identidades distintas.
7. Ejecutar shadow con 0% o canary paper con un máximo de 5%.
8. Graduar el experimento con evidencia positiva antes de solicitar promoción.

## Ciclo de resultados y activación paper

Cada experimento aprobado registra probabilidades champion/challenger antes del
vencimiento. El oracle fija el precio de origen, espera el horizonte y obtiene
evidencia final de fuentes independientes. La API prohíbe escribir manualmente
el outcome o su timestamp.

La graduación exige scoring secuencial prequential, no inferioridad, cobertura
por regímenes, tasa de censura, resolución completa y guardrails operativos.
Requiere dos aprobadores independientes. Solo después puede promoverse la
versión a `paper-champion`, nuevamente con cuatro ojos.

Esta activación cambia únicamente el champion del registro de modelos paper. No
modifica `PAPER_ONLY`, no habilita conectores de órdenes ni autoriza trading real.

## Gates del holdout

| Gate | Default |
|---|---:|
| Observaciones | >= 20 |
| Log-loss | <= ln(2) |
| Brier | <= 0,25 |
| Error de calibración | <= 0,15 |
| Accuracy direccional | >= 0,55 |

Los gates no se promedian: fallar uno vuelve la corrida no elegible. El holdout
queda consumido incluso cuando la corrida falla, para impedir pruebas repetidas.

## Recuperación

Datasets, corridas y aprobaciones se guardan en streams separados. Al reiniciar
se verifican firma, hashes, split, métricas recalculadas, unicidad del holdout,
modelo, experimento y aprobadores. Cualquier divergencia bloquea el servicio de
gobierno, pero no transforma el error en una señal para la mesa.

## Frontera

El sistema no aplica parámetros al DAG en esta etapa. La clave privada del
revisor nunca pertenece al proceso ni al repositorio. Antes de producción se
requieren identidad fuerte, KMS/HSM, revocación, WORM, revisión de licencia y
validación independiente del outcome oracle.
