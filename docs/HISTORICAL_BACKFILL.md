# Backfill histórico controlado

T34 identifica huecos de velas y descarga únicamente observaciones faltantes
desde el conector público read-only. No reescribe market data ni habilita
ejecución real.

## Matemática de completitud

Para granularidad `Δ` y ventana `[t₀,t₁)`, el conjunto esperado es:

```text
E = { t₀ + kΔ | 0 ≤ k < (t₁-t₀)/Δ }
gaps = E − timestamps únicos observados
coverage = 1 − |gaps|/|E|
```

Inicio y fin deben estar alineados con `Δ`. Los gaps contiguos se compactan en
rangos y las solicitudes se dividen en hasta 300 velas para respetar el contrato
de Coinbase.

## Frontera de confianza

El plan completo se identifica con SHA-256 y se recalcula antes de ejecutar. Si
el stream confiable cambió, el plan queda stale. Las respuestas solo se aceptan
si símbolo, timeframe y `openTime` coinciden con un gap solicitado.

Las filas van a `backfill.candles.<product>.<granularity>` con identidad del plan,
aprobador y hora de recuperación. El manifiesto fija el hash del dataset y queda
`staged/promoted=false`. No existe ruta de promoción en T34.
