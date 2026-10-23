# ADR 0041: Yahoo Finance sin runtime Python

## Estado

Aceptado.

## Decisión

Consumir el endpoint chart de Yahoo mediante el cliente HTTP Node existente. El
conector es read-only, no usa claves, restringe símbolos, intervalos, rango,
cantidad y frecuencia, y recorta localmente cualquier barra fuera del período.

Las barras de Yahoo y Polygon se agrupan por timestamp y su cierre se reconcilia
con la mediana antes de calcular retorno y volatilidad. Cada respuesta conserva
provenance separada.

## Consecuencias

- Se mantiene cero dependencias de runtime y no se introduce Python/yfinance.
- Yahoo mejora cobertura cuando Polygon aún no tiene una clave configurada.
- Al ser un endpoint no contractual, sus fallos degradan cobertura pero no
  producen una señal por sí mismos.
- Un uso futuro con capital real exigiría una fuente licenciada con SLA.
