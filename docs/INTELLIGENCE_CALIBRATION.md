# Calibración del Intelligence DAG

La calibración estima pesos y penalización por desacuerdo usando únicamente
observaciones con outcomes maduros. Es investigación `paperOnly`: genera una
recomendación, nunca modifica el DAG ni promueve parámetros.

## Dataset

Cada fila representa un único activo y requiere:

- `timestamp`: instante del snapshot.
- `outcomeAt`: instante posterior en que madura el outcome.
- `outcome`: 1 si el retorno del horizonte fue positivo; 0 si no.
- tres nodos `macro`, `news` y `market`, con señal en [-1, 1] y confianza en
  [0, 1].

Todas las filas deben tener el mismo activo y horizonte. Se rechazan timestamps
no crecientes, outcomes no maduros al `asOf`, horizontes variables y nodos
duplicados o incompletos. El dataset normalizado recibe SHA-256.

## Método

1. Walk-forward expansivo.
2. Purga y embargo entre entrenamiento y test.
3. Filtro temporal adicional: `outcomeAt` de entrenamiento debe ser anterior al
   primer `timestamp` del test.
4. En cada fold se elige el candidato exclusivamente sobre entrenamiento.
5. Ese candidato se evalúa una sola vez sobre el tramo siguiente no visto.

La probabilidad evaluada es:

```text
s = Σ(wᵢ cᵢ sᵢ) / Σ(wᵢ cᵢ)
d = sqrt(Σ(wᵢ cᵢ (sᵢ-s)²) / Σ(wᵢ cᵢ))
c = Σ(wᵢ cᵢ) · exp(-λd)
p = clip(0.5 + s·c/2)
```

Se reportan log-loss, Brier, accuracy direccional, error de calibración, conteo
de selecciones y métricas out-of-sample. La recomendación se decide por mayoría
de selecciones entre folds y conserva `autoApply: false`.

Los pesos iniciales no quedan aprobados por obtener buen resultado. Antes de
capital real se requiere dataset firmado, múltiples activos/regímenes, outcome
oracle externo, corrección por múltiples búsquedas, holdout final y revisión
independiente.
