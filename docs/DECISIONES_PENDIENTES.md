# Decisiones pendientes

Este documento registra decisiones que requieren una definición explícita del
propietario del repositorio. No se adoptan valores por omisión.

## Licencia del repositorio

- **Estado:** pendiente de decisión del propietario.
- **Opciones solicitadas:** MIT, Apache-2.0 o propietaria.
- **Acción bloqueada:** crear el archivo `LICENSE` y declarar la licencia en la
  documentación o en los metadatos del paquete.
- **Implicación actual:** mientras no exista una licencia, no se concede de forma
  explícita permiso para usar, modificar o redistribuir el código.
- **Decisión necesaria:** seleccionar una de las opciones y, si la licencia es
  propietaria, proporcionar el texto legal aprobado.

## Gobierno de límites de stress

- **Estado:** pendiente de calibración y aprobación del propietario/riesgo.
- **Decisión necesaria:** seleccionar fuentes, ventanas, escenarios vinculantes,
  pérdida máxima, completeness mínima y respuesta a un breach.
- **Acción bloqueada:** convertir el diagnóstico T17 en veto automático del
  Risk Gate o autorización de ejecución.
- **Implicación actual:** los escenarios se calculan, persisten y muestran, pero
  no cambian la decisión pre-trade.

## Métrica primaria por modelo

- **Estado:** pendiente por familia de modelo.
- **Decisión necesaria:** definir fórmula, dirección, dataset de validación,
  horizonte y tolerancia del `score` para riesgo, ejecución y cada agente IA.
- **Acción bloqueada:** promoción autónoma o recalibración automática.
- **Implicación actual:** T18 valida rango, drift y no inferioridad, pero el
  comité humano sigue siendo responsable de la semántica del score.

## Guardrails por familia de modelo

- **Estado:** pendientes de calibración.
- **Decisión necesaria:** muestra mínima, incremento de error, divergencia
  numérica, schema, grounding, política, latencia y porcentaje canary para cada
  empleado IA o motor matemático.
- **Acción bloqueada:** conectar la selección canary con ejecución o promover
  automáticamente por resultados online.

## Datasets adversariales confiables

- **Estado:** pendiente por empleado IA y jurisdicción.
- **Decisión necesaria:** propietario, fuente, licencia, idioma, frecuencia de
  actualización y revisión humana de casos/ground truth.
- **Acción bloqueada:** considerar la suite T20 evidencia suficiente para uso
  con capital real.

