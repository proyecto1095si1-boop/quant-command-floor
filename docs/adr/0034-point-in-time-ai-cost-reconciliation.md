# ADR 0034: conciliación point-in-time de costos IA

- Estado: aceptada para paper
- Fecha: 2026-10-22

## Contexto

El ledger diario controla presupuesto con una tarifa declarada, pero no separa
precios de entrada/salida ni contrasta moneda, impuestos y factura del proveedor.

## Decisión

Mantener un catálogo por proveedor/modelo con intervalos no solapados y calcular
en decimal fijo el costo esperado de cada línea. Convertir subtotal más impuesto
mediante un FX explícito, medir desvío en USD/bps y persistir resultados en una
cadena de checkpoints vinculada al hash de política y catálogo.

La importación es idempotente y administrativa. No se implementan pagos,
auto-recarga, conectores privados de billing ni órdenes reales.

## Consecuencias

El cálculo es reproducible y detecta divergencias, pero el digest local no prueba
autoría. Para producción financiera se requiere verificación de firma/origen,
fuente FX independiente y almacenamiento WORM.
