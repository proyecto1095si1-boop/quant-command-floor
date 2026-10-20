# ADR 0007: riesgo de cola y backtesting de excepciones

- Estado: aceptada
- Fecha: 2026-10-20

## Contexto

El VaR gaussiano de cartera atribuye riesgo de forma útil, pero la asimetría,
los saltos y las colas gruesas de retornos cripto violan su supuesto central.
Una cifra sin validación fuera de muestra tampoco permite distinguir un modelo
calibrado de uno que subestima pérdidas.

## Decisión

Conservar el VaR gaussiano para atribución Euler y agregar dos estimadores de
cola al plan paper:

1. FHS con volatilidad EWMA `λ=0.94`, residuos estandarizados y reescalado por
   la volatilidad condicional siguiente.
2. Peaks Over Threshold sobre el percentil 90, con Generalized Pareto ajustada
   por momentos y un mínimo de 10 excesos. El shape queda acotado por debajo de
   uno para que Expected Shortfall exista; se publican valor crudo y acotado.

Ambos calculan VaR y Expected Shortfall al 99%. El agregado conservador elige
el mayor Expected Shortfall, pero preserva ambos resultados. FHS se valida con
una ventana móvil de 100 observaciones: Kupiec mide cobertura incondicional,
Christoffersen independencia y su suma cobertura condicional. Un semáforo usa
cuantiles binomiales 95% y 99,99%, equivalentes a las zonas Basel clásicas.

## Consecuencias

- Las estimaciones reflejan heterocedasticidad y cola empírica sin agregar
  dependencias de runtime.
- Cada pronóstico del backtest usa solamente historia anterior, evitando
  look-ahead.
- EVT por momentos es sensible al umbral y a muestras pequeñas; los parámetros
  y la disponibilidad se exponen para auditoría en vez de ocultar el fallo.
- Los tests son diagnósticos y no vetan órdenes en T16. Activar un veto exige
  decisión de gobierno, muestra representativa y política de respuesta.
- No se añaden rutas de órdenes ni conectores reales; continúa `PAPER_ONLY`.
