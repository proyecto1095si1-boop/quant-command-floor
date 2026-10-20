# Registro de riesgos

Este registro describe el estado del sistema **paper-only**. Ningún riesgo
marcado como bloqueante para capital real puede cerrarse por inferencia: exige
implementación, evidencia y aprobación formal del propietario y de seguridad.

| ID | Riesgo | Impacto | Mitigación actual o requerida | Estado |
|---|---|---|---|---|
| R-001 | Un proveedor autenticado —LLM, noticias, macro, sentimiento, on-chain o RPC— recibe secretos desde el navegador o desde configuración no administrada. | Alto: exposición de credenciales, abuso del proveedor y datos no confiables. | Construir un backend aislado con allowlist, egress controlado, timeouts, circuit breaker, secret manager y credenciales de corta vida. La UI solo debe hablar con el gateway. | **Abierto · fuera del alcance actual.** Los feeds Coinbase/Kraken actuales son públicos y read-only. |
| R-002 | Código producido por Code Generator se ejecuta sin aislamiento. | Crítico: ejecución arbitraria, exfiltración, corrupción de datos o evasión del Risk Gate. | Sandbox sin red por defecto, filesystem efímero, CPU/memoria/tiempo limitados, análisis estático, artefactos firmados y aprobación humana. Hasta entonces, conservar el resultado únicamente como texto no ejecutable. | **Abierto · bloqueante para ejecutar código generado.** |
| R-003 | Identidades declaradas por texto, secretos locales o privilegios de desarrollo se usan como controles de producción. | Crítico: suplantación, aprobación de una sola persona y acceso administrativo indebido. | IdP externo con MFA, tokens cortos, RBAC verificado en proxy, cuatro ojos vinculados a identidades distintas, secret manager y rotación. | **Abierto · bloqueante para producción controlada.** |
| R-004 | Se asigna capital real sin revisión formal de seguridad y arquitectura de ejecución independiente. | Crítico: pérdida financiera, órdenes no autorizadas y recuperación incompleta. | Mantener `PAPER_ONLY`, no implementar rutas live ni claves de exchange; completar threat model, SAST, dependency/secret scanning, pentest, DR, reconciliación externa y límites en broker antes de una decisión separada. | **Abierto · bloqueante para capital real.** |
| R-005 | Caída, divergencia o datos obsoletos de Coinbase/Kraken inducen señales incorrectas. | Alto: decisiones paper y métricas de riesgo basadas en mercado inválido. | Calidad multi-fuente, freshness, gap/outlier detection, divergencia máxima, estado degradado y veto del Risk Gate. | **Mitigado parcialmente · monitoreo continuo.** |
| R-006 | La latencia paper no reproduce selección adversa ni el libro futuro observado después del retardo. | Medio: backtests o simulaciones pueden sobreestimar la calidad del fill. | Registrar `latencyMs`, aplicar slippage/impact cuando no existe L2 y exigir un modelo event-driven antes de calibración operativa. | **Aceptado para simulación paper; abierto para mayor fidelidad.** |
| R-007 | La cobertura de líneas cae por debajo del margen actual sobre 80 %. | Medio: CI bloqueado o código nuevo insuficientemente probado. | Umbral c8 obligatorio sobre `server/**/*.js`, incluido código no ejecutado mediante `--all`; agregar tests con cada cambio. | **Controlado por CI.** |
| R-008 | El repositorio carece de licencia explícita. | Medio: incertidumbre sobre uso, modificación y distribución. | El propietario debe elegir MIT, Apache-2.0 o una licencia propietaria según `DECISIONES_PENDIENTES.md`. | **Pendiente de decisión del propietario.** |

## Condición de frontera

Coinbase y Kraken solo aportan datos públicos de mercado. No son conectores de
trading. El repositorio no contiene una ruta autorizada para enviar órdenes
reales, credenciales de exchange ni permisos de retiro.
