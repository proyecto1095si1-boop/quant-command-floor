# ADR 0012: procedencia firmada y calibración reproducible

- Estado: aceptada
- Fecha: 2026-10-20

## Contexto

Un hash de casos detecta cambios, pero no prueba quién revisó el dataset, de qué
fuentes provino, qué ground truth usó ni si la confianza del empleado está
calibrada. Conservar prompts para resolverlo aumentaría exposición de datos.

## Decisión

Usar un manifiesto mínimo y canónico, firmado con Ed25519 por un revisor cuya
clave pública sea ancla local. La firma vincula manifiesto, identidad, versión y
hash de casos. Incluir sus hashes en la identidad del dataset y en cada corrida.
Conservar solo hashes de fuentes, ground truth, inputs y outputs.
Medir calibración con ECE de 10 bins y Brier score, e informar intervalos Wilson
95% para proporciones.

## Consecuencias

- Alterar procedencia, firma, casos o linaje invalida el dataset.
- Sin ancla pública confiable no se pueden registrar datasets.
- Las claves privadas permanecen fuera de la aplicación y del repositorio.
- Los datasets T20 deben volver a registrarse; la recuperación falla cerrada.
- La firma autentica al revisor, pero no garantiza que la fuente sea verdadera.
