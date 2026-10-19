# Quant Command Floor

Mapa operativo 2D e interactivo de un trading floor multi-agente. Representa nueve áreas conectadas: intake de señales, mesas por activo, debate, riesgo, ejecución, cartera, auditoría, backtesting y SRE.

## Ejecutar localmente

El proyecto es estático y no requiere instalación:

```bash
python3 -m http.server 8080 --directory dist
```

Luego abrí `http://localhost:8080`.

## Interacciones

- Arrastrar para recorrer el piso.
- Scroll o controles `+`/`−` para aplicar zoom.
- Seleccionar áreas desde el mapa o el directorio.
- Buscar agentes o equipos.
- Consultar estado, integrantes y última señal en el panel lateral.
- Activar o desactivar la capa **Red IA** para seguir las rutas de datos.
- Seleccionar un empleado para inspeccionar su modelo, fórmula, entradas, salida y confianza.

## Arquitectura de decisión

La visualización representa el recorrido `intake → mesas → debate → riesgo → ejecución → cartera → auditoría`. El laboratorio de backtesting realimenta las mesas y SRE supervisa ejecución. Las líneas rojas indican controles con capacidad de veto y las amarillas, ciclos de aprendizaje.

## Estructura

- `dist/index.html`: estructura de la interfaz.
- `dist/styles.css`: sistema visual y pixel art.
- `dist/app.js`: datos, renderizado e interacciones.
- `.openai/hosting.json`: configuración de publicación en Sites.
