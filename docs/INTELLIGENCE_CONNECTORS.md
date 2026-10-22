# Conectores externos de inteligencia

T45 integra cuatro proveedores exclusivamente read-only. Las claves se resuelven
en el backend y nunca se devuelven por API, se guardan en la UI ni se registran
en checkpoints.

| Proveedor | Operaciones implementadas | Uso previsto |
|---|---|---|
| Finnhub | `news` | Noticias generales, cripto, forex y M&A |
| FRED | `series` | Inflación, tasas, empleo y macroeconomía |
| Financial Modeling Prep | `profile`, `news` | Fundamentales y noticias de acciones |
| Polygon | `aggregates` | Barras históricas de acciones, ETFs e índices |

## Contrato interno

- `GET /v1/intelligence/status`: configuración y salud sin secretos.
- `POST /v1/intelligence/query`: consulta una operación allowlisted.
- El resultado siempre declara `readOnly: true` y `paperOnly: true`.
- No existe operación genérica por URL, escritura remota, orden ni endpoint de
  administración de claves.

Cada adaptador impone timeout, retries acotados, límite rodante por minuto y
normalización. Finnhub y Polygon usan cabeceras; FRED y FMP requieren la clave
en query según su contrato. Los errores externos se reducen a códigos internos
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

## Seguridad operacional

Una clave expuesta en una captura, chat, commit o archivo compartido debe
revocarse; no basta con eliminarla del archivo. Las claves nuevas deben entrar
mediante variables de entorno o secret manager. Antes de producción se requiere
revisar licencia, cuotas, retención, redistribución y calidad point-in-time de
cada proveedor.
