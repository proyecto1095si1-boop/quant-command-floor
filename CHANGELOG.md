# Changelog

Todos los cambios relevantes del proyecto se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el
proyecto usa [versionado semántico](https://semver.org/lang/es/).

## [Sin publicar]

### Cambiado

- Portfolio Desk estima covarianza con shrinkage OAS y proyección PSD, calcula
  VaR Euler por activo y factor, y Risk Gate limita exposición factorial.
- Cada fill paper genera postings de doble entrada encadenados con SHA-256; los
  checkpoints y la recuperación fallan si divergen fills, journal o saldos.
- Ledger, fills L2 y métricas de ejecución usan contabilidad decimal fija de
  ocho posiciones; checkpoints conservan átomos exactos y cada snapshot expone
  el balance del invariante de equity.
- Risk Gate proyecta exposición neta firmada y exposición bruta posterior a la
  orden. Las ventas ya no se consideran siempre aumento de riesgo y los cierres
  `reduceOnly` válidos pueden reducir posiciones durante un halt.
- El WebSocket de eventos valida origen, rate limit y autenticación en
  producción; el Kill Switch principal detiene el pipeline backend y los
  controles halt/resume quedan auditados y recuperables tras reinicios.
- El gateway convierte rechazos asíncronos no manejados en respuestas HTTP
  controladas sin exponer detalles internos fuera de desarrollo.
- CI fija explícitamente Ubuntu 24.04 para evitar cambios no controlados cuando
  GitHub migra la etiqueta móvil `ubuntu-latest`.
- La cobertura mínima de líneas del servidor sube de 80 % a 84 %, respaldada
  por pruebas de los clientes HTTP directo/proxy y del conector público Kraken.
- Las herramientas de desarrollo ahora requieren una línea soportada de Node.js
  (`^20.19.0`, `^22.13.0` o `>=24`) y CI verifica las tres líneas.
- ESLint, c8, jsdom y el runtime de GitHub Actions fueron actualizados sin
  agregar dependencias de runtime.
- Riesgo e investigación anualizan retornos diarios cripto con 365 períodos en
  lugar de 252; riesgo, investigación, cartera y régimen comparten ahora una
  configuración sobrescribible.

### Añadido

- Motor paper de stress sistémico con catálogo versionado, shocks factoriales,
  costo de liquidación, dependencia adversa PSD, ridge factorial, reverse
  stress, capital buffer y API auditada.
- Riesgo de cola de cartera con Filtered Historical Simulation, EVT/POT,
  Expected Shortfall, backtests de Kupiec y Christoffersen y semáforo binomial
  de calidad del modelo.
- Lockfile de npm para instalaciones reproducibles en desarrollo y CI.
- Reglas editoriales compartidas mediante `.editorconfig`.
- Registro de decisiones del proyecto que requieren definición del propietario.

