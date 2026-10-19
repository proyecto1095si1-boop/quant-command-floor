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

## Estructura

- `dist/index.html`: estructura de la interfaz.
- `dist/styles.css`: sistema visual y pixel art.
- `dist/app.js`: datos, renderizado e interacciones.
- `.openai/hosting.json`: configuración de publicación en Sites.
