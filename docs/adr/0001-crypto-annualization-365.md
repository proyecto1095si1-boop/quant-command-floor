# ADR-0001: anualización cripto con 365 días

- **Estado:** aceptada
- **Fecha:** 2026-10-20

## Contexto

Riesgo e investigación anualizaban retornos diarios con 252 ruedas, mientras
cartera y régimen utilizaban 365 días o 8.760 horas. Esa mezcla hacía que
volatilidad, Sharpe, sizing y diagnósticos no fueran comparables dentro de un
mercado que opera todos los días.

## Decisión

Centralizar los valores predeterminados en
`server/config/annualization.js`:

- retornos diarios: 365 períodos por año;
- retornos horarios: `365 × 24 = 8.760` períodos por año.

Riesgo, investigación, cartera y régimen deben consumir esta configuración.
Las funciones mantienen un parámetro sobrescribible para datasets con otra
frecuencia y los reportes relevantes exponen `annualizationPeriods`.

## Consecuencias

- Volatilidad y Sharpe diarios aumentan por `√(365/252) ≈ 1,2036` frente al
  valor histórico basado en ruedas bursátiles.
- Los umbrales calibrados con 252 deben revisarse; no se convierten de forma
  silenciosa.
- Una prueba transversal exige el mismo factor de escala en riesgo,
  investigación y cartera.
- Los valores 252 usados como límite de combinaciones PBO no representan
  anualización y permanecen sin cambios.
