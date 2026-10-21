# ADR 0025: backfill histórico en staging inmutable

- Estado: aceptada
- Fecha: 2026-10-21

## Contexto

Rellenar directamente gaps en streams operativos mezcla datos observados en
tiempo real con datos revisados posteriormente y puede introducir look-ahead.

## Decisión

Separar detección, plan y ejecución. Ligar el plan al estado actual, exigir
aprobación y escribir solamente en un stream staged con manifiesto hasheado. No
implementar promoción automática.

## Consecuencias

La historia operativa permanece intacta y el dataset recuperado es auditable.
Research no obtiene cobertura adicional automáticamente; una política futura
de revisión/promoción deberá ser aprobada por el propietario.
