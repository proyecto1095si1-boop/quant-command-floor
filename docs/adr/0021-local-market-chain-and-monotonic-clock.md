# ADR 0021: cadena diaria local y reloj monotónico

- Estado: aceptada
- Fecha: 2026-10-21

## Contexto

T29 hasheaba la evidencia ya seleccionada, pero no protegía la cadena de custodia
desde la ingesta. Un registro podía modificarse antes de convertirse en anchor o
cierre. Además, un salto del reloj civil podía alterar ventanas point-in-time.

## Decisión

Sellar cada evento nuevo de mercado con payload hash y cadena SHA-256 por stream
y día UTC. Excluir datos no sellados del Outcome Oracle, restaurar heads tras
recovery y fallar cerrado ante rupturas. Comparar reloj civil con contador
monotónico y detener ingesta ante regresión o drift excesivo.

No generar claves privadas locales ni llamar “firma” a un hash. El anclaje WORM
y la firma KMS/HSM quedan como control externo pendiente.

## Consecuencias

La manipulación parcial y anomalías temporales son detectables dentro de las
particiones disponibles. Los datos legacy dejan de servir como evidencia, aunque
pueden seguir alimentando recuperación paper. El borrado de una partición entera
y un host totalmente comprometido siguen fuera de la garantía local.
