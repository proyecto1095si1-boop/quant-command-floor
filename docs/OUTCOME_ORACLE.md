# Outcome Oracle point-in-time

T29 deriva labels binarios desde evidencia de mercado persistida. El cliente no
puede enviar `outcome` ni `outcomeAt`: el servidor sella el punto inicial cuando
recibe el forecast y resuelve el resultado una vez vencidos horizonte y demora
de finalidad.

## Contrato matemático

El forecast declara `symbol`, `horizonMs` y `thresholdBps`. Para cada extremo se
requieren observaciones independientes de Coinbase y Kraken. El precio robusto
es la mediana entre fuentes:

```text
P0 = median(precios válidos al registrar el forecast)
P1 = median(precios válidos después de maturesAt)
r_bps = 10 000 × (P1 - P0) / P0
outcome = 1 si r_bps >= thresholdBps; en otro caso 0
```

El primer forecast fija `{symbol, horizonMs, thresholdBps}` para todo el
experimento. Cualquier intento de mezclar activos, horizontes o definiciones del
evento se rechaza; así el e-process no agrega targets cambiantes.

Con dos fuentes, la mediana es su punto medio. La divergencia se mide de forma
conservadora como `(max(price)-min(price))/median(price) × 10 000`.

## Defaults y gates

| Parámetro | Default | Función |
|---|---:|---|
| Fuentes | Coinbase, Kraken | independencia operativa |
| `minimumSources` | 2 | evita resolver con una sola fuente |
| `maxStalenessMs` | 30 000 | edad máxima del anchor |
| `maxOutcomeLagMs` | 30 000 | ventana máxima después del horizonte |
| `finalityDelayMs` | 30 000 | espera antes de resolver |
| `maxClockSkewMs` | 2 000 | tolerancia reloj exchange/recepción |
| `maxDivergenceBps` | 25 | desacuerdo máximo entre extremos |

El oracle falla cerrado ante fuente ausente o duplicada, precio no positivo,
símbolo incorrecto, observación futura, staleness, demora, clock skew o
divergencia. No sustituye datos faltantes ni elige retrospectivamente otra
ventana.

## Evidencia y recuperación

Anchor y cierre incluyen cada observación normalizada, timestamp de evento y de
recepción, precio, fuente, snapshot de política, consenso y hash SHA-256 canónico. La resolución liga
`anchorHash`, símbolo, target y threshold, y registra retorno y outcome. El label
incluye esta resolución completa; recovery recalcula hashes, consenso, retorno y
outcome antes de aceptar el evento.

La política queda congelada por experimento: cambiar fuentes o tolerancias hace
fallar cerrado el recovery de un experimento activo, que debe reiniciarse bajo
la nueva versión en lugar de mezclar reglas estadísticas.

Los tickers se consultan desde los streams point-in-time del data plane:
`ticker.<symbol>` y `ticker.kraken.<symbol>`. El anchor usa la última observación
válida anterior al instante; el cierre usa la primera observación válida desde
el vencimiento. La retención debe abarcar todo el experimento.

## Límites para un sistema futuro real

- SHA-256 local prueba integridad interna, no autoría del exchange.
- Kraken no expone timestamp de exchange en este ticker; se usa recepción.
- La demora de finalidad no convierte un ticker en dato regulatorio definitivo.
- Se requieren reloj sincronizado y monitorizado, almacenamiento WORM, firmas de
  ingesta y una tercera fuente independiente antes de capital real.
- Los thresholds deben incluir fees, spread y materialidad económica por activo.

Todo el mecanismo permanece `paperOnly: true` y no envía órdenes.
