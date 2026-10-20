# ADR 0005: journal paper de doble entrada encadenado

- Estado: aceptada
- Fecha: 2026-10-20

## Contexto

Los invariantes de T13 detectan incoherencia aritmética, pero un array de fills
puede perder, duplicar o modificar filas sin dejar una secuencia verificable.
Además, un checkpoint podía persistir cash o cost basis distintos de los
movimientos que supuestamente los originaron.

## Decisión

Registrar cada fill en un journal de postings atómicos balanceados para cash,
inventario firmado, PnL realizado y fees. Encadenar filas con SHA-256 sobre una
serialización canónica e incluir secuencia, hash anterior y fingerprint del
fill. Guardar en el fill una referencia inversa a su fila.

Antes de exportar o restaurar un checkpoint se verifican:

1. secuencia, hash anterior y hash de cada fila;
2. igualdad exacta entre débitos y créditos;
3. unicidad y fingerprint de todos los fills;
4. referencia inversa `seq/hash` del fill;
5. saldos del journal contra cash, fees, PnL y cost basis;
6. capital inicial contra el ancla de génesis.

Una recuperación inválida detiene Risk Gate y propaga el error. Los checkpoints
anteriores se migran con un ancla explícita que cubre su estado desde ese
momento; no se atribuye integridad histórica que no puede demostrarse.

## Consecuencias

- Pérdida, duplicación, reordenamiento y modificación parcial son detectables.
- El checkpoint crece una fila por fill y la verificación completa es lineal.
- La cadena local no resiste a un atacante capaz de reescribir aplicación,
  datos y hashes. Producción real requiere firma externa, identidad de workload,
  almacenamiento WORM, segmentación y política de retención.
- El mecanismo sigue siendo exclusivamente paper y no agrega dependencias ni
  conectores de ejecución real.
