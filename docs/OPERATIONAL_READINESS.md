# Readiness operacional

Readiness consolida controles existentes en una decisión determinista. No usa
promedios ni permite que un control sano compense uno crítico fallido.

## Estados

- `READY`: todos los controles pasan.
- `DEGRADED`: falló al menos un control degradable, pero ninguno crítico.
- `HALTED`: falló al menos un control de severidad `halt`.

Las capacidades son independientes. Por ejemplo, un proveedor IA no configurado
produce `DEGRADED` y deshabilita `aiSignals`, pero no necesariamente
`paperExecution`. Un gap de mercado deshabilita análisis y ejecución. Una
violación de PAPER_ONLY bloquea todas las capacidades.

## Controles críticos

- mandato paper en Pipeline y Execution;
- Risk Gate abierto;
- cadena de auditoría válida;
- Data Plane y reconciliación saludables;
- reloj de procedencia saludable;
- telemetría SLO recuperada y sin gaps;
- ausencia de burn fast.

## Controles degradables

- ausencia de burn slow;
- cola y tasa de rechazo de ejecución dentro de política;
- recuperación sana de modelos, experimentos, evaluaciones y calibración IA;
- proveedor LLM configurado;
- champion IA cuando la política lo exige.

La tasa de rechazo sólo se activa con muestra suficiente:

`rejectionRate = rejectedChildren / totalChildren`

## Aplicación

`GET /v1/readiness` expone todos los inputs, expectativas y motivos. Antes de
aceptar `POST /v1/execution/submit` o `/v1/execution/drain`, el gateway recalcula
la decisión; si `paperExecution=false`, devuelve 409 y no invoca Execution
Service.

Durante `drain`, cada orden hija conserva además la revalidación independiente
del Risk Gate y usa el estado actual del Data Plane; no se inyecta un estado
`healthy` constante.

Cada cambio material de estado, capacidades o razones se sella como
`operational-readiness` y se guarda en `sre.readiness-transitions`. El payload
declara siempre `paperOnly=true` y `liveTrading=false`.

## Recuperación

El arranque permanece fail-closed hasta abrir el historial disponible. Por cada
transición se verifican:

- sello SHA-256 y `policyHash`;
- `id = SHA256(cuerpo de decisión)`;
- firma semántica de estado, capacidades y conjunto de fallos;
- estado, resumen, razones y capacidades recalculados desde los checks;
- tiempo no decreciente y continuidad `previousState`/`previousId`;
- invariantes `paperOnly=true` y `liveTrading=false`.

La retención puede eliminar el comienzo del historial; si el primer registro
conservado tiene predecessor se marca `boundaryTruncated=true`. Esto no permite
ignorar una ruptura entre dos registros que sí están presentes. Ante cualquier
error, readiness no queda disponible y el Risk Gate recibe
`readiness-recovery-failed`.

`READY` sólo significa aptitud para las capacidades paper indicadas. No prueba
salud de un broker real, custodia, secretos, compliance ni conectividad privada.
