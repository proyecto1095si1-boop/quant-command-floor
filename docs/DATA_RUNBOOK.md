# Runbook — Data Plane

## Criterios de operación

El servicio está sano cuando Coinbase responde, el último ciclo tiene menos de
tres intervalos, la calidad no informa datos stale/outlier y la reconciliación
por producto es elegible. Una fuente secundaria ausente bloquea la elegibilidad:
no se degrada silenciosamente a una única observación.

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

Antes de reanudar ciclos también restaura el último checkpoint
`data.reconciliation`. La política del checkpoint debe coincidir exactamente
con la configuración activa. No eliminar el checkpoint para liberar una
cuarentena: corregir la fuente y cumplir los ciclos sanos de recuperación.

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

## Backfill de gaps

1. Solicitar `/v1/data/backfill/plan`; revisar cantidad, rangos y stream destino.
2. Ejecutar el plan sin modificarlo y con identidad humana verificable.
3. Verificar `backfill.manifests` y el `datasetHash`.
4. Mantener el dataset en staging hasta una revisión independiente.

El plan usa una grilla `[start,end)` alineada al timeframe, se vuelve inválido
si cambia el stream confiable y limita cada consulta a 300 velas. Nunca copiar
manualmente filas staged sobre el stream confiable. T34 no implementa promoción.

## Telemetría SLO

- Stream: `sre.slo-telemetry`.
- Verificar que `policyHash` coincida con objetivos, alertas, bucket y retención.
- Un `slo-telemetry-recovery-failed` mantiene el Risk Gate detenido; no borrar,
  reordenar ni editar checkpoints para reanudarlo.
- Revisar `telemetry.gaps` para probes ausentes y `telemetry.httpGaps` para
  observaciones expulsadas antes de agregarse.
- La última revisión de cada bucket debe crecer estrictamente.

Para recuperación, conservar el stream original, corregir primero la causa de
configuración o almacenamiento y reiniciar con la misma política. Un cambio de
política requiere una migración aprobada; no se acepta recalcular hashes.

## Historial de readiness

- Stream: `sre.readiness-transitions`.
- Validar `previousState`, `previousId`, `policyHash`, ID y firma semántica.
- `boundaryTruncated=true` sólo admite que retención haya eliminado el prefijo;
  no admite saltos internos.
- Ante `readiness-recovery-failed`, conservar evidencia y no reanudar Risk Gate
  editando o eliminando la transición conflictiva.

## Historial del proveedor IA

- Streams: `sre.ai-provider-health` para el primario y
  `sre.ai-provider-health.secondary` para el secundario.
- Cada llamada terminada y cada paso a `HALF_OPEN` escribe un checkpoint.
- Validar sello, `policyHash`, configuración, revisión, `previousId`, ventana,
  contadores, tiempos y transición de estados.
- `boundaryTruncated=true` permite un prefijo eliminado por retención, pero no
  revisiones faltantes dentro del tramo disponible.
- `provider-health-not-recovered` o `provider-health-persistence-failed`
  obliga a conservar el fallback matemático. No editar hashes ni vaciar el
  stream para forzar la reapertura.
- Los checkpoints v1 existentes sólo son válidos para `primary`. La versión 2
  vincula `providerId`; nunca copiar una cadena entre proveedores.

## Ledger económico IA

- Stream: `sre.ai-cost-ledger`.
- Verificar día UTC, `policyHash`, revisión, `previousId`, sello y acumulados.
- Si aparece `cost-ledger-not-recovered` o `ai-cost-persistence-failed`, no
  vaciar el historial: conservar fallback matemático y reparar almacenamiento.
- Contrastar periódicamente tokens y precios declarados con el reporte firmado
  del proveedor; esa conciliación externa aún no está automatizada.

## Alertas

- `cycleAgeMs > 3 × MARKET_POLL_MS`: feed estancado.
- `maxDivergenceBps > 25`: precios inconsistentes.
- `quality.status = degraded`: stale, gap u outlier.
- `source.errorRate ≥ 0.20`: proveedor primario degradado.
- `stream.ageMs > 15000`: WebSocket sin mensajes.
- `reconciliation.status = degraded`: primer ciclo inválido; el producto ya no
  es elegible para análisis.
- `reconciliation.status = quarantined`: dos ciclos inválidos consecutivos; no
  liberar manualmente. Se requieren tres ciclos sanos consecutivos.

## Reconciliación y respuesta

La referencia de precio es la mediana de fuentes únicas y frescas. Cada fuente
se diagnostica mediante `|pᵢ-mediana|/mediana × 10 000` y el gate usa la máxima
distancia pareada sobre el midpoint. También se exige un libro
no cruzado, niveles positivos, spread dentro de política y cobertura de IDs de
trades `observados/(maxId-minId+1)` no inferior al mínimo configurado.

Ante `insufficient-sources`, `stale-source`, `source-divergence`, `empty-book`,
`crossed-book`, `wide-spread` o `trade-sequence-coverage`, conservar evidencia,
comparar contra el proveedor y reingerir desde una fuente confiable. La
cuarentena no autoriza a corregir registros ni a relajar umbrales durante el
incidente.

Nunca habilitar trading real basándose solamente en el estado HTTP del proveedor. La puerta de riesgo debe consumir el estado combinado del Data Plane.
