# ADR 0037: DAG point-in-time para inteligencia externa

- Estado: aceptada para paper trading
- Fecha: 2026-10-23

## Decisión

Separar adquisición, transformación y decisión. Los conectores generan filas
normalizadas; un DAG aplica filtros causales y métodos deterministas; las mesas
solo reciben un snapshot hasheado mediante `Intel Hub`. Exigir dos familias de
fuentes y convertir faltantes en abstención, no en señal neutral confiable.

## Motivo

Conectar directamente una noticia o respuesta mutable al pipeline impediría
replay, introduciría look-ahead y amplificaría fallas de un proveedor. El DAG
permite atribución por empleado, consenso multifFuente y auditoría temporal.

## Consecuencias

La señal externa puede quedar bloqueada y la mesa continúa únicamente con sus
nodos matemáticos existentes. Los pesos y léxico iniciales son explícitos y
testeables, pero no están calibrados para capital real. Los snapshots se
persisten en el data plane local; firma externa y WORM siguen pendientes.
