# ADR-0032: pool IA aislado con failover secuencial

## Contexto

Un único proveedor crea dependencia operacional. Un failover ingenuo puede
duplicar llamadas, compartir estado corrupto, exceder cuotas o escoger siempre
la alternativa más cara aunque el primario siga sano.

## Decisión

Mantener dos proveedores OpenAI-compatible con circuitos e historiales
separados. Elegir candidatos mediante un score determinista de estado, p95,
costo declarado y prioridad. Aplicar bulkhead y presupuesto rodante por
proveedor, con cantidad máxima de intentos por solicitud.

El failover es secuencial: sólo comienza otro intento cuando el anterior
terminó con un error clasificado como indisponibilidad. No se ejecutan llamadas
especulativas paralelas. Cada proveedor fuerza su modelo configurado y persiste
su propia observación antes de que el resultado sea aceptado.

Los checkpoints v2 vinculan `providerId`. Para migración, v1 se admite
exclusivamente como historia del proveedor `primary`.

## Consecuencias

- Una falla, saturación o cuota agotada no consume el bulkhead del otro
  proveedor.
- El máximo de intentos acota costo y latencia acumulada.
- Un pool agotado conserva el fallback matemático local.
- Los costos son parámetros declarados y requieren conciliación/calibración.
- Presupuestos, bulkheads y selección no autorizan trading real; todo continúa
  bajo `PAPER_ONLY`.
