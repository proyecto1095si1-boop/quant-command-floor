# Changelog

Todos los cambios relevantes del proyecto se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el
proyecto usa [versionado semántico](https://semver.org/lang/es/).

## [Sin publicar]

### Cambiado

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

- Lockfile de npm para instalaciones reproducibles en desarrollo y CI.
- Reglas editoriales compartidas mediante `.editorconfig`.
- Registro de decisiones del proyecto que requieren definición del propietario.

