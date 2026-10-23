# ADR 0038: calibración causal y recuperación del Intelligence DAG

- Estado: aceptada para investigación paper
- Fecha: 2026-10-23

## Decisión

Calibrar pesos mediante walk-forward anidado, purgado y embargado, verificando
madurez temporal real de cada outcome. Mantener toda recomendación en estado
`research-only` y sin autoaplicación. Recuperar snapshots solo después de
verificar su hash, versión, activo, timestamp y secuencia completa.

## Consecuencias

Un reinicio conserva evidencia válida, mientras que una historia alterada no
alcanza `Intel Hub`. La calibración produce evidencia OOS reproducible, pero no
autoriza promoción ni capital real. El costo es exigir datasets más extensos y
rechazar estudios con horizontes inconsistentes.
