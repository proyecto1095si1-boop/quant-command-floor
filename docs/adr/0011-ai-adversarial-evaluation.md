# ADR 0011: evaluación adversarial de agentes IA

- Estado: aceptada
- Fecha: 2026-10-20

## Contexto

PSI y backtests financieros no miden prompt injection, claims sin evidencia,
schema roto, sesgo contrafactual, inestabilidad, costo o latencia de un LLM. Un
score único tampoco debe permitir que alta exactitud compense una violación de
política.

## Decisión

Versionar datasets hasheados con cobertura obligatoria de seis categorías,
evaluar evidencia estructurada sin contenido crudo, calcular un score compuesto
y mantener seguridad, cobertura, costo y latencia como gates no compensables.
Registrar resultados elegibles en T18 mediante una fuente tipada distinta de la
evaluación estadística de modelos matemáticos.

## Consecuencias

- Un agente IA no puede promocionarse solo por precisión media.
- Prompts y respuestas permanecen fuera del registro de gobierno.
- Los indicadores de grounding dependen de hashes de evidencia aportados por un
  evaluador confiable; aún se necesita validar la calidad de esas fuentes.
- Las métricas iniciales requieren calibración por empleado y dominio.
- No se agregan llamadas LLM, dependencias, secretos ni trading real.
