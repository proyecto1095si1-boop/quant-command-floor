# ADR 0008: stress testing avanzado como diagnóstico

- Estado: aceptada
- Fecha: 2026-10-20

## Contexto

VaR, EVT y backtesting describen distribuciones estimadas, pero no representan
por sí solos venues inaccesibles, evaporación de profundidad, depeg ni
correlaciones que convergen durante crisis. Al mismo tiempo, las calibraciones
actuales todavía no tienen gobierno suficiente para detener ejecución.

## Decisión

Agregar un motor determinista y versionado que combine shocks factoriales y por
activo, impacto de raíz cuadrada, spread, contraparte, dependencia adversa PSD,
ridge factorial y reverse stress. Los faltantes de liquidez aplican haircuts
visibles. Las corridas quedan anexadas al plan, auditadas y disponibles por API
con rol `risk`.

Mantener todos los resultados como diagnóstico. No crear un veto nuevo hasta
que el propietario apruebe fuentes, calibración, límites y respuesta operativa.

## Consecuencias

- Una misma versión, plan e inputs produce el mismo hash y resultado económico.
- La cartera ya no puede interpretar datos ausentes como salida gratuita.
- Los escenarios históricos son proxies internos, no replay exacto ni
  predicción, y requieren validación independiente.
- Un hash local detecta divergencias, pero no sustituye firma externa o WORM.
- No se agregan dependencias, conectores privados ni ejecución real.
