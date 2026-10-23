# Intelligence DAG cripto

El DAG construye snapshots point-in-time para BTC, ETH, SOL y BNB con fuentes
read-only. Cada snapshot conserva hash, procedencia, timestamps de observación y
recepción, cantidad de registros y errores normalizados.

| Nodo     | Fuente                                | Método                                                                                                                     |
| -------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `news`   | Finnhub `crypto`                      | relevancia por activo, deduplicación, léxico con negaciones, decaimiento exponencial de 24 h y penalización por desacuerdo |
| `macro`  | FRED                                  | cambio relativo dividido por volatilidad realizada y transformación `tanh`                                                 |
| `market` | sin proveedor externo en este alcance | queda sin observaciones y no contribuye al consenso                                                                        |

El consenso requiere dos nodos con observaciones y confianza positiva. Con
Finnhub y FRED saludables puede quedar `ready`; si una fuente falla queda
`blocked`, señal y confianza se fijan en cero y el desk no recibe inteligencia
externa accionable.

Los snapshots persistidos antes del recorte que contengan proveedores retirados
no superan la validación actual. Permanecen recuperables en el tag
`pre-recorte`; el runtime falla cerrado ante esa incompatibilidad deliberada.

La salida del DAG entra al agente `Intel Hub` del desk, pero nunca evita el Risk
Gate ni modifica la restricción `PAPER_ONLY`.

La definición completa del nodo está en `CRYPTO_NEWS_SIGNAL.md`. Tanto el DAG
como la API read-only usan la misma implementación matemática.
