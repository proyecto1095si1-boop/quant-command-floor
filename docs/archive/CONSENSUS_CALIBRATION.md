> **Retirado del alcance activo en R4. Recuperable en el tag `pre-recorte`.**
>
> Este documento se conserva únicamente como referencia histórica.

# Calibración walk-forward del comité multiagente

T24 calibra, sin desplegar, los hiperparámetros del consenso T22 y de la
dependencia dinámica T23. El resultado es evidencia de investigación
**paper-only**: `autoApply` siempre es `false` y la configuración activa de las
mesas no se modifica.

## Contrato de datos

Cada observación debe estar ordenada estrictamente por `timestamp` e incluir:

- `outcome`: `1` si el retorno del horizonte fue positivo y `0` en caso
  contrario;
- `regime` y `regimeProbability` observados en ese instante;
- `signals`: el mismo conjunto de agentes, con `agent`, `signal` en `[-1, 1]` y
  `confidence` en `[0, 1]`;
- `asset`, usado como linaje descriptivo del dataset.

El productor del dataset debe fijar antes del experimento el horizonte del
label. `purgeObservations` debe cubrir como mínimo ese horizonte para impedir
que un label de entrenamiento alcance la ventana de prueba. T24 no infiere ese
horizonte a partir del precio.

## División temporal y causalidad

La validación es walk-forward expansiva. En cada fold se construyen, por índice,
cuatro bloques consecutivos:

```text
[ entrenamiento histórico ][ purga ][ prueba OOS ][ embargo ]
```

El estimador EWMA se reinicia por candidato y fold, aprende únicamente del
bloque de entrenamiento y, dentro de prueba, predice antes de observar la fila
actual. Después actualiza su estado para la predicción siguiente. No mezcla el
futuro con el pasado ni reutiliza estado entre candidatos. El embargo separa el
inicio de los bloques de prueba sucesivos; observaciones anteriores solo pueden
entrar en un entrenamiento posterior cuando ya quedaron detrás de ese margen.

## Espacio de búsqueda

La grilla cartesiana, ordenada y determinista, admite como máximo 128
candidatos:

| Motor | Parámetro | Default de búsqueda | Interpretación |
|---|---|---|---|
| Dependencia EWMA | `decay` | 0,90; 0,94; 0,97 | Memoria efectiva `(1+λ)/(1-λ)` |
| Dependencia EWMA | `baseShrinkage` | 0,10; 0,20; 0,35 | Contracción inicial hacia identidad |
| Consenso | `minimumAbsoluteSignal` | 0,15; 0,20 | Magnitud mínima para no abstenerse |
| Consenso | `minimumDirectionalProbability` | 0,55; 0,60 | Probabilidad direccional mínima |

Los demás parámetros se pueden fijar mediante `dependencePolicy` y
`consensusPolicy`. No forman parte de la búsqueda salvo que una futura ADR lo
autorice.

## Función objetivo

Cada candidato se evalúa solo sobre las ventanas OOS. Se minimiza:

```text
log-loss medio
+ peor log-loss entre regímenes
+ 0,25 × dispersión del log-loss por régimen
+ 0,50 × ECE
+ 0,10 × tasa de abstención
```

El log-loss y Brier son proper scoring rules para la probabilidad alcista. El
peor régimen y su dispersión evitan elegir una configuración que funcione solo
en el régimen dominante. ECE mide calibración en 10 bins. La penalización de
abstención evita ganar artificialmente bloqueando todas las decisiones; además
se informan cobertura y exactitud direccional condicionada a decisiones activas.

## Evidencia y límites

El reporte conserva límites de folds, métricas globales, por fold y por régimen,
ranking completo, hash del dataset y hash reproducible de la búsqueda. Requiere
al menos dos regímenes y el mínimo de folds configurado.

Esta selección sigue expuesta a multiple testing, drift, labels incorrectos y
elección oportunista del espacio de búsqueda. Antes de capital real se requiere
un dataset holdout final no usado por la búsqueda, revisión independiente,
costos/latencia del horizonte operativo, firma de procedencia y aprobación
humana. El endpoint acepta JSON acotado por el límite del gateway; datasets
grandes deben incorporarse mediante un catálogo seguro aún no implementado.

## API

`POST /v1/research/consensus-calibration` recibe `observations`, `folds`, `grid`
y políticas fijas opcionales. Persiste el reporte en
`research.consensus-calibration`. La respuesta nunca promueve ni aplica el
candidato recomendado.

