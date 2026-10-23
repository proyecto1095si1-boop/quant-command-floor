# Informe de recorte

## R0 · Línea base

Fecha UTC: 2026-10-23.

### Punto de recuperación

- Tag anotado: `pre-recorte`.
- Commit protegido: `fe4692c6c5b6b1dda460709e89fad440480ba143`.
- Tag publicado en `origin`; no se reescribió historial ni se usó force push.

### Verificación funcional

El comando obligatorio de línea base fue:

```text
npm ci && npm test && npm run lint && npm run format:check && npm run coverage
```

Resultado:

```text
npm ci: added 157 packages
npm test: exit 0
npm run lint: exit 0
npm run format:check: All matched files use Prettier code style!
npm run coverage: exit 0
```

### Tests

El proyecto todavía usa scripts ejecutables independientes, no el runner
`node:test`. Para que la futura comparación R5 sea inequívoca se guardan tres
medidas:

| Medida | Línea base |
|---|---:|
| Archivos invocados por `pretest` + `test` | 60 |
| Archivos `.test.js` existentes | 71 |
| Llamadas estáticas a assertions reconocidas | 1.279 |

La diferencia de 11 archivos demuestra el riesgo que R5 pretende corregir: un
archivo nuevo puede existir y no ser ejecutado por las cadenas manuales.

### Cobertura de `server/`

| Métrica | Cubierto | Total | Porcentaje |
|---|---:|---:|---:|
| Líneas | 17.302 | 18.905 | 91,52 % |
| Statements | 17.302 | 18.905 | 91,52 % |
| Funciones | 671 | 728 | 92,17 % |
| Branches | 4.106 | 5.252 | 78,17 % |

El umbral obligatorio de líneas es 84 %; la línea base lo supera por 7,52
puntos porcentuales.

### Tamaño antes del recorte

Las líneas se calcularon sobre todos los archivos regulares de cada directorio;
los bytes corresponden a `du -sb`.

| Directorio | Archivos | Líneas | Bytes |
|---|---:|---:|---:|
| `server/` | 78 | 18.905 | 602.689 |
| `tests/` | 74 | 8.811 | 271.951 |
| `docs/` | 81 | 4.297 | 207.910 |
| **Total** | **233** | **32.013** | **1.082.550** |

### Estado de R0

Cumplido. Este documento todavía no contiene la clasificación módulo por
módulo solicitada en R2; esa inspección pertenece a una tarea y PR separados.
No se eliminó ni archivó ningún archivo.
