# Dashboard, métricas y trazabilidad

El dashboard se calcula desde runs persistidos y el estado vivo del Data Plane y pipeline. No depende de métricas inventadas en el navegador.

## Rendimiento

- Equity, efectivo y exposición bruta.
- Retorno entre el primer y último punto disponible.
- Drawdown actual y máximo mediante high-water mark.
- Fees y fills por activo.
- Curva de equity enlazada a `runId`.

## Riesgo

Los retornos de equity alimentan VaR histórico 95% y CVaR/Expected Shortfall 95%. La matriz usa correlación de Pearson sobre retornos horarios alineados por longitud para BTC, ETH, SOL y BNB.

Estas métricas requieren suficiente historia. Con pocas observaciones se muestran en cero en lugar de extrapolar falsa precisión.

## Sistema

- Latencia p50, p95 y p99 de proveedores disponibles.
- Frescura, error rate, divergencia y calidad del Data Plane.
- Inventario y tamaño de almacenamiento.
- Integridad de auditoría SHA-256.
- Estado del pipeline y halt global.

## Alertas

Se generan alertas por pipeline detenido, Data Plane degradado, divergencia de precios, errores del proveedor, calidad degradada, almacenamiento elevado o auditoría inválida. Las críticas se muestran separadas de advertencias.

## Trazabilidad

Cada fila permite inspeccionar activo, decisión, Signal Hub, Risk Gate y secuencia completa de etapas. La exportación CSV conserva runs, señales, confianza, decisión de riesgo y datos del fill paper.

Endpoints:

- `GET /v1/dashboard/overview`
- `GET /v1/dashboard/runs?asset=BTC&status=completed&limit=100`
- `GET /v1/dashboard/export.csv`
