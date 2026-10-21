# Microestructura y Transaction Cost Analysis

T32 agrega medición matemática al Data Plane y al EMS paper. `microstructure`
acompaña el contexto de los agentes; `tca` aparece en estado y reconciliación de
ejecución.

## Señales pre-trade

- **Microprice:** pondera best ask por tamaño bid y best bid por tamaño ask.
- **Imbalance:** `(bid depth - ask depth)/(bid depth + ask depth)`.
- **Amihud:** media de `|log-return|/dollar volume`.
- **Kyle lambda:** pendiente OLS de cambio de precio contra notional firmado.
- **Flow toxicity:** desequilibrio absoluto buy/sell sobre volumen total. No se
  etiqueta VPIN porque no usa buckets equiprobables calibrados.

## Métricas post-trade

Implementation shortfall incluye movimiento contra arrival midpoint y fees. El
effective spread excluye fees. Los markouts tienen signo económico: positivo es
movimiento favorable posterior al fill y negativo indica selección adversa.

Todas las métricas son paper y descriptivas. No prueban best execution ni
habilitan conectividad de trading real.
