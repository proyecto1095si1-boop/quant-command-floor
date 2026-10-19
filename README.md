# Quant Command Floor

Mapa operativo 2D e interactivo de un hedge fund cripto multi-agente. Representa nueve áreas conectadas: Mining & Testing, Trading Floor, Intel & Data, Risk Management, DeFi Yield & Arbitrage, AI Board, Infraestructura, Tesorería y Derivados.

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
- Observar estados de trabajo, pensamientos ambientales y ciclo visual según la hora local.
- Usar `+`, `−`, `0` y `Escape` para controlar rápidamente la cámara.
- Configurar cada empleado como nodo matemático, IA externa o híbrido.
- Ajustar su peso en el ensemble, endpoint y estado de conexión; la configuración se conserva localmente.
- Simular la traza completa desde la normalización de datos hasta la auditoría.
- Operar el Command Center con pausa global, escenarios de estrés y Kill Switch.

El roadmap técnico completo está en [`docs/MEGA_PLAN.md`](docs/MEGA_PLAN.md).

## Runtime multiagente

`dist/runtime.js` implementa el bus de eventos, máquina de estados, registro versionado, adaptadores de nodos, timeout/reintentos y ejecución DAG. Se valida sin dependencias con:

```bash
node tests/runtime.test.js
```

## Arquitectura de decisión

La visualización representa el recorrido `Intel + Mining + Infra → Trading → Risk → AI Board → Tesorería`. DeFi y Derivados entran por el control de riesgo; Mining realimenta Trading con estrategias validadas. Las líneas rojas indican controles con capacidad de veto y las amarillas, ciclos de aprendizaje.

## Créditos

Los personajes pixel provienen del set MIT distribuido con `ATK-zk/company-pixel-office`. Consultá `THIRD_PARTY_NOTICES.md` y `third_party/LICENSE-pixel-agents-MIT`.

## Estructura

- `dist/index.html`: estructura de la interfaz.
- `dist/styles.css`: sistema visual y pixel art.
- `dist/app.js`: datos, renderizado e interacciones.
- `.openai/hosting.json`: configuración de publicación en Sites.
