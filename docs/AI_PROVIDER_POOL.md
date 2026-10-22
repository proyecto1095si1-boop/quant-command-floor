# Pool de proveedores IA

El pool administra dos adaptadores OpenAI-compatible sin cambiar el mandato
paper-only. Primario y secundario poseen circuito, ventana estadística,
checkpoint, límite de concurrencia y presupuesto independientes.

## Elegibilidad

Un proveedor sólo participa si está configurado, recuperó su historial, tiene
capacidad en el bulkhead, conserva presupuesto en los últimos 60 segundos y su
circuito no está abierto dentro del cooldown. Un circuito cuyo cooldown terminó
puede competir para ejecutar su única prueba `HALF_OPEN`.

El pool completo permanece bloqueado hasta terminar la recuperación de todos
los historiales configurados. Si luego falla la persistencia de un proveedor,
ese proveedor deja de ser elegible sin contaminar el circuito del otro;
readiness conserva la visión agregada fail-closed.

## Selección matemática

Para cada candidato se minimiza:

`Sᵢ = Pestado + wL × p95ᵢ/límiteP95ᵢ + wC × costoᵢ + wP × prioridadᵢ`

`Pestado` vale 0 para un proveedor sano, 1 para uno aún no observado y 10 para
uno observado pero degradado. Los empates se resuelven por ID, haciendo el
resultado reproducible. Costo es una estimación declarada por 1.000 tokens; no
es una factura ni reemplaza conciliación del proveedor.

## Failover y límites

- No se hacen requests especulativos ni hedging paralelo.
- Cada intento reserva presupuesto antes de salir.
- `maxAttempts` limita cuántos proveedores puede probar una solicitud.
- `maxConcurrent` crea un bulkhead independiente por proveedor.
- `maxRequestsPerMinute` es una ventana rodante independiente.
- Tras agotar candidatos se devuelve `provider-pool-exhausted` internamente y
  el gateway produce una señal del motor matemático local.

La respuesta externa identifica únicamente el ID lógico del proveedor y número
de intentos. El endpoint de salud no expone base URLs, claves ni cabeceras.

## Límites

Los defaults no están calibrados contra SLAs o precios contractuales. El estado
del presupuesto de un minuto vive en memoria; los circuitos sí se recuperan de
checkpoints. No existe conector de órdenes reales.
