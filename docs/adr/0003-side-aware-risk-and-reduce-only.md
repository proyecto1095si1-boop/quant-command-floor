# ADR 0003: riesgo sensible al lado y cierres reduce-only

- Estado: aceptada
- Fecha: 2026-10-20

## Contexto

Risk Gate sumaba el notional de toda propuesta a la exposición existente. Por
eso una venta destinada a reducir una posición long parecía aumentarla y podía
ser vetada precisamente cuando el sistema necesitaba desarriesgar. El cálculo
tampoco distinguía entre cerrar una posición y cruzarla para abrir riesgo en la
dirección opuesta.

## Decisión

Representar la exposición por activo con signo, sumar un delta positivo para
compras y negativo para ventas, y reconstruir la exposición bruta reemplazando
el valor absoluto de la posición actual por el de la posición proyectada.

Permitir un modo `reduceOnly` únicamente cuando la orden reduce el valor
absoluto de una posición opuesta sin cruzar cero. Ese modo puede omitir halt y
límites de cartera para facilitar un cierre defensivo, pero conserva las
validaciones estructurales y exige que el data plane no esté caído. Execution
recalcula esta condición antes de cada child order.

## Consecuencias

- Los aumentos, reducciones, cierres y flips tienen proyecciones distintas y
  auditables.
- Un halt no bloquea la reducción segura de riesgo ya asumido.
- Una orden que cruza cero nunca hereda el privilegio reduce-only.
- La seguridad sigue limitada al simulador paper. Una futura operación real
  deberá exigir además reduce-only independiente en broker/exchange,
  reconciliación externa y límites fuera de este proceso.
