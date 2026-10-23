# ADR 0042: inteligencia limitada a cripto

## Estado

Aceptado. Reemplaza ADR 0036 y ADR 0041.

## Contexto

El producto se congeló como paper trading de BTC, ETH, SOL y BNB, con
micro-operaciones, noticias cripto y análisis de copy trading. Los adaptadores
multiactivo ampliaban superficie operacional y mantenían fuentes de acciones,
ETFs y forex que no pertenecen a ese producto.

## Decisión

- Mantener Finnhub exclusivamente para noticias de categoría `crypto`.
- Mantener FRED como contexto macro read-only.
- Retirar Yahoo Finance, Polygon y Financial Modeling Prep del runtime, entorno,
  UI, API interna y pruebas.
- Conservar el nodo técnico externo con cero observaciones hasta que exista una
  fuente cripto aprobada dentro del alcance; nunca fabricar un dato sustituto.
- Rechazar durante recovery snapshots que declaren proveedores retirados.
- Mantener `PAPER_ONLY`; ningún conector de inteligencia puede ejecutar órdenes.

## Consecuencias

El DAG tiene dos fuentes externas admitidas y requiere ambas para que su
consenso quede listo. Una caída bloquea la contribución del Intel Hub. Se pierde
redundancia externa de velas, pero los datos de mercado internos de Coinbase y
Kraken continúan alimentando las mesas y controles paper.

El código retirado sigue recuperable desde el tag `pre-recorte`. Cualquier nueva
fuente exige estar limitada a BTC, ETH, SOL y BNB y respetar el congelamiento de
alcance.
