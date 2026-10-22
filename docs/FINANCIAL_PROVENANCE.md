# Procedencia financiera de costos IA

T44 agrega tres controles independientes a la conciliación paper de facturas:

1. firma Ed25519 del documento normalizado por un emisor allowlisted;
2. tipo de cambio contrastado con al menos dos fuentes independientes;
3. aprobación contable dual cuando `REQUIRE_FOUR_EYES=true`.

Ninguno realiza pagos, recargas ni operaciones financieras reales.

## Firma de factura

El emisor firma los 32 bytes del hash SHA-256 de la factura normalizada:

```text
invoiceHash = SHA256(canonical(normalize(invoice)))
signature = Ed25519.sign(bytes.fromHex(invoiceHash))
```

`INVOICE_TRUSTED_ISSUERS` contiene un JSON `issuerId -> public key PEM`. No se
guardan claves privadas. Por defecto, el servidor exige firma; puede desactivarse
solo explícitamente con `INVOICE_REQUIRE_SIGNATURE=false` para migración paper.

## Oracle FX

Para monedas distintas de USD se aceptan únicamente fuentes en
`FX_TRUSTED_SOURCES`. Cada observación debe ser única, positiva, reciente y no
estar adelantada más que el skew permitido.

La tasa de consenso es la mediana (promedio central con redondeo exacto para una
muestra par). Se calculan:

```text
sourceDivergenceBps = 10000 × (max(rate) - min(rate)) / median(rate)
invoiceDeviationBps = 10000 × (invoiceRate - median(rate)) / median(rate)
```

La importación falla si faltan fuentes, si divergen más de
`FX_MAX_DIVERGENCE_BPS` o si la tasa declarada se aparta más de
`FX_INVOICE_TOLERANCE_BPS`. USD exige tasa exactamente 1.

## Aprobación y recuperación

Con cuatro ojos activo, los encabezados `X-Approver` y `X-Second-Approver`
deben identificar personas distintas. Emisor, firma, hash de factura, evidencia
FX, importador y aprobadores quedan dentro del checkpoint encadenado. Recovery
revalida firma, cálculo, catálogo y hashes antes de habilitar nuevas importaciones.

## Límites

Una clave allowlisted puede estar comprometida y una allowlist de nombres de
fuentes no autentica por sí sola el transporte de FX. Antes de uso contable real
se requieren identidad federada/MFA, rotación o revocación de claves, conectores
autenticados de solo lectura, timestamp externo y anclaje WORM.
