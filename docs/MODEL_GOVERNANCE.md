# Gobierno cuantitativo de modelos

T18 administra versiones de modelos matemáticos y de IA sin ejecutar artefactos
ni cambiar el modo `PAPER_ONLY`. Una versión nace como `challenger`; solamente
una evaluación elegible y dos aprobadores independientes pueden convertirla en
`champion`. El champion anterior pasa a `retired` y permanece auditable.

## Registro

Cada versión conserva `modelId`, versión, tipo, propietario, parámetros,
SHA-256 opcional del artefacto y un `configHash` canónico. No se admiten campos
de secretos, API keys, passwords, credenciales o access tokens.

Los modelos `kind: "ai"` requieren explícitamente:

```json
{
  "model": "identificador-del-modelo",
  "temperature": 0.1,
  "maxTokens": 2048,
  "promptVersion": "v1"
}
```

`temperature` debe estar entre 0 y 2, y `maxTokens` entre 1 y 200.000. El
endpoint del proveedor, API key y secretos pertenecen a infraestructura segura,
no a la definición versionada del empleado IA.

## Drift

La evaluación compara una muestra de referencia y una muestra actual mediante:

- Population Stability Index:
  `PSI = Σ(actualᵢ−expectedᵢ)·ln(actualᵢ/expectedᵢ)`, con 10 bins por cuantiles
  y límite 0,10.
- Kolmogórov–Smirnov de dos muestras, con p-value asintótico mínimo 0,05.
- Cambio de media estandarizado:
  `|μactual−μref|/σref`, máximo 0,50.

Los tres controles deben pasar. Una serie constante solo pasa mean shift si la
media permanece exactamente igual. Valores no finitos se rechazan.

## Calidad y promoción

La evidencia mínima predeterminada es:

- 250 observaciones fuera de muestra;
- score finito dentro de `[0,1]`;
- p-value de cobertura mayor o igual a 0,05;
- p-value de independencia mayor o igual a 0,05;
- cero fallos críticos;
- drift completo en verde.

El score debe provenir de una métrica definida por el dueño del modelo. Un
challenger no puede puntuar por debajo del champion vigente. T18 no reajusta
parámetros ni elige métricas automáticamente: registra el candidato y aplica
los controles, evitando que la misma muestra entrene, valide y promueva.

La promoción requiere dos identidades distintas. En producción continúan
pendientes IdP/MFA y headers firmados por un proxy confiable; texto enviado por
el cliente no constituye identidad fuerte.

## Auditoría y API

Se persisten eventos en `governance.models`, `governance.evaluations` y
`governance.promotions`. La evaluación conserva hash del dataset, checks,
métricas y drift. Al iniciar, el servicio reconstruye versiones, evaluaciones y
champions desde esos streams. Referencias huérfanas o eventos duplicados dejan
el gobierno en estado no disponible y bloquean nuevas mutaciones.

- `GET /v1/governance/status`
- `GET /v1/governance/models`
- `POST /v1/governance/register`
- `POST /v1/governance/evaluate`
- `POST /v1/governance/promote`

Los GET requieren viewer. Los POST requieren admin; promoción además necesita
un segundo aprobador.
