# ADR 0004: contabilidad decimal fija

- Estado: aceptada
- Fecha: 2026-10-20

## Contexto

JavaScript representa importes con coma flotante binaria. Sumas repetidas como
`0.1 + 0.2`, prorrateos de cost basis y consumo parcial del libro pueden dejar
residuos que afectan cash, fees, posiciones, PnL y reconciliación. Una
tolerancia oculta el residuo, pero no crea una contabilidad reproducible.

## Decisión

Usar enteros `BigInt` a escala `10^8` dentro del Paper Ledger y del recorrido
L2. Convertir entradas decimales y notación científica sin pasar por
multiplicación flotante, con redondeo half-away-from-zero en la frontera.

Mantener cost basis firmado por posición y calcular PnL realizado mediante la
porción exacta del costo cerrado. Exponer números por compatibilidad, junto con
strings decimales exactos para auditoría. Persistir los átomos como strings para
que los checkpoints sigan siendo JSON válido y aceptar el formato numérico
anterior mediante una migración canónica al restaurar.

Cada snapshot verifica exactamente:

`equity = initialCash + realizedPnL + unrealizedPnL - fees`

## Consecuencias

- Acumular fills no introduce deriva binaria en el estado contable.
- Un checkpoint restaurado conserva exactamente cash, fees y cost basis.
- La API existente no cambia de tipo, pero consumidores contables deben usar
  los campos `*Exact` cuando no toleren una conversión final a `Number`.
- Ocho decimales son una política de simulación, no metadata de exchange. Un
  futuro adaptador real deberá definir escala y límites por instrumento y
  reconciliar contra una fuente externa independiente.
- No se agrega ninguna dependencia ni capacidad de enviar órdenes reales.
