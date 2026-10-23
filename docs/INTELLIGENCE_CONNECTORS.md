# Conectores externos de inteligencia

El runtime admite solamente dos proveedores read-only y nunca acepta
credenciales desde el navegador.

| Proveedor | Operación | Uso permitido                                    |
| --------- | --------- | ------------------------------------------------ |
| Finnhub   | `news`    | Noticias de categoría `crypto`                   |
| FRED      | `series`  | Series macroeconómicas que contextualizan cripto |

La agregación por activo se expone en
`POST /v1/intelligence/news/signal`. Es una operación interna del servicio: no
amplía la allowlist externa ni permite controlar el request hacia Finnhub.

## Contrato de seguridad

- Todas las respuestas declaran `readOnly: true`, `paperOnly: true` y
  `liveTrading: false`.
- Finnhub rechaza cualquier categoría diferente de `crypto`.
- El servidor aplica allowlist de proveedor/operación, timeout, reintentos y
  límite de solicitudes por minuto.
- El cliente no puede suministrar URL, método HTTP ni cabeceras.
- Los fallos externos se normalizan y el DAG degrada su cobertura; nunca
  habilitan ejecución real.

Ejemplo permitido:

```json
{
  "provider": "finnhub",
  "operation": "news",
  "params": { "category": "crypto", "minId": 0 }
}
```

Variables de entorno:

```env
FINNHUB_API_KEY=
FINNHUB_RPM=60
FRED_API_KEY=
FRED_RPM=60
```

Los adaptadores retirados se pueden recuperar desde el tag `pre-recorte`; no
forman parte del producto cripto definido en `docs/ALCANCE.md`.
