# Contribuir

## Alcance congelado

Todo cambio debe respetar `docs/ALCANCE.md`. El producto está limitado a paper
trading cripto para BTC, ETH, SOL y BNB, micro-operaciones simuladas, noticias
cripto y análisis de copy trading.

No se aceptan acciones, CEDEARs, ETFs, índices bursátiles, forex, DeFi yield,
ejecución real ni nuevos ADRs o módulos de gobernanza. La única excepción para
ampliar gobernanza es corregir un fallo de seguridad o un error que afecte
dinero o contabilidad.

Antes de proponer un cambio:

1. Ejecutá `npm ci && npm test && npm run lint && npm run format:check && npm run coverage`.
2. Conservá `PAPER_ONLY`; nunca agregues credenciales ni conectores de trading
   real.
3. Ejecutá `node tests/scope.test.js`. Cualquier incumplimiento debe quedar
   listado explícitamente.
4. No elimines módulos ni documentación sin aprobación humana. El punto de
   recuperación previo al recorte es el tag `pre-recorte`.

La gobernanza existente que intervenga en el camino real queda congelada y
solo puede recibir las correcciones excepcionales definidas arriba.
