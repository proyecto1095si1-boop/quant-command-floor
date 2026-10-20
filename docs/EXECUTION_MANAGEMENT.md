# Execution Management System

El EMS transforma un plan de cartera aprobado en órdenes parent y child exclusivamente paper. No acepta estrategias ni señales directas: la entrada válida es un plan persistido de Portfolio Management con aprobación humana explícita.

## Flujo

`plan proposed → human approval → parent orders → TWAP/VWAP slices → pre-trade Risk Gate → paper fill → reconciliation`

La clave de idempotencia impide encolar dos veces el mismo plan. Cada child usa un identificador derivado `parent:index`, que también protege el ledger contra fills duplicados.

## Ruteo

- **TWAP:** divide el notional en seis partes iguales a intervalos de 60 segundos.
- **VWAP:** agrega el perfil de volumen suministrado en seis buckets y asigna el notional proporcionalmente.
- **Participation cap:** cada slice se limita a `market volume × price × 10%`. El excedente queda como `residualNotional`, nunca se fuerza contra poca liquidez.

Los parámetros son configurables y están visibles en `GET /v1/execution/status`.

## Controles pre-trade

Antes de cada child order se reconstruye la cartera marcada y se consulta nuevamente Risk Gate. Se vuelven a verificar halt global, peso del activo, exposición bruta, stress loss, spread y quantity. Esto permite vetar una cola previamente aprobada si el estado cambió.

## Simulación y costos

El Paper Ledger aplica:

`slippage bps = base + spread/2 + participation × impact`

El precio de compra suma slippage y el de venta lo resta. Cada fill descuenta fees, actualiza cash, posición, precio promedio, PnL realizado/no realizado y exposición. La reconciliación informa procesadas, filled, rejected y snapshot final.

## Estados

- Parent: `scheduled`, `filled`, `partial` o `rejected`.
- Child: `queued`, `filled`, `rejected` o `skipped`.

Las submissions se persisten en `execution.submissions` y las conciliaciones en `execution.reconciliations`.

## API

- `GET /v1/execution/status`
- `POST /v1/execution/submit`
- `POST /v1/execution/drain`

Este EMS no contiene credenciales de exchange ni rutas live. Habilitar dinero real exige un adaptador separado, secretos gestionados, allowlists, reconciliación externa y aprobación de cuatro ojos.
