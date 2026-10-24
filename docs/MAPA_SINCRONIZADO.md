# Mapa sincronizado

Iniciar `npm start` y `npm run serve:ui`, abrir `http://localhost:8080` y
pulsar un empleado. Su cartel muestra la última observación, fecha, entrada,
salida y evidencia. Los precios de mercado no implican un análisis ni una
operación. El mapa no ejecuta órdenes por abrirse.

El estado inicial viene de `GET /v1/floor/snapshot`; se actualiza cada cinco
segundos y con eventos WebSocket. Las observaciones antiguas se indican a los
30 segundos para mercado y actividad operativa. El lector de noticias usa la
vigencia del DAG informada por `intelligenceMaxAgeMs` (seis horas por defecto),
para no marcar como antiguo un snapshot válido entre refrescos de cinco minutos.
Los eventos previos al reinicio del gateway no están en su caché.
Los nodos sin telemetría muestran “sin datos”. Noticias requiere snapshots del
DAG y el resultado de IA requiere una ejecución del proveedor configurado.

## Verificación de esta entrega

Comando: `npm ci && npm test && npm run lint && npm run format:check && npm run coverage`

Resultado: 59 tests, 59 pass, 0 fail; lint y formato correctos; cobertura de
líneas 89.93%, superior al mínimo de 84% (línea base: 89.91%).

Chromium, con backend y datos públicos reales: BTC Desk mostró precio Coinbase,
bid/ask, niveles de libro y hora. La configuración local consultaba BTC y ETH;
SOL, BNB y noticias sin observaciones permanecieron sin datos.

## Incidencia observada al reiniciar con datos acumulados

**Corrección posterior:** la recuperación ahora utiliza lectura incremental de
JSONL y gzip, una ventana acotada para `tail` y validación incremental de la
procedencia. El almacén original de 825 MB se recuperó en 40,888 segundos con
heap limitado a 256 MB (RSS máximo: 283,5 MiB), restaurando 2.000 trades y 14
encabezados. No se modificó el archivo original de 557 MB. La retención y la
compactación no se modificaron; una llamada explícita a `replay` sigue
necesitando memoria para la cantidad de resultados solicitada.

El arranque del Data Plane falló con `Cannot create a string longer than
0x1fffffe8 characters` al usar el almacenamiento de la prueba prolongada.
`du -ah var/data | sort -rh | head -6` mostró 825 MB totales y un archivo de
libro BTC de 557 MB. Esto requiere revisar por separado la lectura por bloques
y la retención del almacén JSONL. No se eliminaron ni alteraron esos datos.

La comprobación visual posterior usó `DATA_DIR` en un directorio temporal vacío,
con el mismo código y proveedores: el arranque volvió a informar `Market data
online: BTC-USD, ETH-USD`. Esta comprobación no resuelve la recuperación del
almacenamiento grande existente.
