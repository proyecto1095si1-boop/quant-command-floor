> **Retirado del alcance activo en R4. Recuperable en el tag `pre-recorte`.**
>
> ADR histórico; ya no describe módulos cargados por el runtime.

# ADR 0020: derivar outcomes desde evidencia point-in-time multifonte

- Estado: aceptada
- Fecha: 2026-10-21

## Contexto

T28 impuso orden temporal, pero el endpoint todavía aceptaba el valor binario
de un administrador. Un actor podía etiquetar correctamente en el tiempo y aun
así elegir el resultado o usar un precio revisado fuera de la ventana.

## Decisión

Eliminar outcomes manuales del flujo secuencial. Sellar un anchor multifonte al
registrar cada forecast y derivar el outcome del retorno mediano al horizonte.
Exigir dos fuentes, ventanas point-in-time, demora de finalidad, tolerancias de
staleness/reloj/divergencia y artefactos hasheados verificables en recovery.
Fijar símbolo, horizonte y threshold con el primer forecast del experimento.

Una corrección vuelve a consultar las mismas fuente, símbolo, horizonte y regla;
no puede cambiar el target. Se conserva como nueva revisión T28.

## Consecuencias

La etiqueta pasa a ser reproducible y no queda a elección del cliente. Si una
fuente falta o discrepa, el forecast permanece pendiente y luego puede censurarse
explícitamente. Aumenta la dependencia de retención, sincronización temporal y
calidad multifonte. Los hashes locales y tickers públicos siguen siendo
insuficientes como evidencia externa para capital real.
