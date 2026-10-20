# Changelog

Todos los cambios relevantes del proyecto se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el
proyecto usa [versionado semántico](https://semver.org/lang/es/).

## [Sin publicar]

### Cambiado

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

