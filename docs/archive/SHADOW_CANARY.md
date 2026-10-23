> **Retirado del alcance activo en R4. Recuperable en el tag `pre-recorte`.**
>
> Este documento se conserva únicamente como referencia histórica.

# Shadow y canary de modelos

T19 compara champion y challenger con los mismos inputs, exclusivamente en
paper. El servicio no ejecuta artefactos: recibe resultados producidos por
componentes confiables y registra métricas pareadas. Tampoco cambia el modelo
de Execution ni envía órdenes.

## Modos

- `shadow`: champion sigue siendo la selección primaria y el challenger se
  evalúa en paralelo sobre 0% de tráfico primario.
- `canary`: hasta 25% de solicitudes paper pueden seleccionar el challenger.
  La asignación es `SHA-256(experimentId:requestId) / 2³²`, por lo que el mismo
  request siempre obtiene la misma versión.

Incluso en canary, `shadowVersion` permite comparar ambos resultados. La ruta es
una recomendación paper; T19 no está conectada a órdenes.

## Datos conservados

Se almacenan hashes SHA-256 de request, input y output, nunca prompts ni
respuestas completas. Los errores se reducen a códigos sanitizados. Cada outcome
puede incluir valor numérico, label, score, latencia, validez del schema,
grounding y policy violations. Un request duplicado se rechaza para evitar
sesgar la muestra.

## Comparación pareada

El resumen calcula:

- error rate de cada versión y diferencia challenger menos champion;
- diferencia absoluta media y desacuerdo de signo para modelos numéricos;
- desacuerdo de labels;
- fallos de schema, grounding y política del challenger;
- latencia p95 por versión y su ratio.

Los guardrails solo se evalúan tras 50 pares. Defaults:

| Control | Límite |
|---|---:|
| Incremento de error | 2 puntos porcentuales |
| Policy violations | 0% |
| Fallo de schema | 2% |
| Fallo de grounding | 5% |
| Ratio de latencia p95 | 2× |
| Diferencia numérica | desactivado hasta definir escala |

Un breach cambia el experimento a `rolled-back`, lleva tráfico challenger a
cero y deja causas auditables. No retira ni promueve versiones en Model
Governance: el rollback solo desactiva el experimento.

## Recuperación y API

Start, observaciones, rollback y stop se persisten en
`governance.experiments`. Al reiniciar se reconstruyen en orden; eventos
huérfanos o duplicados bloquean el servicio de experimentos.

- `GET /v1/governance/experiments`
- `POST /v1/governance/experiments/start`
- `POST /v1/governance/experiments/assign`
- `POST /v1/governance/experiments/observe`
- `POST /v1/governance/experiments/stop`

Todas las mutaciones requieren rol admin. Los resultados incluyen
`paperOnly: true`.
