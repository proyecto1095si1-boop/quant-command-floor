> **Retirado del alcance activo en R4. Recuperable en el tag `pre-recorte`.**
>
> ADR histórico; ya no describe módulos cargados por el runtime.

# ADR 0017: e-process para monitoreo secuencial

- Estado: aceptada
- Fecha: 2026-10-21

## Contexto

Un test Diebold–Mariano recalculado después de cada observación deja de conservar
su nivel nominal. Los experimentos canary necesitan rollback temprano sin
convertir cada consulta del dashboard en una nueva oportunidad de falso positivo.

## Decisión

Comparar log-loss pareado mediante un e-process de apuesta fija y pérdida
acotada. Usar la desigualdad de Ville para el umbral always-valid, muestra mínima
operativa y e-processes por régimen con corrección Bonferroni. Mantener
Diebold–Mariano/Newey–West únicamente como diagnóstico.

## Consecuencias

- El operador puede consultar evidencia continuamente sin corrección por número
  de consultas bajo los supuestos del proceso.
- La apuesta fija puede detectar lentamente degradaciones pequeñas.
- El clipping introduce una decisión de modelo y debe conservarse en auditoría.
- Un breach solo revierte tráfico paper; no promueve ni ejecuta órdenes reales.

