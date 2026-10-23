> **Retirado del alcance activo en R4. Recuperable en el tag `pre-recorte`.**
>
> ADR histórico; ya no describe módulos cargados por el runtime.

# ADR 0019: separar pronósticos y labels con reloj causal

- Estado: aceptada
- Fecha: 2026-10-21

## Contexto

El endpoint secuencial anterior recibía probabilidades y outcome en la misma
operación. El productor debía prometer que la predicción había ocurrido antes
del resultado, pero el servidor no podía demostrarlo. Eso permitía leakage,
selección de outcomes y correcciones destructivas.

## Decisión

Persistir primero un pronóstico pendiente, sellado con reloj del servidor y
horizonte inmutable. Admitir el label únicamente después de la madurez y en una
operación distinta. Conservar correcciones como revisiones encadenadas por hash,
tratar la censura como estado terminal y bloquear graduación con pendientes o
censura superior al límite.

No usar IPCW sin un modelo aprobado del mecanismo de ausencia. No convertir
eventos legacy con outcome incorporado en evidencia T28.

## Consecuencias

La evidencia secuencial tiene una frontera temporal verificable y recovery
puede detectar revisiones o transiciones inválidas. A cambio, los productores
deben efectuar dos llamadas y los experimentos legacy activos deben reiniciarse.
Los defaults de horizonte, gracia y censura requieren calibración económica por
activo y tipo de señal.
