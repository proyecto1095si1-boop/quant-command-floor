# Alcance del producto

## Producto activo

Quant Command Floor es, en esta etapa, un sistema de **paper trading de
criptomonedas**. El alcance queda limitado a:

- universo negociable: BTC, ETH, SOL y BNB;
- micro-operaciones simuladas;
- noticias relacionadas con criptoactivos;
- análisis de copy trading;
- controles, auditoría e infraestructura necesarios para que ese camino sea
  seguro y reproducible.

`PAPER_ONLY` es una restricción permanente de esta etapa. No se permiten
órdenes reales, conectores de ejecución real, claves de trading ni rutas que
puedan mover fondos.

## Fuera de alcance

Quedan prohibidos en configuración y código nuevos:

- acciones y CEDEARs;
- ETFs e índices bursátiles;
- forex;
- estrategias de DeFi yield;
- nuevos ADRs o módulos de gobernanza, salvo que sean imprescindibles para
  corregir un fallo de seguridad o un error que afecte dinero o contabilidad.

Los conectores o módulos existentes que incumplan este límite se documentarán
en `INFORME_RECORTE.md`. No se eliminarán hasta que el informe de R2 reciba
aprobación humana explícita. Todo retiro deberá ser recuperable desde el tag
`pre-recorte`.

## Gobernanza congelada

La gobernanza que forme parte del camino real de decisión puede mantenerse,
pero queda **congelada**: solo admite correcciones de seguridad, integridad
monetaria o defectos. No se amplía y no se retira sin la revisión de R2 y la
aprobación humana requerida para R4.

El camino real que debe preservarse es:

`datos → mesas cripto → consenso → risk gate → ejecución paper → auditoría`

## Regla verificable

`tests/scope.test.js` revisa el universo operativo, proveedores y categorías
configurados. Mientras exista una desviación, termina con error y enumera cada
incumplimiento. R1 solo instala el control: la remediación corresponde a R3 o
R4 según la clasificación aprobada.
