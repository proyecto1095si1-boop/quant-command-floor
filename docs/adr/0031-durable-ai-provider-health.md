# ADR-0031: recuperación durable del circuito IA

## Contexto

ADR-0030 mantenía la ventana y el circuito exclusivamente en memoria. Un
reinicio podía olvidar un estado `OPEN`, borrar fallos recientes y permitir
nuevas llamadas contra un proveedor todavía degradado. También faltaba una
respuesta fail-closed ante errores del almacenamiento.

## Decisión

Persistir después de cada observación terminada y al entrar en `HALF_OPEN` un
checkpoint `ai-provider-health` en `sre.ai-provider-health`. El cuerpo incluye
la ventana acotada, estado, contadores, tiempos, causa sanitizada, revisión,
`policyHash`, configuración, `previousId` e ID SHA-256 del contenido.

El arranque bloquea el proveedor hasta abrir el historial. La recuperación
valida sello, esquema, límites, política, configuración, contenido, revisiones,
tiempo monotónico, cadena interna y transiciones permitidas. Un prefijo ausente
por retención se declara como `boundaryTruncated`; no se admiten cortes dentro
del historial presente. Un error de escritura vuelve a bloquear el proveedor.

Las llamadas bloqueadas o no persistibles usan el motor matemático local. No
afectan `paperExecution` y nunca habilitan trading real.

## Consecuencias

- Reiniciar no borra silenciosamente un circuito abierto ni su ventana.
- Una respuesta LLM no se entrega como señal IA si su observación no pudo
  persistirse.
- Se escribe un registro por llamada, por lo que la retención debe dimensionarse
  según el volumen.
- SHA-256 local detecta inconsistencias accidentales, pero no sustituye WORM,
  firma externa, replicación ni un ancla fuera del host.
