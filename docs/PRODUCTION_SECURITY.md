# Production security

## Fail closed

Con `NODE_ENV=production`, el gateway no inicia si `AUTH_SECRET` falta o tiene menos de 32 caracteres. En desarrollo, la ausencia de Authorization crea una identidad local `admin` para conservar el flujo de trabajo; esta excepción no existe en producción.

## Autenticación y RBAC

Los tokens son payloads JSON firmados con HMAC-SHA256, expiración obligatoria y comparación constant-time. Se envían como `Authorization: Bearer <token>`.

Roles jerárquicos:

- `viewer`: endpoints GET.
- `operator`: análisis, pipeline, planes y ejecución paper.
- `risk`: veto, reapertura y previews de riesgo.
- `admin`: promociones y operaciones SRE.

Las credenciales no deben generarse ni almacenarse en el navegador. Un servicio de identidad interno debe emitir tokens de corta vida y custodiar `AUTH_SECRET` en un secret manager.

## Cuatro ojos

Con `REQUIRE_FOUR_EYES=true`, promover research, encolar ejecución y reabrir un halt requieren `X-Approver` y `X-Second-Approver`, ambos presentes y distintos. En producción estos nombres deben proceder de identidades verificadas por el proxy, no de texto ingresado por el cliente.

## Defensa HTTP

- Rate limit local de 120 requests/minuto por IP.
- CORS allowlist.
- Payload máximo de 256 KiB.
- `X-Content-Type-Options: nosniff`.
- `X-Frame-Options: DENY` y `frame-ancestors 'none'`.
- CSP API `default-src 'none'`.
- Referrer y permisos de cámara, micrófono y geolocalización desactivados.

Para múltiples réplicas, el rate limit debe migrar a un store distribuido o API gateway. TLS/HSTS debe terminar en el proxy de producción.

## CI y despliegue

GitHub Actions ejecuta todas las pruebas, syntax checks y un smoke test fail-closed en Node 20. Antes de desplegar dinero real todavía se requieren SAST/dependency scanning, imágenes firmadas, SBOM, despliegue privado, rotación de secretos, backups externos probados y límites configurados directamente en el broker.
