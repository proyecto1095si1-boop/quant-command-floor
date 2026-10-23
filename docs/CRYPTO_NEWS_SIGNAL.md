# Señal de noticias cripto

El motor de noticias transforma titulares read-only de Finnhub en una señal
explicable por activo para BTC, ETH, SOL y BNB. La salida es exclusivamente
informativa y paper-only; no crea órdenes ni evita el Risk Gate.

## Flujo matemático

1. **Causalidad:** solo acepta artículos cuyo `publishedAt` y `receivedAt` sean
   menores o iguales a `asOf`. Descarta observaciones con más de 72 horas.
2. **Deduplicación:** canonicaliza URLs, elimina fragmentos y parámetros de
   tracking. Sin URL, usa el titular normalizado. Cada evidencia pesa una vez.
3. **Relevancia:** asigna 1,0 si el activo aparece en el titular, 0,7 si aparece
   en el resumen y 0,25 si la noticia solo contiene términos cripto generales.
   Noticias de otro activo reciben peso cero.
4. **Sentimiento:** un léxico bipolar ponderado produce `sᵢ ∈ [-1,1]`. Una
   negación en las tres palabras anteriores invierte el signo del término.
5. **Frescura:** `fᵢ = exp(-ln(2) × edadᵢ / 24h)`. El peso final es
   `wᵢ = relevanciaᵢ × fᵢ`.
6. **Agregación:** `signal = Σ(wᵢsᵢ) / Σwᵢ`. La dispersión es la desviación
   ponderada de los sentimientos.
7. **Confianza:**
   `confidence = (1 - exp(-min(n, Σwᵢ)/5)) × exp(-dispersion)`.
   Más evidencia relevante eleva la confianza; el desacuerdo la reduce.

La respuesta incluye conteos de registros futuros, vencidos, irrelevantes y
duplicados, además de un SHA-256 de la evidencia seleccionada. El hash garantiza
reproducibilidad local, no autoría externa ni existencia temporal certificada.

## API

`POST /v1/intelligence/news/signal`

```json
{
  "asset": "BTC",
  "asOf": 1792756800000,
  "limit": 25
}
```

`asset` solo admite BTC, ETH, SOL o BNB. `limit` está entre 1 y 100. El backend
obtiene noticias de la categoría fija `crypto`; el cliente no puede proporcionar
URLs, cabeceras, categorías ni credenciales.

El DAG reutiliza exactamente este motor para su nodo `news`, evitando una
diferencia entre la señal consultable y la incorporada al Intel Hub.
