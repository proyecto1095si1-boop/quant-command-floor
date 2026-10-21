# ADR 0024: checkpoints operativos ligados a política

- Estado: aceptada
- Fecha: 2026-10-21

## Contexto

La cuarentena T31 y los markouts T32 vivían en memoria. Reiniciar podía olvidar
fallos consecutivos, liberar un producto o perder horizontes aún no observados.

## Decisión

Persistir checkpoints canónicos SHA-256 con versión, política y estado. Exigir
coincidencia exacta de política al restaurar y validar estructura, identidad y
unicidad antes de mutar memoria. Cualquier fallo bloquea el arranque normal.

## Consecuencias

Los reinicios preservan continuidad causal y no reinterpretan datos bajo otra
política. Cambiar umbrales u horizontes requiere una migración explícita futura;
no se hace conversión automática. El hash local no reemplaza firma/WORM.
