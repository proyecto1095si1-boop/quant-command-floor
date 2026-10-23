# ADR 0040: Ciclo gobernado de resultados de inteligencia

## Estado

Aceptado.

## Decisión

Intel Hub reutiliza `ExperimentService` y `OutcomeOracle` como única ruta para
evidencia online. La capa de gobernanza verifica el vínculo entre evaluación,
aprobación, experimento, modelo y versión, y expone el flujo
`forecast → resolve → graduate → activate`.

Los resultados aportados por clientes se rechazan. Graduación y promoción
requieren aprobadores independientes. Activar significa solamente promover a
`paper-champion`; no existe transición a ejecución real.

## Consecuencias

- Las métricas se calculan sobre pronósticos registrados antes del resultado.
- Se conservan las cadenas auditables del oracle y la graduación existentes.
- Un fallo de identidad o versión cierra el flujo.
- La promoción no conecta parámetros a órdenes reales.
