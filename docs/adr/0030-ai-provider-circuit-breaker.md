# ADR-0030: salud activa y circuit breaker del proveedor IA

> La limitación de persistencia descrita aquí fue resuelta localmente por
> ADR-0031; este documento conserva la decisión original.

## Contexto

La existencia de `LLM_BASE_URL` no demuestra disponibilidad, latencia aceptable
ni respuestas válidas. Considerarla suficiente permitía declarar `aiSignals`
saludable sin una sola observación real y repetir llamadas contra un proveedor
degradado.

## Decisión

Mantener en memoria una ventana rodante de llamadas terminadas con éxito o
fallo y su latencia. El circuito abre cuando se alcanza el límite de fallos
consecutivos o, con muestra mínima, la tasa de fallos. Tras un cooldown pasa a
`HALF_OPEN` y admite exactamente una prueba; su éxito cierra el circuito y su
fallo lo reabre.

Readiness considera sano al proveedor sólo si está configurado, existe al menos
una observación, el circuito está `CLOSED` y el p95 nearest-rank no excede la
política. Un proveedor no sano deshabilita `aiSignals`, pero no compensa ni
bloquea capacidades independientes. Una llamada fallida usa el motor
matemático local y declara el fallback en la respuesta.

## Consecuencias

- Se evita martillar un proveedor fallido y se limita la recuperación a una
  prueba concurrente.
- El arranque comienza con IA degradada hasta observar una llamada válida.
- La ventana vive en proceso: un reinicio pierde su estado. Persistencia,
  alerting externo y calibración de umbrales quedan pendientes.
- No se almacenan URLs, tokens ni cabeceras, y no se añade ninguna ruta de
  ejecución real. `PAPER_ONLY` permanece obligatorio.
