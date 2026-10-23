# Conectores externos de inteligencia

La capa integra cinco proveedores exclusivamente read-only. Las claves se resuelven
en el backend y nunca se devuelven por API, se guardan en la UI ni se registran
en checkpoints.

| Proveedor | Operaciones implementadas | Uso previsto |
|---|---|---|
| Finnhub | `news` | Noticias generales, cripto, forex y M&A |
| FRED | `series` | Inflación, tasas, empleo y macroeconomía |
| Financial Modeling Prep | `profile`, `news` | Fundamentales y noticias de acciones |
| Polygon | `aggregates` | Barras históricas de acciones, ETFs e índices |
| Yahoo Finance | `chart` | Barras de cripto, acciones, ETFs e índices sin clave |

## Contrato interno

- `GET /v1/intelligence/status`: configuración y salud sin secretos.
- `POST /v1/intelligence/query`: consulta una operación allowlisted.
- El resultado siempre declara `readOnly: true` y `paperOnly: true`.
- No existe operación genérica por URL, escritura remota, orden ni endpoint de
  administración de claves.

Cada adaptador impone timeout, retries acotados, límite rodante por minuto y
normalización. Finnhub y Polygon usan cabeceras; FRED y FMP requieren la clave
en query según su contrato. Yahoo no recibe secretos. Los errores externos se reducen a códigos internos
y no incluyen URLs con credenciales.

## Operaciones

```json
{"provider":"finnhub","operation":"news","params":{"category":"crypto"}}
```

```json
{"provider":"fred","operation":"series","params":{"seriesId":"CPIAUCSL","limit":100}}
```

```json
{"provider":"fmp","operation":"profile","params":{"symbol":"AAPL"}}
```

```json
{"provider":"polygon","operation":"aggregates","params":{"ticker":"SPY","from":"2026-10-01","to":"2026-10-22","timespan":"day"}}
```

```json
{"provider":"yahoo","operation":"chart","params":{"symbol":"BTC-USD","from":"2026-10-01","to":"2026-10-22","interval":"1d"}}
```

Yahoo se consume directamente desde Node; no se incorpora Python ni el paquete
`yfinance`. Es una fuente auxiliar no contractual, por lo que sus fallos no se
interpretan como señales y Polygon conserva su ruta independiente.

## Seguridad operacional

Una clave expuesta en una captura, chat, commit o archivo compartido debe
revocarse; no basta con eliminarla del archivo. Las claves nuevas deben entrar
mediante variables de entorno o secret manager. Antes de producción se requiere
revisar licencia, cuotas, retención, redistribución y calidad point-in-time de
cada proveedor.
