# Recuperación de históricos grandes

La causa era `readFile → toString → split`: incluso `replay(..., {limit: 1})`
intentaba convertir 557 MB a una sola cadena. `tail` y `verify` además retenían
todos los eventos. El arranque de procedencia materializaba el resultado de
`replay`, limitado por defecto a 10.000 registros.

La lectura actual procesa bloques UTF-8, verifica cada checksum y libera los
streams al terminar o encontrar errores. Soporta JSONL y gzip. `tail` mantiene
una ventana circular, `verify` solo cuenta y la recuperación conserva únicamente
el último encabezado verificado por partición. Los encabezados se restauran
cuando termina la validación completa del stream. Los registros corruptos se
rechazan, incluso si quedan fuera de la ventana solicitada por `tail`.

Se conserva el formato persistido, el orden de archivos/registros, los filtros
temporales y la API de lectura. No cambian riesgo, ejecución ni contabilidad.
La memoria necesaria depende del mayor registro individual y de la ventana
solicitada. `replay` devuelve un array y conserva los resultados pedidos; para
recorridos completos se utiliza el iterador. La retención conserva su
implementación anterior.

## Compactación por bloques

La compactación también procesa archivos por bloques. Escribe un temporal con
permisos 0600, lo descomprime para comparar el SHA-256 con los bytes leídos del
original, sincroniza el temporal y publica el nombre `.jsonl.gz` mediante un
enlace que rechaza destinos existentes. Comprueba identidad, tamaño y tiempos
del original antes de retirarlo. Si falla el retiro, revierte el gzip publicado
para evitar duplicados en la lectura. Los errores de limpieza se propagan con
su causa. Espera las escrituras que ya estuvieran en cola para ese archivo.

La verificación agrega una segunda lectura y descompresión del temporal; la
memoria se mantiene acotada por los buffers. Se conserva la selección de fechas,
el nivel gzip 9, el formato y el resultado `{compressed, bytesSaved}`. La
retención no cambia. La compactación presupone un único escritor del almacén;
no añade coordinación entre procesos ni una transacción ante una terminación
abrupta del proceso. Los temporales `.tmp` no se incluyen en replay ni inventory.

Solo se ejecutó sobre datos sintéticos temporales: **no se compactaron ni
eliminaron los históricos originales**. Comando de verificación:

```sh
node --test tests/jsonl-compaction.test.js
```

```text
synthetic bytes: 266665984
{"compressed":1,"events":32768,"maxRssMiB":61.734375}
JSONL streaming compaction tests: ok
```

El proceso hijo usa `--max-old-space-size=48`. Con instrumentación de cobertura,
el RSS máximo fue 77.28125 MiB. Se probaron fallos de publicación y de retiro del
original, contenido comprimido distinto, modificaciones de la fuente, colisión
de destino, permisos, fechas y equivalencia del replay. Batería completa:

```sh
npm ci && npm test && npm run lint && npm run format:check && npm run coverage
```

```text
61 tests, 61 pass, 0 fail
lint y formato: OK
líneas: 89.98% (base: 60 tests, 89.96%)
```

## Evidencia

Antes y después se ejecutó:

```sh
npm ci && npm test && npm run lint && npm run format:check && npm run coverage
```

Base: 59 pass, 0 fail, cobertura 89.93%. Final: 60 pass, 0 fail, cobertura
89.96%; lint y formato correctos. La prueba `jsonl-streaming.test.js` comprueba
JSONL/gzip con un proceso de heap máximo 48 MB, UTF-8 entre bloques, orden,
filtros, checksums alterados y archivos truncados. La prueba de procedencia
restaura más de 10.000 registros y comprueba que un fallo no publique encabezados
parcialmente recuperados.

Reproducción sobre los datos originales (solo lectura):

```sh
node --max-old-space-size=128 -e 'const {JsonlStore}=require("./server/data/jsonl-store"); new JsonlStore("/workspace/sites/quant-command-floor-sync/var/data").replay("book.BTC-USD",{limit:1}).then(x=>console.log({events:x.length})).catch(e=>{console.error(e.message);process.exitCode=1})'
```

Antes: `Cannot create a string longer than 0x1fffffe8 characters`.
Después: `{ events: 1 }`.

Recuperación completa, sin arrancar conectores ni escribir al almacén:

```sh
node --max-old-space-size=256 -e 'const fs=require("node:fs"),{JsonlStore}=require("./server/data/jsonl-store"),{MarketDataService}=require("./server/data/service"); const root="/workspace/sites/quant-command-floor-sync/var/data",file=root+"/book.BTC-USD/2026-10-23.jsonl",before=fs.statSync(file),start=Date.now();const service=new MarketDataService({store:new JsonlStore(root)}); service.recover().then(x=>{const after=fs.statSync(file); console.log(JSON.stringify({recovered:x,seconds:(Date.now()-start)/1000,heads:service.provenance.status().heads.length,originalUnchanged:before.size===after.size&&before.mtimeMs===after.mtimeMs,maxRssMiB:process.resourceUsage().maxRSS/1024}));}).catch(e=>{console.error(e.message);process.exitCode=1})'
```

```json
{"recovered":{"trades":2000,"products":["BTC-USD","ETH-USD"],"reconciliation":true},"seconds":40.888,"heads":14,"originalUnchanged":true,"maxRssMiB":283.5}
```
