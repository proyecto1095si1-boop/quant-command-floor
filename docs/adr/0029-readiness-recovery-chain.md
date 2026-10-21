# ADR-0029: recuperación encadenada de readiness

- Estado: aceptada para paper trading
- Fecha: 2026-10-21

## Contexto

T37 persistía transiciones, pero un reinicio comenzaba con estado vacío. Además,
verificar únicamente SHA-256 no demuestra que estado, razones y capacidades sean
coherentes entre sí.

## Decisión

Bloquear readiness hasta recuperar el historial disponible. Recalcular ID,
firma semántica, estado, resumen, razones y capacidades desde los checks; exigir
la misma política y continuidad temporal y causal entre transiciones.

Las transiciones nuevas incluyen `previousId`. Para compatibilidad, registros
anteriores sin ese campo conservan continuidad obligatoria por `previousState`.
Un prefijo eliminado por retención se acepta y se declara como frontera truncada;
un gap interno nunca se acepta.

## Consecuencias

Un reinicio no borra el último estado conocido y una contradicción detiene el
Risk Gate. Cambiar política exige migración explícita. La cadena local todavía
puede ser reemplazada por un atacante con control total del host, por lo que no
equivale a evidencia WORM externa ni habilita trading real.
