# Decisiones pendientes

Este documento registra decisiones que requieren una definición explícita del
propietario del repositorio. No se adoptan valores por omisión.

## Licencia del repositorio

- **Estado:** pendiente de decisión del propietario.
- **Opciones solicitadas:** MIT, Apache-2.0 o propietaria.
- **Acción bloqueada:** crear el archivo `LICENSE` y declarar la licencia en la
  documentación o en los metadatos del paquete.
- **Implicación actual:** mientras no exista una licencia, no se concede de forma
  explícita permiso para usar, modificar o redistribuir el código.
- **Decisión necesaria:** seleccionar una de las opciones y, si la licencia es
  propietaria, proporcionar el texto legal aprobado.

## Gobierno de límites de stress

- **Estado:** pendiente de calibración y aprobación del propietario/riesgo.
- **Decisión necesaria:** seleccionar fuentes, ventanas, escenarios vinculantes,
  pérdida máxima, completeness mínima y respuesta a un breach.
- **Acción bloqueada:** convertir el diagnóstico T17 en veto automático del
  Risk Gate o autorización de ejecución.
- **Implicación actual:** los escenarios se calculan, persisten y muestran, pero
  no cambian la decisión pre-trade.

## Métrica primaria por modelo

- **Estado:** pendiente por familia de modelo.
- **Decisión necesaria:** definir fórmula, dirección, dataset de validación,
  horizonte y tolerancia del `score` para riesgo, ejecución y cada agente IA.
- **Acción bloqueada:** promoción autónoma o recalibración automática.
- **Implicación actual:** T18 valida rango, drift y no inferioridad, pero el
  comité humano sigue siendo responsable de la semántica del score.

## Guardrails por familia de modelo

- **Estado:** pendientes de calibración.
- **Decisión necesaria:** muestra mínima, incremento de error, divergencia
  numérica, schema, grounding, política y latencia para cada empleado IA o
  motor matemático.
- **Acción bloqueada:** promover automáticamente o conectar modelos a ejecución
  según resultados online.

## Calibración del comité multiagente

- **Estado:** pendiente por activo y horizonte.
- **Decisión necesaria:** ventana rolling, estimador robusto de correlación,
  prior direccional, multiplicadores por régimen y tolerancia del intervalo.
- **Acción bloqueada:** usar los defaults T22 para dimensionar capital real o
  presentar su intervalo operativo como probabilidad estadística certificada.

## Ventana de dependencia dinámica

- **Estado:** pendiente por mesa y frecuencia.
- **Decisión necesaria:** λ EWMA, mínimo de observaciones, target de shrinkage,
  condition number máximo y umbrales/cooldown de cambio estructural.
- **Acción bloqueada:** reemplazar límites reales de correlación o exposición con
  los defaults T23 sin walk-forward y stress específicos.

## Custodia externa de market data

- **Estado:** arquitectura y proveedor pendientes.
- **Decisión necesaria:** elegir KMS/HSM, identidad de workload, frecuencia de
  firma, repositorio WORM, retención legal y fuentes de tiempo autenticadas.
- **Acción bloqueada:** considerar las cadenas SHA-256 locales como evidencia de
  autoría, existencia temporal o integridad frente a compromiso total del host.

## Política económica de reconciliación

- **Estado:** pendiente por activo, venue y horario.
- **Decisión necesaria:** aprobar fuentes mínimas, freshness, divergencia,
  spread, cobertura secuencial, ciclos de cuarentena y recuperación; contratar
  una tercera fuente independiente para atribuir discrepancias.
- **Acción bloqueada:** interpretar los defaults T31 como límites calibrados
  para ejecución real o liberar manualmente un producto en cuarentena.

## Calibración de microestructura y TCA

- **Estado:** pendiente por instrumento, venue y régimen.
- **Decisión necesaria:** aprobar ventanas de Amihud/Kyle, taxonomía de lado,
  horizontes de markout, benchmark de arrival price y tolerancias de shortfall.
- **Acción bloqueada:** usar T32 para seleccionar un broker/router real o
  afirmar best execution sin datos externos independientes.

## Migración de checkpoints operativos

- **Estado:** pendiente cuando exista un cambio de política o schema.
- **Decisión necesaria:** definir aprobación, herramienta de migración,
  rollback, retención del original y evidencia firmada de equivalencia.
- **Acción bloqueada:** editar hashes, borrar cuarentenas o convertir
  checkpoints incompatibles automáticamente.

## Promoción de backfills históricos

- **Estado:** no implementada.
- **Decisión necesaria:** definir revisores independientes, fuentes de contraste,
  tolerancias OHLCV, tratamiento de revisiones del venue y retención WORM.
- **Acción bloqueada:** mover `backfill.candles.*` a streams confiables, usarlos
  en Outcome Oracle o reemplazar observaciones existentes.

## Backend externo de telemetría SLO

- **Estado:** persistencia JSONL local implementada; backend externo pendiente
  para producción.
- **Decisión necesaria:** proveedor, retención, cardinalidad, redundancia,
  ownership de alertas y canal de paging con escalamiento humano.
- **Acción bloqueada:** declarar cumplimiento contractual o disponibilidad real
  basándose únicamente en archivos del mismo host.

## Umbrales de readiness operacional

- **Estado:** defaults conservadores implementados para paper.
- **Decisión necesaria:** calibrar queue máxima, tasa de rechazo, muestra mínima,
  obligatoriedad de champion IA y qué degradaciones requieren paging o veto.
- **Acción bloqueada:** reutilizar estos defaults como autorización para capital
  real o interpretar `READY` como certificación de producción.

## Política de salud del proveedor IA

- **Estado:** defaults y persistencia local implementados para paper;
  calibración y backend externo pendientes.
- **Decisión necesaria:** aprobar ventana, muestra mínima, tasa de fallos,
  fallos consecutivos, p95, cooldown, pesos de selección, costos declarados,
  presupuesto, bulkheads, retención WORM/firma externa y proveedores admitidos.
- **Acción bloqueada:** considerar estos defaults un SLA contractual, habilitar
  señales IA para capital real o ocultar el fallback matemático al usuario.

## Presupuesto económico de IA

- **Estado:** ledger diario, conciliación point-in-time, firma Ed25519 y oracle
  FX multifFuente paper implementados.
- **Decisión necesaria:** aprobar precios, presupuestos, timezone contable,
  emisores y fuentes admitidos; contratar transporte autenticado, identidad de
  importadores, rotación/revocación de claves y retención WORM.
- **Acción bloqueada:** tratar el costo estimado como factura, habilitar
  auto-recarga o usar estos límites para autorizar capital real.

## Proveedores externos de inteligencia

- **Estado:** adaptadores read-only de Finnhub (`crypto`) y FRED implementados;
  los proveedores bursátiles fueron retirados según ADR 0042 y las credenciales
  reales no se almacenan en el repositorio.
- **Decisión necesaria:** revocar cualquier clave compartida fuera del secret
  manager, elegir planes, límites, licencias, retención y datasets point-in-time.
- **Acción bloqueada:** usar datos externos como fuente única de una orden real,
  redistribuirlos sin licencia o considerar una clave visible todavía segura.

## Funciones de gobernanza retiradas

- **Estado:** la calibración gobernada, experimentos, labels, Outcome Oracle y
  evaluación adversarial fueron retirados en R4 por estar fuera del camino real.
- **Recuperación:** código, pruebas y documentos están disponibles en el tag
  `pre-recorte`; reintroducirlos requiere una nueva decisión explícita de alcance.

## Defecto contable detectado durante E2: precio promedio sin marca

- **Estado:** defecto preexistente reproducido; no corregido en E2 para no mezclar
  redacción de fichas con lógica de dinero. No usar estos resultados con capital real.
- **Evidencia:** `PaperLedger.execute` compra 1 BTC a 200,02 USD, pero
  `snapshot()` sin marks usa `avgPrice = 0.000002` como valoración.
  Con una marca explícita de 200 USD, el patrimonio es 99999.77998;
  sin marca resulta 99799.779982. `accounting.balanced` sigue siendo true:
  consistencia interna no implica valoración correcta.
- **Reproducción sin red**, desde la raíz:

```sh
node -e 'const {PaperLedger}=require("./server/pipeline/paper-ledger.js"); const l=new PaperLedger(); l.execute({id:"diagnostic",symbol:"BTC-USD",side:"buy",qty:1},{mid:200,bids:[{price:199.98,size:10}],asks:[{price:200.02,size:12}]}); const s=l.snapshot(); console.log(JSON.stringify({avgPrice:s.positions["BTC-USD"].avgPrice,marketValue:s.marketValue,equity:s.equity,balanced:s.accounting.balanced}));'
```

```text
{"avgPrice":0.000002,"marketValue":0.000002,"equity":99799.779982,"balanced":true}
```

- **Siguiente acción:** corrección separada, una rama/PR, pruebas de unidades
  fijas y de valoración sin marcas antes de continuar con métricas económicas.
  No se agrega un módulo de gobernanza ni se habilita trading real.
