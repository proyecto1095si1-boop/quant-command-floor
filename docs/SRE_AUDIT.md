# SRE, auditoría y recuperación

La consola SRE observa el sistema completo sin modificar decisiones de inversión. Convierte telemetría en SLI, compara contra SLO y abre incidentes deduplicados.

## SLI y SLO

| Indicador | Cálculo | Objetivo |
|---|---|---:|
| Availability | `1 − respuestas 5xx / requests` | 99.9% |
| Latencia | percentil 95 de requests | ≤ 500 ms |
| Frescura | edad del último ciclo de mercado | ≤ 15 s |
| Integridad | verificación de cadena SHA-256 | 100% |

El error budget es `1 − SLO`. El burn rate es `error rate / error budget`: 1× consume exactamente el presupuesto al ritmo permitido; valores mayores requieren atención.

El gateway conserva una ventana móvil de 2.000 latencias y conteos por status HTTP. La consola también verifica Data Plane, WebSocket, Risk halt y disponibilidad de Research, Portfolio y Execution.

## Incidentes

Las violaciones generan incidentes `warning` o `critical`. Un código abierto se deduplica, incrementa `occurrences` y actualiza `lastSeenAt`. El ACK exige actor, hora y queda encadenado en auditoría; reconocer no elimina el evento ni altera el control que lo originó.

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
