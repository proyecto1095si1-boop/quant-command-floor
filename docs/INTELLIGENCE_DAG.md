# Intelligence DAG point-in-time

El DAG convierte datos externos read-only en evidencia consumible por las mesas
sin permitir que una API dispare una orden. Su salida es un snapshot inmutable,
hasheado y `paperOnly` que alimenta al empleado `Intel Hub`.

## Grafo y empleados

| Nodo | Proveedores | Empleado | Método matemático |
|---|---|---|---|
| `news` | Finnhub + FMP | Noticias / Sentimiento | diccionario bipolar, promedio ponderado y decaimiento exponencial con semivida de 24 h |
| `macro` | FRED `CPIAUCSL` | Macro | cambio relativo, volatilidad realizada y compresión `-tanh(z/3)` |
| `market` | Polygon agregados | Técnico externo | log-return acumulado dividido por volatilidad realizada y `tanh(x/2)` |
| `consensus` | los tres nodos | Intel Hub | media por `peso × confianza`, cobertura y penalización `exp(-2 × dispersión)` |

Pesos iniciales: macro 0,25; noticias 0,35; mercado 0,40. Son parámetros de
modelo, no hechos económicos; deben calibrarse walk-forward antes de promover
su uso. Se requieren al menos dos familias activas. Con menos fuentes la salida
queda `blocked`, con señal y confianza cero.

## Causalidad y procedencia

- Una fila solo es elegible si `observedAt <= asOf` y `receivedAt <= asOf`.
- Noticias vencen a los 3 días, mercado a los 35 y macro a los 400.
- Un snapshot deja de ser consumible por la mesa después de 6 horas.
- Cada respuesta conserva proveedor, operación, cantidad, error y SHA-256.
- El snapshot completo tiene SHA-256 y se registra en
  `intelligence.<ASSET>`.
- Al arrancar se relee cada stream, se verifican hash, activo, versión,
  causalidad y secuencia monotónica antes de restaurar el último snapshot.
- La recuperación es atómica: una historia inválida nunca reemplaza un estado
  previamente verificado.
- El pipeline conserva hash, estado y confianza en su etapa de intake.
- `Intel Hub` participa del consenso de mesa solo cuando el snapshot está
  `ready`; en otro caso permanece con confianza cero.

## Operación

`POST /v1/intelligence/dag/refresh` genera un snapshot para un activo. Este
endpoint consume cuotas externas y requiere el mismo RBAC de escritura del
gateway. `GET /v1/intelligence/dag/status` no revela datos ni credenciales.

El DAG no programa refrescos, no retiene secretos y no contiene conectores de
órdenes. Antes de capital real hacen falta validación de licencias, catálogo de
símbolos, calendario macro vintage, NLP calibrado, almacenamiento WORM y
revisión independiente del riesgo de modelo.
