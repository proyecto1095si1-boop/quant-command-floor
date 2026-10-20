# ADR 0006: covarianza robusta y descomposición de riesgo

- Estado: aceptada
- Fecha: 2026-10-20

## Contexto

La covarianza muestral directa es ruidosa con pocas observaciones, puede ser
singular con activos correlacionados y hace inestable la optimización. El método
llamado risk parity solo aplicaba inverse-vol, ignorando covarianzas. El plan no
explicaba qué activo o factor originaba el VaR.

## Decisión

Estimar una matriz OAS contra el target isotrópico `tr(S)/N·I`, acotar la
intensidad de shrinkage a `[0,1]` y proyectar el resultado al cono PSD mediante
Jacobi y clipping de autovalores. Usar esa misma matriz en:

- equal risk contribution long-only con topes;
- media-varianza por projected gradient;
- volatilidad y diversification ratio;
- VaR paramétrico, Marginal VaR y Component VaR por Euler;
- concentración HHI por factores declarados.

Risk Gate incorpora un límite pre-trade de 45% del equity por factor. Permite
reducciones monotónicas para no impedir desarriesgar una concentración ya
existente.

## Consecuencias

- La varianza calculada no puede ser negativa por una matriz indefinida.
- La suma de Component VaR reproduce el VaR total y permite atribución por
  agente/activo.
- OAS reduce error de estimación, pero no convierte retornos cripto en normales
  ni predice saltos. VaR paramétrico es un diagnóstico, no garantía de pérdida
  máxima.
- Factores declarados son una taxonomía inicial que requiere calibración y
  gobierno antes de capital real.
- No se agregan dependencias ni rutas de ejecución real; todo continúa paper.
