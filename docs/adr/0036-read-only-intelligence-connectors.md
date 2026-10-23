# ADR 0036: conectores de inteligencia read-only

- Estado: reemplazada por ADR 0042
- Fecha: 2026-10-22

## Contexto

Intel & Data necesita noticias, macro, fundamentales y barras de activos. Usar
URLs configurables desde el cliente o entregar claves al navegador ampliaría la
superficie de SSRF y filtración de secretos.

## Decisión

Implementar adaptadores backend separados para Finnhub, FRED, FMP y Polygon con
hosts y operaciones fijas, validación de parámetros, rate limit, timeout, retry
y respuestas normalizadas. Las credenciales solo se leen desde entorno.

## Consecuencias

El sistema puede consultar datos read-only sin convertirse en proxy genérico.
Las claves, planes contratados, licencias y calibración de calidad siguen siendo
responsabilidad operacional y no autorizan trading real.
