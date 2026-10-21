# Runbook — Data Plane

## Criterios de operación

El servicio está sano cuando Coinbase responde, el último ciclo tiene menos de tres intervalos, la calidad no informa datos stale/outlier y la divergencia Coinbase–Kraken es menor a 25 bps. Kraken puede degradarse temporalmente sin detener la fuente primaria, pero debe generar alerta.

## Arranque y verificación

```bash
cp .env.example .env
npm start
curl -fsS http://127.0.0.1:8787/v1/data/health
curl -fsS http://127.0.0.1:8787/v1/data/storage
curl -fsS http://127.0.0.1:8787/v1/data/snapshot/BTC-USD
```

## Recuperación

Al iniciar, el servicio verifica SHA-256, recupera hasta 1000 trades recientes por producto, restaura el último `trade_id` y reconstruye las velas abiertas. Después solicita un snapshot L2 nuevo y reanuda el flujo. Una discrepancia de checksum bloquea el replay afectado: conservar el archivo, aislar la partición y restaurarla desde backup o reingesta.

## WebSocket y fallback

`MARKET_WS_ENABLED=true` habilita Coinbase WebSocket. La reconexión usa backoff exponencial con jitter entre 500 ms y 30 s. REST continúa entregando snapshots y funciona como fallback. En redes sin salida TCP/WebSocket, mantenerlo en `false`.

## Retención

- Particiones del día activo: JSONL.
- Particiones cerradas: gzip nivel 9.
- Retención predeterminada: 30 días.
- Mantenimiento predeterminado: cada hora.

La retención es configurable con `DATA_RETENTION_DAYS`; los datos necesarios para investigación de largo plazo deben copiarse previamente a almacenamiento analítico o backups.

Los streams nuevos de mercado están encadenados por día UTC. Antes de usar un
ticker como evidencia, `pointInTimeQuotes` verifica la cadena completa disponible.
Una ruptura, fila sin sellar después de la frontera T30 o reloj no saludable debe
tratarse como incidente de integridad; no se debe reconstruir manualmente el hash.
Los datos legacy no son elegibles para el Outcome Oracle.

## Alertas

- `cycleAgeMs > 3 × MARKET_POLL_MS`: feed estancado.
- `maxDivergenceBps > 25`: precios inconsistentes.
- `quality.status = degraded`: stale, gap u outlier.
- `source.errorRate ≥ 0.20`: proveedor primario degradado.
- `stream.ageMs > 15000`: WebSocket sin mensajes.

Nunca habilitar trading real basándose solamente en el estado HTTP del proveedor. La puerta de riesgo debe consumir el estado combinado del Data Plane.
