# SRE, auditoría y recuperación

La consola SRE observa el sistema completo sin modificar decisiones de inversión. Convierte telemetría en SLI, compara contra SLO y abre incidentes deduplicados.

## SLI y SLO

| Indicador | Cálculo | Objetivo |
|---|---|---:|
| Availability | `1 − respuestas 5xx / requests` | 99.9% |
| Latencia | requests con duración ≤ 500 ms | 95% |
| Frescura | probes con edad del último ciclo ≤ 15 s | 99% |
| Integridad | verificación de cadena SHA-256 | 100% |

Para una ventana con `N` eventos y objetivo `S`, el presupuesto permitido es
`N × (1 − S)`. Si `B` eventos son malos:

- cumplimiento: `(N − B) / N`;
- burn rate: `(B / N) / (1 − S)`;
- presupuesto restante: `max(0, 1 − B / (N × (1 − S)))`.

Un objetivo de 100% tiene presupuesto cero: cualquier fallo produce burn
infinito. Una ventana sin observaciones devuelve `null`, no un falso 100%.

Las alertas usan confirmación multi-ventana. La política fast exige ≥14,4×
tanto en 1 hora como en 5 minutos; slow exige ≥6× en 6 horas y 30 minutos.
Exigir ambas reduce alertas por un pico viejo o aislado. Los valores son
configurables por entorno.

El gateway conserva 10.000 observaciones HTTP fechadas y 2.000 latencias de
compatibilidad. `completeWindow=false` indica que el proceso todavía no observó
la ventana SLO completa; por eso el resultado local no debe presentarse como
evidencia de 30 días. Para producción hace falta telemetría externa durable.
La consola también verifica Data Plane, WebSocket, Risk halt y disponibilidad
de Research, Portfolio y Execution.

## Incidentes

Las violaciones generan incidentes `warning` o `critical`. Un código abierto se deduplica, incrementa `occurrences` y actualiza `lastSeenAt`. El ACK exige actor, hora y queda encadenado en auditoría; reconocer no elimina el evento ni altera el control que lo originó.
Los incidentes `SLO_BURN_*` se resuelven automáticamente cuando alguna de las
dos ventanas deja de superar el umbral; la transición también queda encadenada.

## Journal inmutable

Cada registro contiene secuencia, tipo, payload, timestamp, hash anterior y hash propio:

`hashₙ = SHA256(canonical(seq, type, payload, prevHash, at))`

La serialización ordena claves para obtener hashes deterministas. Cambiar un payload histórico rompe la verificación en la secuencia exacta.

## Backups

Un snapshot incluye ledger, fills, posiciones, pipeline audit, métricas, Risk Gate/high-water, champion de Research, último plan de Portfolio y estado de Execution. Se calcula SHA-256 del paquete, se persiste en `sre.backups` y se registra el digest en el journal.

La restauración automática existente recupera ledger y pipeline desde checkpoints. Antes de producción debe agregarse almacenamiento externo versionado, cifrado, política de retención, pruebas periódicas de restore y copias en otra región.

## API

- `GET /v1/sre/status`
- `POST /v1/sre/backup`
- `POST /v1/sre/incidents/:id/ack`

La consola no declara el sistema listo para capital real: siguen siendo obligatorios identidad, RBAC, secretos administrados, CI/CD, disaster recovery externo, broker limits y una revisión formal de seguridad.
