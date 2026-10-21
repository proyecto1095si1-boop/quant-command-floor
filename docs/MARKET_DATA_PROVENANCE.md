# Procedencia criptográfica del market data

T30 establece una frontera de confianza local para los eventos utilizados por
el Outcome Oracle. Tickers, libros, trades y velas nuevos reciben una cadena
SHA-256 antes de persistirse. Los datos anteriores continúan disponibles para
operación paper, pero no son elegibles como evidencia del oracle.

## Cadena diaria por stream

Para cada stream y día UTC se calcula:

```text
payloadHash_i = SHA256(canonical(evento sin provenance))
hash_i = SHA256(canonical(
  versión, stream, partición, secuencia, previousHash,
  payloadHash, fuente, símbolo, sourceSequence,
  eventAt, receivedAt, ingestedAt
))
```

La primera fila diaria tiene secuencia 1 y `previousHash=null`. Cada fila
siguiente apunta al hash anterior. Reiniciar por día coincide con la granularidad
de retención y permite eliminar particiones completas sin romper días posteriores.
La consecuencia deliberada es que borrar un día completo no puede detectarse
sin un anclaje externo.

Para trades con identificador numérico también se rechazan regresiones y se
marca `sourceGap=true` cuando el ID salta. Un salto se expone como diagnóstico:
puede indicar pérdida de ingesta, pero debe interpretarse según la semántica del
venue.

## Frontera legacy y verificación

Dentro de una partición se toleran filas legacy solamente antes del primer
evento sellado. Desde ese punto, una fila sin provenance, un payload alterado,
una secuencia rota o un hash divergente invalida la cadena. Al reiniciar se
verifican las cadenas y se restauran sus heads antes de aceptar eventos nuevos.

`pointInTimeQuotes` devuelve exclusivamente filas verificadas. Si un atacante
elimina todas las filas confiables, el Outcome Oracle falla por falta de fuentes;
no recurre a filas legacy.

## Reloj monotónico

`TrustedClock` compara el reloj civil con el avance de `process.hrtime.bigint()`.
Rechaza:

- regresiones del reloj civil;
- retroceso del reloj monotónico;
- drift absoluto superior a `MARKET_CLOCK_MAX_DRIFT_MS` —2 segundos por default—.

También se rechaza un evento cuyo timestamp de exchange adelante a recepción en
más de `MARKET_EVENT_MAX_FUTURE_MS`. Un reloj no saludable detiene la persistencia
del evento y degrada la salud del data plane.

Este control detecta anomalías locales; **no es NTP autenticado ni certifica la
hora UTC**. Antes de capital real se requiere sincronización monitorizada con
fuentes independientes, identidad de workload y alertas operativas.

## Límite criptográfico

SHA-256 encadenado detecta cambios parciales, reordenamiento e inserción dentro
de una partición disponible. Un atacante con control del host puede recalcular
toda la cadena o borrar particiones. La evolución requerida es firmar los heads
con KMS/HSM y publicarlos periódicamente en almacenamiento WORM externo. T30 no
crea claves locales ni afirma esa garantía.

El sistema continúa exclusivamente en paper trading.
