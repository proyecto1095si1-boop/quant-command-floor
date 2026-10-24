# Fichas de empleados

## Estado de implementación

E1 incorpora el contrato y el servicio de lectura para los **33 empleados** del
registro canónico. No crea ejecutores para los nodos que hoy carecen de ellos.
Consultar una ficha no ejecuta órdenes, no consulta proveedores y no invoca IA.
Todas las operaciones siguen siendo paper trading.

La interfaz anterior sigue vigente hasta E6. E2 incorpora redacción individual
con números compartida por backend y vista anterior; el cableado exhaustivo de
entradas es E3; el desempeño medido es E4;
las relaciones verificadas son E5. Estos resultados no se presentan como hechos
cuando todavía no están implementados. La descripción del trabajo reutiliza por
ahora la fuente existente `dist/agent-profiles.js`, que también exporta `narrate`.

## Redacción por empleado (E2)

Cada uno de los 33 IDs tiene su propia función de redacción y su propia escala;
no se elige una explicación genérica por la forma del objeto recibido.
`EmployeeCards` aplica esa redacción a la última observación y a los titulares
del historial. El navegador anterior usa la misma fuente mediante `describe`.
La ficha completa del backend todavía no se monta en el cartel: corresponde a E6.

Las señales incluyen valor con signo, activo y confianza; EMA/ATR usan USD,
RSI puntos, volumen z-score, liquidez bps y unidades del activo. Una señal positiva
se describe como orientación compradora, no como compra autorizada. No existe
una banda universal neutral de ±0,1 en estos motores y por eso no se inventa:
los umbrales de abstención del consenso se leen de su política real.

Por ejemplo, +0,32 y −0,05 tienen distinto valor, orientación y significado
observado; no se deduce rentabilidad de ninguno. Las ventanas y el peso de
Technical se leen de la instancia activa. La vista anterior que aún no recibe
parámetros del backend dice «sin dato», no usa EMA9/21 por defecto.

Las redacciones distinguen cotización de análisis de mesa, aprobación de riesgo
de fill, orden parcial de completa y error operativo de detector estadístico.
Cuando ejecución solo informa una conciliación, muestra sus conteos sin
inventar precios individuales. Las asignaciones incluyen pesos por activo;
el rebalanceo muestra ajustes, banda y rotación reales. Antes del saneamiento
se proyectan los campos explicativos del plan para que diagnósticos grandes
no desplacen esos importes del presupuesto de tamaño.

El laboratorio evalúa retornos entregados (sintéticos por defecto), no ejecuta
código de estrategia ni agrega costes por sí mismo. Su validación es purged
k-fold, que puede entrenar con períodos posteriores al test: no equivale a un
walk-forward causal. Strategy Miner sigue sin motor y sin evento ficticio.

`tests/fixtures/employee-events.json` tiene 33 entradas: 32 capturas de motores
reales con entradas controladas y una ausencia explícita del minero. Proceden
de `tests/helpers/capture-employee-events.js`; no son datos reales de exchange.
Cada entrada declara fuente, activo (o ausencia de activo), parámetros y rutas
de valores esperados. El test recaptura motores sin red y compara números,
exige significados únicos y prohíbe texto genérico. UUIDs, hashes temporales y
latencias no se comparan como si fueran deterministas.

Una cadena de auditoría válida no certifica importes correctos. Durante E2 se
detectó un defecto previo de precio promedio sin marca de valoración, registrado
en `docs/DECISIONES_PENDIENTES.md`. No se modificó contabilidad en E2;
el defecto se corrigió después en una tarea separada. Las capturas de cartera
usan marcas sintéticas explícitas. El fallback a coste sigue sin ser precio vivo.

## API

- `GET /v1/employees`: resumen de los 33 empleados y `paperOnly: true`.
- `GET /v1/employees/:id/card`: contrato completo; id desconocido devuelve 404.
  Acepta `?asset=BTC` (también ETH, SOL y BNB); otro activo devuelve 422.
- `GET /v1/floor/snapshot`: incluye `employees`, el mismo resumen.
- WebSocket: `employee.updated` con `id` y `observedAt` invalida la ficha;
  el cliente vuelve a consultarla. No contiene una orden ni una llamada a IA.

Se aplican las autorizaciones existentes del gateway. El resumen usa `updatedAt`,
`asset` y `state`; el estado no equivale a autorización para operar.

## Contrato EmployeeCard, versión 1

El servidor valida cada ficha mediante `server/employees/contract.js`:

| Campo | Contenido |
| --- | --- |
| `version`, `paperOnly` | 1 y true obligatorios |
| `identity` | id, nombre, rol, área y tipo deterministic/ai/hybrid |
| `work` | función, método, parámetros con nombre/valor/unidad/fuente y estado de parámetros |
| `inputs` | nombre, fuente, state, ageMs, maxAgeMs, observedAt, lastValue y error cuando corresponde |
| `latest` | hora ISO o null, activo o null, resumen y valores crudos saneados |
| `meaning` | escala, consecuencia y acción posible del usuario |
| `reliability` | desempeño, límites y cuándo no confiar |
| `history` | capacidad, observaciones y tendencia |
| `relations` | recibe de, entrega a y estado del mapeo |
| `empty` | indicador, motivo y solución |

Los textos tienen un máximo de 1000 caracteres; hasta 16 entradas, 48 parámetros,
20 observaciones por empleado/activo, 6000 bytes de valores crudos y 24000 bytes
por ficha. La redacción y los valores se acotan y se ocultan campos sensibles y
credenciales conocidas del entorno. No se debe introducir ningún secreto en los
eventos. La UI debe insertar el texto mediante textContent o escape, nunca HTML.

## Datos y vigencia

`live` significa disponible y vigente; `stale`, disponible pero viejo; `missing`,
ausente o insuficiente; `error`, fallo observado. La antigüedad se recalcula al
leer, no se congela en la recepción. El mercado vence a los 30000 ms. Noticias
usa la vigencia del DAG, no un texto duplicado. Una observación vieja nunca pasa
la validación como live. El resumen prioriza error, viejo y ausencia sobre live.

Las fuentes se leen de snapshots ya disponibles del Data Plane, del DAG,
observaciones del pipeline y estados existentes. Un error posterior no borra
el análisis previo; la ficha diferencia el fallo del proveedor del último cálculo.
Una observación de mercado no sustituye un análisis técnico real ya recibido.
El filtro de activo no mezcla historiales de BTC con ETH, SOL o BNB.

Los mínimos de velas y operaciones se leen de la configuración de mesas. Si
faltan datos se muestra la muestra y el mínimo, no una señal inventada. Los
informes de investigación no declaran actualmente su procedencia completa:
la ficha lo explicita y no los etiqueta como datos reales del mercado. SRE solo
recoge observaciones de consultas de estado existentes, sin muestrear por abrir
la ficha. Las entradas faltantes indican motivo y solución.

## Parámetros: fuente única

`server/desks/parameters.js` alimenta tanto los cálculos de analistas como las
fichas. Los demás valores se leen de las instancias activas: políticas de riesgo,
cartera, investigación, ejecución, consenso, Data Plane y SRE. La vigencia y los
pesos de inteligencia se importan del DAG. Cada parámetro expuesto identifica su
fuente; no se afirma exponer todos los coeficientes internos del sistema.

`tests/employee-cards.test.js` compara parámetros publicados con configuración
real y recalcula EMA/RSI usando los valores mostrados. También prueba cambios de
política sin copiar números a las descripciones.

## Confiabilidad, historial y límites

En E1 el desempeño siempre es `not_measured`, muestra 0 y valor null. Nunca se
confunde confianza de una señal con tasa de aciertos. E4 deberá agregar la
medición y acordar horizonte y mínimo de muestra; hoy no hay porcentajes de éxito.

El historial es acotado y reside en memoria: se pierde al reiniciar. La tendencia
solo compara valores compatibles del mismo activo. No demuestra rentabilidad ni
causalidad. Las relaciones todavía están marcadas sin mapear; no se deducen de
líneas decorativas del mapa. E5 las contrastará con el orquestador.

No se verificaron conexiones externas ni comportamiento con capital real. Una
ficha completa no certifica seguridad, calidad del modelo ni ejecución real.

## Evidencia E1

Línea base: 64 tests aprobados, 0 fallidos; cobertura de líneas 89,99 %.
Después: 66 tests aprobados, 0 fallidos; cobertura de líneas 90,39 % (mínimo 84 %).
Comando obligatorio:

```sh
npm ci && npm test && npm run lint && npm run format:check && npm run coverage
```

Las pruebas nuevas no usan red externa: validación de las 33 fichas, límites,
frescura, muestras insuficientes, errores/recuperación, secretos, parámetros,
autorización HTTP, snapshot y WebSocket local. Las consultas no generan órdenes
ni llamadas a IA.

## Evidencia E2

El mismo comando obligatorio terminó con código 0. Línea base: 66 tests
aprobados, 0 fallidos, cobertura de líneas 90,39 %. Después: 67 aprobados,
0 fallidos, cobertura de líneas 90,41 %; lint sin errores y formato correcto.

```text
ℹ tests 67
ℹ pass 67
ℹ fail 0
All matched files use Prettier code style!
All files | 90.41 | 81.4 | 91.81 | 90.41
```

La prueba específica se ejecuta con:

```sh
node --test tests/employee-narratives.test.js
```

```text
employee narratives: 33 unique meanings, real engine recaptures, numbers/units, explicit absent miner and bounded text OK
ℹ tests 1
ℹ pass 1
ℹ fail 0
```

En las ejecuciones intermedias fallaron aserciones de redacción antigua de los
tests de perfiles/UI; se conservaron las garantías y se adaptó la expectativa de
«dólares» a USD. La batería final queda verde. No se probaron feeds externos.
