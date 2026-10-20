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

El EMS infiere `reduceOnly` para una child cuando su lado es opuesto a la
posición existente y su cantidad no puede cruzar por cero. Posición, delta y
exposición se recalculan después de cada fill: una slice posterior que intentara
invertir la posición deja de ser reduce-only y vuelve a pasar por todos los
gates normales.

## Simulación y costos

Con un snapshot L2, market y stop-market recorren los niveles del lado opuesto.
Una limit solo llena los niveles que cruzan su precio y el fill se registra al
precio límite. La liquidez consumida se comparte entre las child orders del
mismo snapshot para impedir su reutilización. Si el libro no alcanza, el
resultado es parcial; si no queda liquidez, se rechaza.

Las órdenes limit pagan maker y market/stop-market pagan taker. Ambas
comisiones son configurables y usan 0,10 % por defecto. También se validan lote
y notional mínimo.

Cuando no existe un libro, el Paper Ledger conserva el fallback:

`slippage bps = base + spread/2 + participation × impact`

Ese fill queda marcado como `fillModel: "impact"`; los basados en libro usan
`fillModel: "l2"`. Cada fill descuenta fees, actualiza cash, posición, precio
promedio, PnL realizado/no realizado y exposición. La reconciliación informa
procesadas, filled, partial, rejected y snapshot final.

## Estados

- Parent: `scheduled`, `filled`, `partial` o `rejected`.
- Child: `queued`, `filled`, `partial`, `rejected` o `skipped`. Una limit no
  cruzada o un stop no disparado permanece en cola.

Las submissions se persisten en `execution.submissions` y las conciliaciones en `execution.reconciliations`.

## API

- `GET /v1/execution/status`
- `POST /v1/execution/submit`
- `POST /v1/execution/drain`

Este EMS no contiene credenciales de exchange ni rutas live. Habilitar dinero real exige un adaptador separado, secretos gestionados, allowlists, reconciliación externa y aprobación de cuatro ojos.
