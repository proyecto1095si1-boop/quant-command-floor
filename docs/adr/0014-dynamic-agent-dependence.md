# ADR 0014: dependencia EWMA con shrinkage y fallback

- Estado: aceptada
- Fecha: 2026-10-21

## Contexto

Una matriz estática evita parte del doble conteo, pero las relaciones entre
Technical, Volume, Whale y Liquidity cambian con activo y régimen. Estimar una
matriz corta sin regularización puede producir valores extremos o singulares.

## Decisión

Estimar media y covarianza EWMA online, contraer la correlación hacia identidad,
aumentar shrinkage hasta controlar el condition number y usar la matriz dinámica
solo después del warm-up. Ante cambio estructural o estado inválido, volver a la
matriz estática. Persistir el estado con hash y restaurarlo fail-closed.

## Consecuencias

- El consenso se adapta sin usar la ronda actual para decidir esa misma ronda.
- Una muestra escasa o inestable nunca reemplaza el fallback conocido.
- Se agrega estado durable que debe mantenerse compatible y verificable.
- λ, shrinkage y umbrales requieren backtest rolling por activo/horizonte.
