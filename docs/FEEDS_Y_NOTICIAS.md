# Feeds de majors y noticias

Se corrigió una diferencia entre `.env.example` (cuatro activos) y el arranque
real (solo BTC/ETH): ahora ambos usan BTC, ETH, SOL y BNB por defecto. Los
subconjuntos configurados explícitamente en `MARKET_PRODUCTS` se respetan.

El conector de Kraken identifica BNB como `BNBUSD`. Se probaron los tickers
públicos de Coinbase y Kraken para los cuatro activos. En el gateway iniciado
con almacenamiento temporal, sin `MARKET_PRODUCTS`, `/v1/floor/snapshot` entregó:

```json
{"paperOnly":true,"markets":[{"symbol":"BTC-USD","price":80436.51,"source":"coinbase","secondary":"kraken","status":"degraded"},{"symbol":"ETH-USD","price":2361.82,"source":"coinbase","secondary":"kraken","status":"degraded"},{"symbol":"SOL-USD","price":101.34,"source":"coinbase","secondary":"kraken","status":"degraded"},{"symbol":"BNB-USD","price":731.46,"source":"coinbase","secondary":"kraken","status":"degraded"}],"providers":{"finnhub":{"configured":false,"attempts":0},"fred":{"configured":false,"attempts":0}},"intelligenceSnapshots":0}
```

El estado global puede variar con frescura, calidad y reconciliación. No se
modificaron esos criterios para mostrar precios como saludables.

Noticias tenía dos problemas de código: faltaba el refresco periódico del DAG y
el corte temporal de una consulta actual precedía a la llegada de su respuesta.
Se corrigieron ambos. El refresco automático usa los activos configurados,
evita solapamientos y espera las peticiones pendientes al detenerse. Puede
desactivarse mediante `INTELLIGENCE_AUTO_REFRESH=false` y su intervalo por
defecto es `INTELLIGENCE_REFRESH_MS=300000` (mínimo 60000).

El entorno de esta prueba no tiene `FINNHUB_API_KEY` ni `FRED_API_KEY`. Se
verificó únicamente su presencia como booleanos; no se leyeron ni publicaron
valores. Por eso no se pudo verificar noticias reales autenticadas. El mapa
muestra ese bloqueo, y las pruebas con respuestas controladas comprueban la
transición a observaciones, fórmula y confianza reales del snapshot. Las claves
deben configurarse en el backend y requieren reinicio. No se enviaron órdenes
reales, ni se configuraron claves de trading.

Se verificó en Chromium la cabecera con los cuatro precios y el cartel de
noticias indicando credenciales ausentes. La evaluación del DAG sigue usando
su método matemático existente; no se invoca un LLM por activar el refresco.

Comandos de comprobación:

```sh
npm ci && npm test && npm run lint && npm run format:check && npm run coverage
```

La línea base fue 61 pass y cobertura 89.98%. Resultado final: 62 pass, 0 fail,
lint y formato correctos, cobertura de líneas 89.97%. Los tests cubren valores
por defecto, BNBUSD, temporización
de datos recibidos, corte histórico, ciclo de refresco y cartel de noticias.
