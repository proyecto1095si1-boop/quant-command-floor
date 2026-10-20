# ADR 0009: champion/challenger y drift de modelos

- Estado: aceptada
- Fecha: 2026-10-20

## Contexto

Los parámetros de riesgo y de IA pueden degradarse por cambio de distribución,
ser modificados sin trazabilidad o promoverse usando evidencia insuficiente.
Guardar una configuración no demuestra que sea mejor que la vigente.

## Decisión

Registrar cada configuración inmutable como challenger, calcular PSI, KS y
mean shift sobre muestras explícitas, exigir 250 observaciones, cobertura,
independencia y cero fallos críticos, y comparar el score con el champion. Solo
dos aprobadores distintos pueden promover; la versión anterior se retira sin
borrarse. Parámetros de IA tienen límites explícitos y nunca contienen secretos.

## Consecuencias

- Configuraciones y datasets quedan identificados mediante SHA-256 canónico.
- Drift o evidencia insuficiente bloquean promoción, pero no detienen ejecución
  existente automáticamente.
- El score sigue siendo una entrada gobernada; su definición y fuente deben
  documentarse por modelo.
- La identidad fuerte sigue bloqueada hasta incorporar IdP/MFA y proxy firmado.
- No se ejecuta código generado ni se agregan dependencias o trading real.
