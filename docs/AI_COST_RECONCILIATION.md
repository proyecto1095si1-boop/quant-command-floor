# Conciliación de costos de IA

El servicio compara facturas declaradas por un operador financiero con el costo
recalculado desde tokens y un catálogo point-in-time. Es contabilidad operativa
**paper-only**: no paga facturas, no recarga saldos y no habilita trading real.

## Método matemático

Para cada línea `l`, con precios vigentes en su día:

`E_l = prompt_l × inputRate_l / 1000 + completion_l × outputRate_l / 1000`

`B_USD = (subtotal + tax) × fxRateToUsd`

`variance = B_USD - ΣE_l`

`varianceBps = 10000 × variance / ΣE_l`

Todos los importes usan enteros con ocho decimales y redondeo half-up. No se
acumulan floats monetarios. Una diferencia absoluta superior a
`LLM_INVOICE_VARIANCE_BPS` genera alerta; no se compensa con métricas de salud.

## Catálogo point-in-time

Cada tarifa identifica proveedor, modelo, inicio/fin de vigencia y precios
separados de entrada/salida. Se rechazan intervalos solapados y líneas sin una
única tarifa vigente. El hash del catálogo queda enlazado a la conciliación.

Los defaults se cargan desde `LLM_*_INPUT_COST_PER_1K`,
`LLM_*_OUTPUT_COST_PER_1K` y `LLM_*_PRICE_EFFECTIVE_FROM`. Una modificación
histórica exige conservar intervalos no solapados; no debe reescribir tarifas
ya conciliadas.

## Importación y controles

- `invoiceId` es idempotente: el mismo contenido devuelve el registro existente
  y contenido distinto con el mismo ID se rechaza.
- Período, días de consumo, tokens, moneda ISO, impuestos y FX se validan.
- El endpoint de escritura vive bajo `/v1/sre/`, exige rol admin en producción y
  respeta cuatro ojos cuando `REQUIRE_FOUR_EYES=true`.
- Cada estado completo se sella, encadena y persiste en
  `sre.ai-cost-reconciliation`; recuperación inválida queda fail-closed.
- `sourceDigest` detecta cambios del payload importado, pero no demuestra que el
  proveedor haya emitido la factura.

## Frontera de seguridad

Antes de usar la conciliación como evidencia financiera se requieren factura
firmada/verificada contra el proveedor, fuente FX independiente con timestamp,
catálogo externo WORM, identidad humana fuerte y revisión contable. La función
actual no autoriza pagos ni decisiones de inversión.
