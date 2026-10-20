# ADR 0013: consenso ajustado por correlación con abstención

- Estado: aceptada
- Fecha: 2026-10-20

## Contexto

Promediar señales trata como independientes a empleados que derivan de los
mismos precios. Tres variantes técnicas pueden aparentar tres votos cuando son
una sola familia de evidencia. Tampoco expresa incertidumbre ni fuerza una
abstención ante conflicto.

## Decisión

Combinar probabilidades mediante log-odds ponderados, descontar correlaciones
positivas declaradas, calcular tamaño efectivo e intervalo aproximado, aplicar
multiplicadores por régimen y exigir gates no compensables antes de proponer una
operación paper.

## Consecuencias

- Duplicar agentes correlacionados ya no multiplica linealmente la evidencia.
- El comité puede responder `NO_TRADE` aun con señal media positiva o negativa.
- Todos los aportes y gates quedan dentro de la cadena de auditoría.
- Matriz, prior, multiplicadores e intervalo son supuestos calibrables, no verdad
  económica; quedan prohibidos como límites de capital real sin validación.
