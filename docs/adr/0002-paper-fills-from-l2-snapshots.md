# ADR-0002: fills paper desde snapshots L2

- **Estado:** aceptada
- **Fecha:** 2026-10-20

## Contexto

El ledger calculaba todos los fills con precio medio, spread y una función de
impacto. Ese modelo no representaba niveles discretos, liquidez agotada, fills
parciales ni la interacción entre órdenes hijas que comparten un snapshot.

## Decisión

Usar `walkBook(levels, qty, limit, used)` como primitiva determinista:

- market y stop-market recorren el lado opuesto del libro y pagan comisión
  taker;
- una limit en reposo solo llena cuando el libro cruza su precio, se registra al
  precio límite y paga comisión maker;
- la liquidez consumida queda asociada al snapshot y no puede reutilizarse;
- lote y notional mínimo se validan antes del fill;
- la cantidad disponible puede producir un fill parcial;
- cada orden hija vuelve a atravesar el Risk Gate inmediatamente antes de la
  simulación;
- sin snapshot L2 se conserva el modelo de impacto y se registra
  `fillModel: "impact"`.

Maker y taker usan 0,10 % por defecto y son configurables. La latencia es un
parámetro simulado y queda en la auditoría; no implica una espera de red ni la
lectura de un libro futuro.

## Consecuencias

- Los resultados son reproducibles para un snapshot y un mapa de consumo.
- Dos órdenes contra el mismo nivel ya no pueden recibir la misma liquidez.
- La ejecución puede terminar `partial`, `resting`, `pending` o `rejected`,
  además de `filled`.
- El consumo vive en memoria porque un snapshot de mercado es efímero; tras un
  reinicio se debe obtener uno nuevo.
- Esta decisión solo gobierna paper trading y no autoriza adaptadores live.
