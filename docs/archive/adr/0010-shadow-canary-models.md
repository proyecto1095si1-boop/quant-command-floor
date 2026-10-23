> **Retirado del alcance activo en R4. Recuperable en el tag `pre-recorte`.**
>
> ADR histórico; ya no describe módulos cargados por el runtime.

# ADR 0010: evaluación shadow y canary paper

- Estado: aceptada
- Fecha: 2026-10-20

## Contexto

Una evaluación offline no reproduce latencia, fallos de schema ni diferencias
de comportamiento ante los mismos inputs observados. Promover directamente un
challenger mezcla validación con despliegue y dificulta rollback.

## Decisión

Agregar experimentos pareados que referencien un champion y un challenger del
registro T18. Asignar canary mediante hash determinista, limitarlo a 25%, no
guardar contenido crudo y activar rollback local después de una muestra mínima
si se vulneran guardrails de error, seguridad, estructura, grounding o latencia.

## Consecuencias

- Champion y challenger pueden compararse sin ejecutar código arbitrario dentro
  del servicio de gobierno.
- Rollback es reproducible y no depende de intervención humana inmediata.
- El runtime solo recomienda una versión paper; no está conectado a Execution.
- Los umbrales iniciales requieren calibración por familia de modelo y los
  labels/scores siguen necesitando datasets gobernados.
- No se agregan dependencias, secretos ni rutas de trading real.
