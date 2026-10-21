# Gobierno de calibraciones y holdout sellado

T25 convierte el reporte de calibración T24 en un artefacto gobernado sin
habilitar trading real. El flujo termina, como máximo, en un experimento
`shadow` o `canary` **paper-only**. No promueve un challenger a champion ni
modifica los parámetros activos de las mesas.

## Flujo y separación de responsabilidades

```text
dataset cronológico
  → firma Ed25519 de procedencia
  → [desarrollo][purga][holdout sellado]
  → búsqueda T24 solo sobre desarrollo
  → apertura única del holdout
  → gates no compensables
  → registro del challenger
  → aprobación de dos personas
  → shadow o canary paper (máximo 5 %)
```

La persona que prepara el dataset declara el split antes de la búsqueda. La
firma cubre todas las observaciones; `splitHash` fija los límites de desarrollo,
purga y holdout. El motor de búsqueda recibe únicamente el bloque de desarrollo.
El holdout se evalúa una vez y pasa irrevocablemente de `sealed` a `consumed`.
Un segundo intento devuelve `calibration-holdout-already-consumed`.

## Procedencia firmada

Se reutiliza el contrato Ed25519 de T21. La variable
`CALIBRATION_TRUSTED_REVIEWERS` contiene un objeto JSON de reviewer ID a clave
pública PEM. Las claves privadas nunca entran al servidor ni al repositorio.

El firmante normaliza las observaciones y calcula:

```text
observationsHash = SHA256(canonical(observations))
manifestHash = SHA256(canonical(manifest))
attestationHash = SHA256(canonical({
  datasetId,
  version,
  casesHash: observationsHash,
  manifestHash
}))
signature = Ed25519.sign(bytes.fromHex(attestationHash))
```

`casesHash` conserva el nombre del contrato T21 por compatibilidad, pero en este
tipo de artefacto contiene el hash de observaciones. Además,
`manifest.groundTruthHash` debe coincidir con el hash canónico de
`timestamp`, `asset` y `outcome` de cada fila. La firma válida demuestra
integridad y autoría de la revisión; no demuestra que la fuente o el ground
truth sean correctos.

## Split inmutable

Los defaults exigen:

- 60 observaciones de desarrollo;
- 20 observaciones de holdout;
- al menos una observación purgada entre ambos bloques;
- dos regímenes tanto en desarrollo como en holdout.

El propietario debe fijar una purga igual o superior al horizonte máximo del
label. Las observaciones purgadas no participan ni en búsqueda ni en score
final. Durante el holdout, el estimador se calienta solo con desarrollo,
predice antes de observar cada resultado y después actualiza su estado.

## Gates del holdout

Todos deben aprobar; no existe compensación entre métricas:

| Gate | Default |
|---|---:|
| Observaciones holdout | ≥ 20 |
| Regímenes representados | ≥ 2 |
| Log-loss | ≤ ln(2) |
| Brier score | ≤ 0,25 |
| ECE | ≤ 0,15 |
| Cobertura de acciones | ≥ 20 % |
| Exactitud direccional condicionada | ≥ 55 % |
| Peor log-loss por régimen | ≤ 0,80 |

Estos valores son defaults conservadores de paper trading, no límites aprobados
para capital real. Se registran junto con el resultado y se vuelven a comprobar
durante la recuperación.

## Autorización de experimento

Un run elegible aún no es desplegable. Antes de iniciar el experimento debe
existir en Model Governance:

1. Un champion del mismo `modelId`.
2. Un modelo `kind: "consensus"` en etapa `challenger`.
3. Parámetros exactamente iguales a la recomendación T24.
4. `artifactHash` igual al `reproducibilityHash` del run.
5. Dos aprobadores distintos de al menos tres caracteres.

`shadow` recibe 0 % de tráfico de decisión. `canary` admite más de 0 % y hasta
5 %. Ambos reutilizan asignación determinista, observación y rollback de T19.
El challenger permanece `challenger`; una promoción posterior sigue requiriendo
la evaluación y aprobación independientes de Model Governance.

## Persistencia y recuperación

Se escriben tres streams:

- `governance.calibration-datasets`;
- `governance.calibration-runs`;
- `governance.calibration-approvals`.

La recuperación vuelve a verificar firma, linaje, hashes, split, ground truth,
consumo único, gates, artefacto del challenger, experimento y aprobaciones. Una
inconsistencia deja el servicio en `calibration-governance-recovery-failed`.

## Límites

- El gateway limita el body a 256 KiB; datasets extensos necesitan un catálogo
  de objetos inmutable aún no implementado.
- La apertura única reduce, pero no elimina, el sesgo de haber diseñado la
  grilla usando otros datasets.
- Los thresholds requieren aprobación por activo, horizonte y régimen.
- Nada de este flujo autoriza credenciales de exchange, órdenes reales o capital
  real.

