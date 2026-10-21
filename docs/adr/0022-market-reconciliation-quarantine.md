# ADR 0022: reconciliación multifonte y cuarentena con histéresis

- Estado: aceptada
- Fecha: 2026-10-21

## Contexto

La disponibilidad HTTP y un límite de divergencia global no impedían que un
producto con fuente stale, gaps de trades o libro inválido alimentara mesas. Una
recuperación de un solo ciclo también podía producir flapping.

## Decisión

Evaluar por producto fuentes únicas y frescas contra su mediana, cobertura de
IDs y estructura L2. Marcar el producto no elegible ante cualquier fallo,
cuarentenarlo tras dos fallos y exigir tres ciclos sanos para recuperarlo.
Propagar el resultado al contexto consumido por los agentes.

## Consecuencias

El sistema se abstiene antes y la recuperación es estable, a costa de menor
disponibilidad si falta Kraken. Dos fuentes solo detectan desacuerdo; no atribuyen
la fuente culpable. La selección de una tercera fuente y los umbrales económicos
quedan sujetos a decisión del propietario.
