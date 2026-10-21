# ADR 0016: holdout firmado de uso único para calibraciones

- Estado: aceptada
- Fecha: 2026-10-21

## Contexto

T24 separó temporalmente los folds, pero el mejor candidato todavía se elige
observando todas sus métricas OOS. Reconsultar un holdout hasta obtener un
resultado favorable lo convierte gradualmente en datos de entrenamiento.

## Decisión

Registrar datasets cronológicos firmados mediante el contrato Ed25519 T21 y
fijar antes de la búsqueda un bloque de desarrollo, una purga y un holdout. La
búsqueda solo puede leer desarrollo. El holdout se abre una vez, aplica gates no
compensables y queda marcado como consumido. Una salida elegible puede iniciar
únicamente un experimento paper tras verificar un challenger idéntico y dos
aprobadores independientes.

## Consecuencias

- La selección de hiperparámetros no observa el holdout final.
- Firma, hashes y recuperación detectan alteraciones y reaperturas locales.
- Cada nueva evaluación final exige una nueva versión firmada del dataset.
- El contrato no certifica la veracidad económica del ground truth.
- No existe promoción directa ni acceso a ejecución real.

