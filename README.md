# Quant Command Floor

Mapa operativo 2D e interactivo de un hedge fund cripto multi-agente. Representa nueve áreas conectadas: Mining & Testing, Trading Floor, Intel & Data, Risk Management, DeFi Yield & Arbitrage, AI Board, Infraestructura, Tesorería y Derivados.

## Ejecutar localmente

No requiere instalar paquetes. En una terminal iniciá el gateway:

```bash
cp .env.example .env
npm start
```

El comando activa `--use-env-proxy` de Node para respetar proxies HTTPS administrados sin desactivar la validación TLS.

En otra terminal serví la interfaz:

```bash
npm run serve:ui
```

Abrí `http://localhost:8080`, entrá a **Conectores**, probá health y guardá. El gateway escucha en `http://localhost:8787` y el stream en `ws://localhost:8787/v1/stream`.

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
La frontera de seguridad y los requisitos previos a capital real están en [`docs/SECURITY.md`](docs/SECURITY.md).
El contrato listo para conectar localhost o un gateway está en [`docs/INTEGRATION.md`](docs/INTEGRATION.md).
La operación, recuperación y alertas del Data Plane están en [`docs/DATA_RUNBOOK.md`](docs/DATA_RUNBOOK.md).
Las fórmulas y límites de las mesas majors están en [`docs/ASSET_DESKS.md`](docs/ASSET_DESKS.md).
El pipeline, sizing, veto y recuperación están en [`docs/PIPELINE.md`](docs/PIPELINE.md).
Las métricas, alertas y trazabilidad están en [`docs/OBSERVABILITY.md`](docs/OBSERVABILITY.md).

## Runtime multiagente

`dist/runtime.js` implementa el bus de eventos, máquina de estados, registro versionado, adaptadores de nodos, timeout/reintentos y ejecución DAG. Se valida sin dependencias con:

```bash
npm test
```

## Conectar backend o localhost

Abrí **Conectores** en la barra del mapa y completá el host, las rutas, el proveedor y el modelo. HTTP/WS solo se aceptan para `localhost`; fuera de local se exige HTTPS/WSS. Las credenciales no se almacenan en el frontend: el backend debe resolverlas desde variables de entorno (por ejemplo `LLM_API_KEY` y `EXCHANGE_API_KEY`) y exponer únicamente `/v1/health`, `/v1/agents/execute` y `/v1/stream`.

## Arquitectura de decisión

La visualización representa el recorrido `Intel + Mining + Infra → Trading → Risk → AI Board → Tesorería`. DeFi y Derivados entran por el control de riesgo; Mining realimenta Trading con estrategias validadas. Las líneas rojas indican controles con capacidad de veto y las amarillas, ciclos de aprendizaje.

## Créditos

Los personajes pixel provienen del set MIT distribuido con `ATK-zk/company-pixel-office`. Consultá `THIRD_PARTY_NOTICES.md` y `third_party/LICENSE-pixel-agents-MIT`.

## Estructura

- `dist/index.html`: estructura de la interfaz.
- `dist/styles.css`: sistema visual y pixel art.
- `dist/app.js`: datos, renderizado e interacciones.
- `.openai/hosting.json`: configuración de publicación en Sites.
