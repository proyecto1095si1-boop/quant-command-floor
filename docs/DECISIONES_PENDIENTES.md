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
  numérica, schema, grounding, política, latencia y porcentaje canary para cada
  empleado IA o motor matemático.
- **Acción bloqueada:** conectar la selección canary con ejecución o promover
  automáticamente por resultados online.

## Datasets adversariales confiables

- **Estado:** pendiente por empleado IA y jurisdicción.
- **Decisión necesaria:** propietario, fuente, licencia, idioma, frecuencia de
  actualización y revisión humana de casos/ground truth.
- **Acción bloqueada:** considerar la suite T20 evidencia suficiente para uso
  con capital real.

## Custodia de revisores de datasets

- **Estado:** pendiente de infraestructura e identidad.
- **Decisión necesaria:** PKI o registro de claves públicas, responsables de
  custodia y rotación, revocación, quorum de firmas y conservación externa de
  manifiestos/fuentes.
- **Acción bloqueada:** interpretar una firma T21 como autorización operativa o
  como prueba de veracidad de la fuente.

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

## Política de calibración y holdout del consenso

- **Estado:** pendiente por activo, horizonte y frecuencia.
- **Decisión necesaria:** definir fuente y propietario del ground truth,
  horizonte del label, tamaño de purga/embargo, regímenes mínimos, holdout final,
  límites aceptables de log-loss/ECE/cobertura y frecuencia de recalibración.
- **Acción bloqueada:** aplicar automáticamente la recomendación T24, promoverla
  a parámetros productivos o usarla para dimensionar capital real.
- **Implicación actual:** T24 compara candidatos de forma causal y reproducible,
  y T25 sella/consume el holdout una sola vez, pero los thresholds siguen siendo
  evidencia paper-only sujeta a aprobación humana.

## Custodia del catálogo de calibración

- **Estado:** pendiente de infraestructura.
- **Decisión necesaria:** almacenamiento WORM, retención, tamaño máximo,
  versionado, responsable de publicación y proceso de revocación para datasets
  de calibración firmados.
- **Acción bloqueada:** cargar datasets mayores al límite del gateway o tratar el
  journal local como evidencia externa inmutable.

## Política secuencial por horizonte

- **Estado:** pendiente por activo y frecuencia.
- **Decisión necesaria:** alpha, margen de degradación tolerable, clipping,
  fracción de apuesta, muestras mínimas, taxonomía de regímenes y tratamiento de
  labels tardíos/corregidos.
- **Acción bloqueada:** interpretar los defaults T26 como límites aprobados para
  promoción o capital real.
- **Implicación actual:** los breaches solo revierten experimentos paper.

## Margen económico de graduación

- **Estado:** pendiente por activo y horizonte.
- **Decisión necesaria:** margen máximo de log-loss, mejora objetivo para
  potencia, tamaño mínimo y regímenes obligatorios.
- **Acción bloqueada:** interpretar una graduación T27 como autorización para
  capital real.

## Horizonte y censura de labels

- **Estado:** pendiente por activo y familia de señal.
- **Decisión necesaria:** aprobar `forecastHorizonMs`, `labelGraceMs` y
  `maxCensorRate` con validación independiente.
- **Implicación actual:** los defaults T28 (1 hora, 24 horas y 5 %) son
  conservadores operativos para paper; no constituyen calibración económica ni
  autorización para capital real.

## Política económica del Outcome Oracle

- **Estado:** pendiente por activo, venue y horizonte.
- **Decisión necesaria:** aprobar fuentes, threshold neto de fees/spread,
  staleness, demora de finalidad, clock skew y divergencia máxima.
- **Acción bloqueada:** interpretar el outcome paper como benchmark regulatorio
  o usarlo para promoción vinculada a capital real.

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

