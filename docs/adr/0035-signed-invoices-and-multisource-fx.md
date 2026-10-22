# ADR 0035: facturas firmadas y FX multifFuente

- Estado: aceptada para paper
- Fecha: 2026-10-22

## Contexto

Un digest local detecta cambios posteriores, pero no prueba quién emitió una
factura. Una tasa FX escrita por el mismo importador tampoco aporta independencia.

## Decisión

Exigir Ed25519 contra una allowlist de emisores y contrastar la tasa declarada
con la mediana de fuentes FX únicas, frescas y acotadas por divergencia. Mantener
la aprobación contable como control separado y enlazar toda la evidencia al
checkpoint recuperable.

## Consecuencias

La importación falla cerrada si falta cualquier evidencia requerida. El sistema
no obtiene por sí mismo facturas o FX: la autenticación de transporte, revocación
de claves y custodia WORM permanecen fuera del alcance paper.
