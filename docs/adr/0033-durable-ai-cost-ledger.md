# ADR-0033: ledger económico durable para IA

## Contexto

El score del pool usaba un costo declarado, pero no contabilizaba tokens ni
impedía exceder un presupuesto. Los números de punto flotante y los reinicios
podían ocultar diferencias pequeñas que se acumulan con muchas inferencias.

## Decisión

Representar USD como átomos decimales de ocho posiciones. Antes de llamar al
proveedor se reserva el costo de `max_tokens` o una estimación conservadora. Se
verifican límites diarios por proveedor y agente. Al recibir la respuesta se
concilian los tokens reportados; si faltan, se factura la estimación reservada.

Cada settlement guarda un checkpoint encadenado en `sre.ai-cost-ledger` con
fecha UTC, revisión, `policyHash`, `previousId`, acumulados e ID SHA-256. El
arranque y los errores de almacenamiento bloquean nuevas llamadas externas.

## Consecuencias

- Los límites concurrentes consideran reservas todavía no conciliadas.
- El gasto real puede superar la reserva si el proveedor informa más tokens;
  se registra el sobreconsumo, pero no puede deshacerse una llamada terminada.
- El endpoint y la UI muestran costo con ocho decimales sin exponer claves.
- Precio contractual, impuestos, FX y factura externa quedan pendientes.
- El ledger sólo gobierna investigación IA paper; no habilita órdenes reales.
