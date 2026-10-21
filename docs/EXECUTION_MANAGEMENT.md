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

## Microestructura y TCA

El contexto de análisis agrega microprice ponderado por tamaño top-of-book,
imbalance de profundidad, spread, profundidad nocional, iliquidez de Amihud,
Kyle lambda por OLS y toxicidad absoluta del flujo. Son diagnósticos sobre la
ventana observada, no estimadores calibrados universalmente.

Cada fill registra:

```text
price shortfall = lado × (fill - arrival mid) / arrival mid
fee bps = fee / notional
implementation shortfall = price shortfall + fee bps
effective spread = 2 × price shortfall
markout(h) = lado × (mid futuro(h) - fill) / fill
```

El agregado TCA pondera costos por notional. Los markouts de 1 y 5 minutos
permanecen pendientes hasta observar un libro posterior al horizonte; no se
completa un futuro inexistente con el snapshot del fill.

Ese fill queda marcado como `fillModel: "impact"`; los basados en libro usan
`fillModel: "l2"`. Cada fill descuenta fees, actualiza cash, posición, precio
promedio, PnL realizado/no realizado y exposición. La reconciliación informa
procesadas, filled, partial, rejected y snapshot final.

## Precisión monetaria e invariantes

El ledger representa internamente precio, cantidad, notional, fees, costo y PnL
como enteros `BigInt` con ocho decimales. La API conserva campos numéricos por
compatibilidad y agrega representaciones exactas con ocho decimales en
`fill.monetary` y `portfolio.accounting`. El redondeo es half-away-from-zero en
la frontera de ocho decimales.

El costo de una posición se conserva como cost basis firmado. En cada snapshot
se comprueba en unidades atómicas:

`equity = initialCash + realizedPnL + unrealizedPnL - fees`

`accounting.balanced` solo es true si el residual es exactamente cero. Los
checkpoints nuevos guardan átomos como strings JSON y la restauración sigue
aceptando checkpoints numéricos anteriores, que se canonicalizan una vez.
Cantidades menores a `0.00000001` se rechazan y la liquidez L2 consumida se
contabiliza con la misma escala para evitar niveles fantasma por coma flotante.

## Journal de doble entrada

Cada fill confirmado produce cuatro postings atómicos:

- `cash`: variación neta de efectivo;
- `inventory:<symbol>`: variación del cost basis firmado;
- `realized-pnl`: resultado realizado como cuenta de ingreso o pérdida;
- `fees`: costo explícito de ejecución.

Débitos y créditos deben coincidir exactamente. La fila incluye secuencia
monotónica, identificador y fingerprint del fill, hash anterior y SHA-256 del
contenido canónico. El fill conserva a su vez `journal.seq` y `journal.hash`.
La verificación comprueba la cadena en ambos sentidos y reconcilia los saldos
acumulados del journal contra cash, fees, PnL y cost basis del ledger.

Un checkpoint no se exporta si esa reconciliación falla. Durante recovery,
cualquier alteración detiene Risk Gate con `recovery-integrity-failed`. Un
checkpoint anterior a esta política recibe un `legacy-checkpoint-anchor`: fija
el hash de sus fills y balances al migrarlo, sin afirmar integridad previa.

SHA-256 local aporta evidencia de alteración accidental y encadenamiento, no
identidad ni no repudio frente a un atacante que pueda reescribir todo el
archivo. Capital real exige anclaje externo inmutable o firmado.

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
