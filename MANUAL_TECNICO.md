# Manual tecnico - nglobal Logistics

## 1. Resumen ejecutivo

Esta aplicacion es una plataforma de operacion logistica para nglobal Logistics. Centraliza planeacion comercial, programacion de embarques USA, seguimiento operativo, monitoreo de sensores Tive, alertas, inventario, pagos de fletes, reportes ejecutivos, mensajeria interna, notificaciones push, asistencia con IA y canales externos como WhatsApp.

El sistema esta construido principalmente como una aplicacion web React + TypeScript empaquetada con Vite. Usa Supabase como backend principal para autenticacion, base de datos PostgreSQL, Realtime y Edge Functions. Ademas incluye un servidor Node/Express propio que sirve la app, expone webhooks HTTP, maneja WebSocket para chat interno y procesa mensajes de WhatsApp.

Tambien tiene soporte para:

- PWA: service worker, manifest y notificaciones push.
- Escritorio: Electron.
- Android/nativo: Capacitor.
- IA: Google Gemini via Supabase Edge Function y servidor Node.
- Sensores: Tive via webhook Supabase Edge Function.
- WhatsApp: Meta Cloud API via webhook y envio de respuestas.

## 2. Tecnologias principales

### Frontend

- React `19.2.4`.
- React DOM `19.2.4`.
- TypeScript `~5.8.2`.
- Vite `^6.2.0`.
- CSS global en `index.css`.
- Graficas con `recharts`.
- Drag and drop con `@hello-pangea/dnd`.
- Mapas en componentes usando Leaflet cargado globalmente desde el navegador.
- Iconos internos en `components/icons.tsx`.

### Backend propio

- Node.js.
- Express `^5.2.1`.
- `tsx` para ejecutar TypeScript en desarrollo/produccion.
- `ws` para WebSocket.
- `dotenv` para variables de entorno.
- `crypto` de Node para validar firma HMAC de WhatsApp.

### Backend administrado

- Supabase:
  - Auth.
  - PostgreSQL.
  - Realtime.
  - Edge Functions.
  - Storage publico para imagen/logo.

### Integraciones externas

- Google Gemini por `@google/genai`.
- Meta WhatsApp Cloud API.
- Tive para telemetria y alertas de trackers.
- Web Push con VAPID y `web-push`.

### Empaquetado multiplataforma

- Electron `^41.0.2`.
- Electron Builder `^26.8.1`.
- Capacitor `^8.2.0`.
- Capacitor Android.
- Capacitor Camera, Geolocation, Push Notifications y Status Bar.

## 3. Estructura general del proyecto

```text
.
├── App.tsx                         # Componente raiz y enrutamiento interno por vista
├── index.tsx                       # Arranque React y registro/limpieza de service worker
├── index.html                      # HTML base Vite
├── index.css                       # Estilos globales
├── server.ts                       # Servidor Express, Vite middleware, WebSocket y WhatsApp
├── package.json                    # Scripts, dependencias y configuracion Electron Builder
├── vite.config.mjs                 # Configuracion Vite
├── tsconfig.json                   # Configuracion TypeScript
├── capacitor.config.ts             # Configuracion Capacitor
├── electron-main.cjs               # Proceso principal Electron
├── electron-preload.cjs            # Preload Electron
├── sw.js                           # Service worker PWA y push
├── manifest.json                   # Manifest PWA
├── pushService.ts                  # Alta y prueba de suscripciones Web Push
├── deploy.ps1                      # Despliegue desde Windows hacia servidor Linux
├── setup.sh                        # Instalacion y arranque remoto con PM2
├── lib/
│   ├── supabase.ts                 # Cliente Supabase y funciones de login
│   └── whatsappService.ts          # Cliente WhatsApp Cloud API desde frontend
├── services/
│   ├── geminiService.ts            # Invocacion de Edge Function gemini-chat
│   └── tiveService.ts              # Lectura/escritura de eventos Tive
├── utils/
│   ├── formatters.ts               # Conversion camelCase/snake_case y helpers
│   └── offlineStorage.ts           # IndexedDB para cola offline
├── constants/
│   └── schema.ts                   # Configuracion de catalogos/base de datos
├── components/                     # Pantallas, modales, providers y UI
├── roles/                          # Vistas por rol heredadas o especificas
├── supabase/functions/             # Edge Functions desplegables en Supabase
├── public/                         # Iconos y assets publicos
├── dist/                           # Build web generado
├── dist-desktop/                   # Build Electron generado
└── android/                        # Proyecto Android generado por Capacitor
```

## 4. Scripts disponibles

Definidos en `package.json`:

```bash
npm run dev
npm run dev:server
npm run dev:client
npm run build
npm run preview
npm run lint
npm run desktop
npm run dist:desktop
```

Detalle:

- `npm run dev`: inicia `server.ts` con `tsx` y Vite en paralelo. El servidor usa el puerto `3000`.
- `npm run dev:server`: ejecuta solo el servidor Node/Express.
- `npm run dev:client`: ejecuta solo Vite.
- `npm run build`: genera `dist/` con Vite.
- `npm run preview`: sirve el build de Vite para revision local.
- `npm run lint`: ejecuta `tsc --noEmit`. En esta app funciona como revision de tipos, no como ESLint.
- `npm run desktop`: abre la app en Electron.
- `npm run dist:desktop`: compila web y genera paquete Electron con `electron-builder`.

## 5. Arranque de la aplicacion

### Flujo web

1. `index.html` carga el bundle generado por Vite.
2. `index.tsx` busca el elemento `#root`.
3. `index.tsx` renderiza `<App />` dentro de `React.StrictMode`.
4. En desarrollo, `index.tsx` desregistra service workers antiguos y borra caches `nglobal-*` para evitar HTML o modulos obsoletos.
5. En produccion, registra `./sw.js`.
6. `App.tsx` valida configuracion de Supabase.
7. `App.tsx` revisa sesion con `supabase.auth.getSession()`.
8. Si no hay sesion muestra `Login`.
9. Si hay sesion, obtiene rol desde `app_metadata.role` o `user_metadata.role`.
10. Con rol valido renderiza layout principal: `Sidebar`, `Header`, contenido lazy-loaded y `ChatMessenger`.

### Lazy loading

`App.tsx` carga pantallas con `React.lazy` y `Suspense` para reducir el bundle inicial:

- `Dashboard`
- `BaseDeDatosPage`
- `UsaShipmentReportPage`
- `LiderProgramacionUsaPage`
- `FruitQualityChecker`
- `StrategicPlanningPage`
- `ClientReportDashboard`
- `TiveMapPage`
- `SettingsPage`
- `FreightPaymentPage`
- `InventoryPage`
- `PoliciesPage`

## 6. Configuracion Vite

Archivo: `vite.config.mjs`.

Configuracion relevante:

- Puerto dev: `3000`.
- Host: `0.0.0.0`.
- `base: './'` para compatibilidad con Electron y builds servidos desde rutas relativas.
- Plugin React: `@vitejs/plugin-react`.
- Alias: `@` apunta a la raiz del proyecto.
- Inyecta `GEMINI_API_KEY` como `process.env.API_KEY` y `process.env.GEMINI_API_KEY`.

Nota tecnica: aunque Vite usa normalmente `import.meta.env`, este proyecto tambien expone variables tipo `process.env.*` para compatibilidad con codigo existente.

## 7. Configuracion TypeScript

Archivo: `tsconfig.json`.

Puntos importantes:

- Target: `ES2022`.
- Modulo: `ESNext`.
- JSX: `react-jsx`.
- Resolucion: `bundler`.
- `allowJs: true`.
- `allowImportingTsExtensions: true`.
- `noEmit: true`.
- Incluye tipos `node` y `vite/client`.
- Excluye `node_modules`, `supabase` y `supabase_edge_function.ts`.

## 8. Servidor Node/Express

Archivo principal: `server.ts`.

Responsabilidades:

- Cargar `.env` con `dotenv`.
- Crear app Express.
- Crear servidor HTTP.
- Montar WebSocket con `ws`.
- Crear cliente Supabase server-side cuando existen variables.
- Exponer endpoint de salud.
- Verificar y recibir webhook de WhatsApp.
- Procesar mensajes entrantes de operadores.
- Actualizar viajes en Supabase segun contenido del mensaje.
- Generar respuestas de apoyo con Gemini.
- En desarrollo, montar Vite como middleware.
- En produccion, servir `dist/`.

### Puerto

El servidor escucha en:

```text
0.0.0.0:3000
```

### Endpoints HTTP

#### `GET /api/health`

Devuelve:

```json
{ "status": "ok" }
```

Uso: monitoreo simple de disponibilidad.

#### `GET /api/webhook/whatsapp`

Endpoint de verificacion para Meta WhatsApp Cloud API.

Lee:

- `hub.mode`
- `hub.verify_token`
- `hub.challenge`

Compara `hub.verify_token` contra `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.

Si es valido responde el `challenge` con status `200`.

#### `POST /api/webhook/whatsapp`

Recibe mensajes entrantes de WhatsApp.

Seguridad:

- Requiere header `x-hub-signature-256`.
- Valida HMAC SHA-256 usando `WHATSAPP_APP_SECRET`.
- Si la firma no es valida, responde `403`.

Flujo:

1. Extrae `messageObj`, telefono origen, texto y `phone_number_id`.
2. Normaliza telefono a digitos.
3. Opcionalmente valida allowlist `WHATSAPP_ALLOWED_SENDERS`.
4. Difunde el mensaje via WebSocket a roles operativos permitidos.
5. Busca viajes activos en `usa_shipment_reports` cuyo `transfer_phone` coincida con los ultimos 10 digitos.
6. Detecta estatus operativo por palabras clave.
7. Si existe un viaje unico y la transicion es permitida, actualiza `logistic_status`.
8. Puede registrar `real_departure_date` o `arrival_date_time`.
9. Agrega una linea de auditoria al campo `comments`.
10. Responde al operador por WhatsApp usando Meta Graph API.
11. Si no detecta estatus y hay `GEMINI_API_KEY`, genera respuesta breve con Gemini.

Estatus detectados por mensajes:

- `Entregado`
- `En Transito`
- `Retrasado`
- `Hold`
- `Pendiente`

Reglas de transicion implementadas:

- `Pendiente` -> `En Transito`, `Retrasado`, `Hold`.
- `Programado` -> `Pendiente`, `En Transito`, `Retrasado`, `Hold`.
- `Confirmado` -> `En Transito`, `Retrasado`, `Hold`.
- `Unidad en Empaque` -> `En Transito`, `Retrasado`, `Hold`.
- `En Transito` -> `Entregado`, `Retrasado`, `Hold`.
- `Retrasado` -> `En Transito`, `Entregado`, `Hold`.
- `Hold` -> `Pendiente`, `En Transito`, `Retrasado`.
- No permite cambiar viajes en `Finalizado` o `Cancelado`.

### WebSocket

El WebSocket se monta sobre el mismo servidor HTTP y host de la app.

Cliente:

- `components/ChatMessenger.tsx`.
- Construye URL con protocolo `ws:` o `wss:` segun `window.location.protocol`.
- Se conecta a `window.location.host`.

Autenticacion:

1. Al abrir el socket, el cliente obtiene sesion con `supabase.auth.getSession()`.
2. Envia mensaje:

```json
{
  "type": "auth",
  "accessToken": "..."
}
```

3. El servidor valida el JWT con `supabase.auth.getUser(accessToken)`.
4. Obtiene rol desde metadata.
5. Si es valido responde `auth_success`; si no, `auth_error` y cierra conexion.

Mensajeria:

- Mensaje a usuario especifico: `toUserId`.
- Mensaje a rol coordinador: `toRole: "COORDINADOR"`.
- El servidor reenvia al emisor, al usuario destino o a coordinadores si aplica.
- La lista de usuarios conectados se envia como evento `users`.

## 9. Autenticacion y roles

Archivo: `lib/supabase.ts` y logica principal en `App.tsx`.

Metodos soportados:

- Login con correo y contrasena: `supabase.auth.signInWithPassword`.
- Magic link: `supabase.auth.signInWithOtp`.

Origen del rol:

- `authUser.app_metadata.role`
- `authUser.user_metadata.role`

Roles definidos en `types.ts`:

- `DIRECCION`
- `SUBDIRECCION`
- `LIDER_PROYECTO`
- `GERENCIA`
- `SUBGERENCIA`
- `COORDINADOR`
- `ADMINISTRATIVO`
- `ADMINISTRADOR`

Control de acceso en `App.tsx`:

- `GERENCIA` y `ADMINISTRADOR`: acceso completo.
- `DIRECCION` y `SUBDIRECCION`: dashboard, planeacion, reporte ejecutivo, mapa Tive, reportes USA, settings y fletes.
- `LIDER_PROYECTO`: planeacion, programacion USA lider y settings.
- `COORDINADOR`: reportes USA, mapa Tive, inventario y settings.
- `SUBGERENCIA` y `ADMINISTRATIVO`: reportes USA, base de datos, mapa Tive, settings, fletes e inventario.

Selector manual de roles:

- Controlado por `VITE_ENABLE_INSECURE_ROLE_PICKER`.
- Por defecto debe estar en `false`.
- Si esta deshabilitado y el usuario no tiene rol en metadata, la app bloquea el acceso y muestra "Rol no configurado".

## 10. Base de datos

La base de datos es Supabase PostgreSQL. La aplicacion no incluye un archivo de migraciones SQL completo en `supabase/`; las tablas se infieren de los usos reales del codigo, los tipos TypeScript y los scripts comentados en `lib/supabase.ts`.

### Cliente frontend

Archivo: `lib/supabase.ts`.

Variables requeridas:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Si faltan, `App.tsx` muestra una pantalla de configuracion incompleta y no permite iniciar autenticacion ni cargar datos.

### Cliente servidor

Archivo: `server.ts`.

Variables usadas:

- `SUPABASE_URL` o `VITE_SUPABASE_URL`.
- `SUPABASE_ANON_KEY` o `VITE_SUPABASE_ANON_KEY`.

### Convencion de nombres

La app usa camelCase en React/TypeScript y snake_case en Supabase.

Archivo: `utils/formatters.ts`.

- `toCamelCase`: convierte respuestas de Supabase a objetos para UI.
- `toSnakeCase`: convierte payloads de UI antes de insertar/actualizar.
- Convierte strings vacios a `null`.

Ejemplo:

```text
departureDateTime <-> departure_date_time
lineaTransportistaId <-> linea_transportista_id
tiveTrackerId <-> tive_tracker_id
```

### Tablas principales

#### `usa_shipment_reports`

Tabla central de viajes/embarques USA.

Campos usados por el codigo:

- `id`
- `created_at`
- `trip_id`
- `project`
- `project_id`
- `sucursal_id`
- `is_consolidated`
- `secondary_project`
- `secondary_project_id`
- `stop_over_project_id`
- `lote_original_id`
- `lote_secundario_id`
- `linea_transportista_id`
- `unidad_transporte_id`
- `arrived_at_stop_over`
- `departed_from_stop_over`
- `client_id`
- `products` como JSON/JSONB
- `logistic_status`
- `departure_date_time`
- `real_departure_date`
- `arrival_date_time`
- `expected_arrival`
- `responsible_id`
- `unit_type`
- `driver_name`
- `box_number`
- `tractor_plates`
- `caat`
- `alpha`
- `transfer_agent`
- `transfer_phone`
- `freight_cost`
- `seal_number`
- `temperature`
- `total_real_boxes`
- `tive_tracker_id`
- `comments`
- `incidents` como JSON/JSONB
- `ideal_temp`
- `invoice_number`
- `invoice_url`
- `carrier_rating`
- `carrier_rating_comments`
- `rating_pending`
- `extra_costs`
- `fines`
- `freight_payer`
- `reviewer_id`
- `passed_to_payment`
- `passed_to_payment_date`
- `invoice_received`
- `invoice_received_date`
- `carrier_invoice_number`
- `fiscal_folio`
- `freight_in_portfolio`
- `payment_status`

Usada por:

- Reporte USA.
- Dashboard.
- Monitoreo Tive.
- Webhook Tive.
- Webhook WhatsApp.
- Pagos de flete.
- Reporte ejecutivo.
- Edge Function Gemini.
- Notificaciones Realtime.

#### `lider_programacion_usa_reports`

Tabla de programacion de lotes antes de convertirse en embarque USA.

Campos modelados:

- `id`
- `created_at`
- `lote_id`
- `semana_fiscal`
- `proyecto`
- `project_id`
- `client_id`
- `sucursal_id`
- `area`
- `fecha_salida`
- `fecha_llegada`
- `pallets`
- `cajas`
- `productos` como JSON/JSONB
- `usa_logistics_status`
- `comentarios`
- `secondary_project`
- `is_consolidated`
- `consolidation_partner_id`
- `temperatura_ideal`

Flujo:

- Lider crea/programa lote.
- Coordinacion lo carga a `usa_shipment_reports`.
- El lote cambia de `Programado` a `Cargado`.
- Si se elimina el embarque, se puede regresar el lote a `Programado`.

#### `proyecciones_estrategicas`

Tabla de planeacion, metas y proyecciones.

Campos modelados:

- `semana_fiscal`
- `canal_venta`
- `lider_proyecto_id`
- `proyecto_id`
- `producto_id`
- `client_id`
- `presupuesto_monetario`
- `venta_2023_referencia`
- `venta_2025_referencia`
- `precio_compra_2025`
- `precio_venta_2025`
- `proyeccion_cajas`
- `fecha_salida`
- `fecha_llegada`
- `total_tarimas`
- `camiones_calculados`
- `lunes` a `domingo`
- `autorizado`
- `venta_real_manual`
- `desglose_diario` como JSONB
- `linea_transportista_id`
- `unidad_transporte_id`
- `comentarios_rechazo`
- `canje_productos` como JSONB

Usada por:

- Planeacion estrategica.
- Programacion lider.
- Reporte ejecutivo.

#### Catalogos USA

Tablas administradas desde `BaseDeDatosPage.tsx`:

- `usa_proyectos`
- `usa_productos`
- `usa_clientes`
- `usa_lineas_transporte`
- `usa_unidades_transporte`
- `tipo_unidad`
- `usa_estatus`
- `usa_brockers`
- `usa_escalas`
- `usa_responsables`
- `usa_sucursales`
- `usa_proyecto_producto`

Uso:

- `usa_proyectos`: origenes/empaques, geocerca, tiempos optimos, capacidad.
- `usa_productos`: productos, categorias, temperatura, cajas por pallet, insumos y costos.
- `usa_clientes`: destinos/consignatarios, direccion y geocerca.
- `usa_lineas_transporte`: transportistas y contacto.
- `usa_unidades_transporte`: tractores/cajas asociados a transportista.
- `tipo_unidad`: catalogo de tipos y capacidades.
- `usa_estatus`: catalogo visual/operativo de estatus.
- `usa_brockers`: brokers/agentes.
- `usa_escalas`: escalas tecnicas.
- `usa_responsables`: responsables de turno, horario, correo y WhatsApp.
- `usa_sucursales`: puntos de carga por proyecto.
- `usa_proyecto_producto`: relacion muchos-a-muchos entre proyectos y productos permitidos.

#### Tive

Tablas:

- `tive_events`
- `tive_alert_dictionary`
- `tive_alert_config`
- `usa_shipment_alerts`

`tive_events` almacena telemetria:

- `tracker_id`
- `temperature`
- `humidity`
- `location`
- `lat`
- `lng`
- `speed`
- `battery`
- `timestamp`
- `alert_type`
- `raw_data`

`usa_shipment_alerts` almacena alertas visibles en dashboard/notificaciones:

- `shipment_id`
- `trip_id`
- `alert_type`
- `message`
- `severity`
- `comment`
- `created_at`

`tive_alert_config` define limites y opciones por tracker:

- `tracker_id`
- `temp_min`
- `temp_max`
- `enable_movement_alerts`
- `enable_stop_alerts`
- `cooldown_minutes`

#### Inventario

Tablas:

- `inventario_proyectos`
- `transferencias_stock`

Uso:

- Inventario disponible por proyecto/producto.
- Transferencias internas entre proyectos.
- Aprobacion/rechazo de transferencias.
- Suscripcion Realtime al canal `realtime-inventory`.

#### Push

Tabla:

- `push_subscriptions`

Campos usados:

- `user_name`
- `subscription`

La suscripcion se registra desde `pushService.ts` y se lee desde la Edge Function `send-push`.

## 11. Edge Functions de Supabase

Ubicacion: `supabase/functions/`.

### `_shared/cors.ts`

Helper compartido para respuestas CORS.

Funciones:

- `createJsonResponse`
- `createOptionsResponse`

### `gemini-chat`

Archivo: `supabase/functions/gemini-chat/index.ts`.

Responsabilidades:

- Validar JWT de Supabase.
- Obtener rol desde metadata.
- Procesar mensajes de texto para asistente logistico.
- Procesar imagenes para calidad/analisis visual.
- Consultar contexto de envios activos para roles autorizados.
- Invocar Gemini.

Roles con contexto operativo:

- `COORDINADOR`
- `SUBGERENCIA`
- `GERENCIA`
- `DIRECCION`
- `SUBDIRECCION`
- `ADMINISTRADOR`

Modelos usados:

- Imagen: `gemini-2.5-flash-image`.
- Texto: `gemini-3-flash-preview`.

Variables requeridas en secretos de Supabase:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`

Invocacion desde frontend:

- `services/geminiService.ts`
- `supabase.functions.invoke('gemini-chat', { body })`

### `tive-webhook`

Archivo: `supabase/functions/tive-webhook/index.ts`.

Responsabilidades:

- Recibir payloads Tive.
- Aceptar payload individual o arreglo.
- Normalizar tracker ID, alerta, temperatura, ubicacion y timestamp.
- Insertar en `tive_events`.
- Buscar embarque activo con `tive_tracker_id`.
- Insertar alerta en `usa_shipment_alerts` cuando el evento no es telemetria normal.

Variables requeridas:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Tablas afectadas:

- Inserta en `tive_events`.
- Lee `usa_shipment_reports`.
- Inserta en `usa_shipment_alerts`.

### `send-push`

Archivo: `supabase/functions/send-push/index.ts`.

Responsabilidades:

- Validar JWT.
- Permitir solo roles autorizados.
- Leer suscripciones desde `push_subscriptions`.
- Enviar notificaciones Web Push usando VAPID.

Roles autorizados:

- `COORDINADOR`
- `SUBGERENCIA`
- `GERENCIA`
- `DIRECCION`
- `SUBDIRECCION`
- `ADMINISTRADOR`

Variables requeridas:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VAPID_PRIVATE_KEY`

## 12. Notificaciones

### Notificaciones internas en UI

Archivo: `components/NotificationProvider.tsx`.

Maneja:

- Toasts temporales.
- Historial local de ultimas 50 notificaciones.
- Conteo de no leidas.
- Marcado como leidas.
- Limpieza de historial.

Realtime:

Se suscribe al canal `global-app-events`.

Eventos escuchados:

- `INSERT` en `usa_shipment_alerts`.
- `UPDATE` en `usa_shipment_reports`.

Comportamiento:

- Una alerta nueva genera toast con severidad.
- Un cambio real de `logistic_status` genera notificacion de movimiento logistico.

### Web Push / PWA

Archivos:

- `pushService.ts`.
- `sw.js`.
- `supabase/functions/send-push/index.ts`.

Flujo:

1. El usuario acepta permisos de notificacion.
2. `pushService.ts` espera `navigator.serviceWorker.ready`.
3. Obtiene o crea `PushSubscription`.
4. Registra/actualiza la suscripcion en `push_subscriptions`.
5. `send-push` envia notificaciones a todas las suscripciones.
6. `sw.js` recibe evento `push` y muestra notificacion.
7. Al hacer clic, enfoca ventana existente o abre `/`.

VAPID public key:

- Esta hardcodeada en `pushService.ts` y `send-push`.

## 13. Service worker y PWA

Archivo: `sw.js`.

Cache:

- Nombre: `nglobal-v4`.
- Precarga:
  - `/`
  - `/index.html`
  - `/manifest.json`

Estrategia:

- Para navegacion: intenta red, actualiza cache y cae a `/index.html` si no hay red.
- Para assets GET: cache first con actualizacion por red.
- Excluye requests a:
  - `supabase.co`
  - `generativelanguage.googleapis.com`
  - cualquier request que no sea `GET`

Push:

- Muestra notificacion con icono/logo remoto.
- Usa patron de vibracion especial para alertas criticas.
- Define acciones:
  - `open_app`
  - `ignore`

Manifest:

- Archivo: `manifest.json`.
- Nombre: `nglobal Logistics Platform`.
- Modo: `standalone`.
- Orientacion: `portrait`.
- Tema: `#002D62`.
- Iconos apuntan a imagen publica en Supabase Storage.

## 14. Monitoreo Tive y geocercas

Componentes/servicios:

- `services/tiveService.ts`
- `components/TiveMonitoringProvider.tsx`
- `components/TiveMapPage.tsx`
- `supabase/functions/tive-webhook/index.ts`

Flujo de datos:

1. Tive envia eventos al webhook `tive-webhook`.
2. La Edge Function inserta cada evento en `tive_events`.
3. Si el evento es alerta, crea registro en `usa_shipment_alerts`.
4. `NotificationProvider` detecta la alerta por Supabase Realtime.
5. `TiveMonitoringProvider` consulta embarques activos cada 30 segundos.
6. Por cada embarque con `tive_tracker_id`, consulta los ultimos 5 eventos.
7. Calcula edad de senal, velocidad promedio, temperatura, ubicacion y no-signal.
8. Si hay lat/lng recientes, compara contra geocercas de:
   - Cliente destino.
   - Escala tecnica E2.
   - Proyecto/origen E1.
9. Si detecta entrada/salida, actualiza `usa_shipment_reports`.

Reglas automaticas:

- Entrada a cliente: actualiza estatus a `En {cliente}` y marca `arrival_date_time` y `rating_pending`.
- Entrada a E2: actualiza estatus a `En {escala}` y marca `arrived_at_stop_over`.
- Salida de E2: actualiza a `En Transito` y marca `departed_from_stop_over`.
- Entrada a origen: actualiza a `En {proyecto}`.
- Salida de origen con velocidad mayor a 10: actualiza a `En Transito`.

Calculo de distancia:

- Haversine con radio de tierra de 6371 km.
- El radio de geocerca se lee en metros y se convierte a km.

## 15. WhatsApp

Hay dos partes:

### Cliente frontend

Archivo: `lib/whatsappService.ts`.

Funciones:

- `sendWhatsAppMessage(to, template, components)`
- `sendWhatsAppText(to, body)`

Usa Meta Graph API:

- Version `v22.0`.
- Endpoint `https://graph.facebook.com/v22.0/{PHONE_ID}/messages`.

Variables usadas:

- `WHATSAPP_PHONE_ID`
- `WHATSAPP_ACCESS_TOKEN`

Nota tecnica: este archivo intenta leer desde `process.env`. En Vite, las variables expuestas al navegador normalmente deben usar prefijo `VITE_` o ser definidas explicitamente. Se recomienda evitar exponer tokens de WhatsApp en frontend; el envio deberia ejecutarse server-side.

### Webhook servidor

Archivo: `server.ts`.

Usa Meta Graph API:

- Version `v17.0` para responder mensajes entrantes.

Variables:

- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- `WHATSAPP_APP_SECRET`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_ALLOWED_SENDERS` opcional

Funciones:

- Verificacion inicial del webhook.
- Validacion de firma HMAC.
- Recepcion de mensajes.
- Actualizacion de viajes.
- Respuesta automatica.
- Broadcast por WebSocket a roles operativos.

## 16. IA / Gemini

### Asistente en frontend

Archivo: `services/geminiService.ts`.

Funciones:

- `sendMessage(message)`: invoca `gemini-chat` con texto.
- `analyzeImage(prompt, base64Image)`: invoca `gemini-chat` con texto + imagen.

### Edge Function `gemini-chat`

Uso recomendado para IA desde frontend porque:

- Valida JWT.
- Controla roles.
- Puede usar `SUPABASE_SERVICE_ROLE_KEY` sin exponerlo al navegador.
- Mantiene `GEMINI_API_KEY` como secreto de Supabase.

### Gemini en `server.ts`

El servidor usa `@google/genai` directamente para apoyar respuestas de WhatsApp.

Modelo usado:

- `gemini-2.5-flash`.

## 17. Modulos funcionales principales

### Dashboard

Archivo: `components/Dashboard.tsx`.

Usa:

- `usa_shipment_reports`
- `usa_productos`
- `usa_shipment_alerts`

Objetivo:

- Vista general de operaciones, envios recientes, indicadores y alertas.

### Base de Datos

Archivo: `components/BaseDeDatosPage.tsx`.

Objetivo:

- Administracion de catalogos.
- Gestion de productos/proyectos/clientes/transportistas/unidades/estatus/responsables.
- Manejo de geocercas y mapa para coordenadas.
- Relacion proyecto-producto.
- Sucursales por proyecto.

Permisos:

- Escritura solo para `ADMINISTRADOR` y `GERENCIA`.
- Otros roles con acceso pueden consultar.

### Reporte USA

Archivos:

- `components/UsaShipmentReportPage.tsx`
- `components/UsaShipmentForm.tsx`
- `components/ShipmentDetailsModal.tsx`
- `components/ShipmentList.tsx`
- `components/ShipmentCardView.tsx`
- `components/IncidentModal.tsx`
- `components/CarrierRatingModal.tsx`

Objetivo:

- Crear, editar, borrar y consultar embarques.
- Vincular lotes de programacion.
- Actualizar estatus logisticos.
- Capturar incidentes.
- Manejar viajes consolidados.
- Asociar trackers Tive.
- Registrar evidencias y datos de transporte.

### Programacion Lider USA

Archivos:

- `components/LiderProgramacionUsaPage.tsx`
- `components/LiderProgramacionUsaForm.tsx`

Objetivo:

- Programar lotes por semana fiscal.
- Asociar proyectos, clientes y productos.
- Consolidar cargas.
- Convertir programacion en embarques USA.

### Planeacion Estrategica

Archivo: `components/StrategicPlanningPage.tsx`.

Objetivo:

- Gestion de metas/proyecciones por semana fiscal.
- Presupuesto, volumen, tarimas, camiones.
- Autorizaciones/rechazos.
- Canjes y productos adicionales.
- Comparacion contra embarques reales.

### Reporte Ejecutivo

Archivo: `components/ClientReportDashboard.tsx`.

Objetivo:

- Cumplimiento por cliente/producto/semana.
- Comparacion entre proyeccion y real.
- Agregacion de datos de `proyecciones_estrategicas` y `usa_shipment_reports`.

### Calidad IA

Archivo: `components/FruitQualityChecker.tsx`.

Objetivo:

- Analisis de imagenes con Gemini.
- Usa `analyzeImage` en `services/geminiService.ts`.

### Mapa Tive

Archivo: `components/TiveMapPage.tsx`.

Objetivo:

- Visualizacion de trackers/eventos/ubicaciones.
- Usa datos de Tive y configuracion guardada en localStorage.

### Pago de Fletes

Archivos:

- `components/FreightPaymentPage.tsx`
- `components/FreightPaymentDetailsModal.tsx`

Objetivo:

- Control de fletes por viaje.
- Costos extra, multas, facturas, folios fiscales, cartera y estatus de pago.
- Usa `usa_shipment_reports` y catalogos de transportistas/clientes/productos.

### Inventario

Archivo: `components/InventoryPage.tsx`.

Objetivo:

- Stock por proyecto/producto.
- Transferencias internas.
- Ajustes de inventario.
- Realtime para cambios en inventario.

### Politicas

Archivo: `components/PoliciesPage.tsx`.

Objetivo:

- Mostrar politicas/privacidad.
- Puede abrirse sin sesion en ruta `/politicas`.

### Configuraciones

Archivo: `components/SettingsPage.tsx`.

Objetivo:

- Configuracion del usuario/app.
- Cambio de contrasena via `supabase.auth.updateUser`.

## 18. Persistencia offline

Archivo: `utils/offlineStorage.ts`.

Usa IndexedDB:

- DB: `nglobal_offline_db`.
- Version: `1`.
- Stores:
  - `sync_queue`
  - `quality_images`

Funciones:

- `initOfflineDB()`
- `saveToSyncQueue(tableName, payload, operation)`
- `saveQualityImage(id, blob)`
- `getPendingSync()`

Uso actual:

- Incidentes pueden guardarse en cola cuando falla red.
- Imagenes de calidad pueden almacenarse localmente.

Limitacion:

- El archivo implementa cola y lectura de pendientes, pero no se observo un worker/sincronizador completo que reprocesa automaticamente toda la cola hacia Supabase.

## 19. Electron

Archivo: `electron-main.cjs`.

Configuracion:

- Ventana: 1280x800.
- Titulo: `nglobal Logistics - Desktop`.
- `nodeIntegration: false`.
- `contextIsolation: true`.
- Preload: `electron-preload.cjs`.
- Icono: `public/favicon.ico`.
- Menu bar oculta.

Modo desarrollo:

- Carga `http://localhost:3000`.

Modo empaquetado:

- Carga `dist/index.html`.

Electron Builder:

- `appId`: `com.nglobal.logistics`.
- `productName`: `nglobal Logistics`.
- Salida: `dist-desktop`.
- Windows target: `portable`.
- Icono: `build/icon.png`.

## 20. Capacitor / Android

Archivo: `capacitor.config.ts`.

Configuracion:

- `appId`: `com.nglobal.logistics`.
- `appName`: `nglobal Logistics`.
- `webDir`: `dist`.

Plugins usados en `App.tsx`:

- `@capacitor/core`
- `@capacitor/status-bar`
- `@capacitor/geolocation`
- `@capacitor/camera`
- `@capacitor/push-notifications`

Comportamiento nativo:

- Si `Capacitor.isNativePlatform()`:
  - Configura StatusBar.
  - Solicita permisos de geolocalizacion.
  - Solicita permisos de camara.
  - Solicita permisos de push.

## 21. Variables de entorno

Plantilla: `.env.example`.

Variables listadas:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_URL=
SUPABASE_ANON_KEY=
GEMINI_API_KEY=
WHATSAPP_PHONE_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_APP_ID=
WHATSAPP_WEBHOOK_VERIFY_TOKEN=
VITE_ENABLE_INSECURE_ROLE_PICKER=false
```

Variables adicionales usadas por el codigo aunque no aparecen en `.env.example`:

```env
WHATSAPP_APP_SECRET=
WHATSAPP_ALLOWED_SENDERS=
SUPABASE_SERVICE_ROLE_KEY=
VAPID_PRIVATE_KEY=
```

### Separacion recomendada

Frontend:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_ENABLE_INSECURE_ROLE_PICKER`

Servidor Node:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `GEMINI_API_KEY`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- `WHATSAPP_APP_SECRET`
- `WHATSAPP_ALLOWED_SENDERS`

Supabase Edge Functions:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `VAPID_PRIVATE_KEY`

No se deben exponer en frontend:

- `SUPABASE_SERVICE_ROLE_KEY`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_APP_SECRET`
- `VAPID_PRIVATE_KEY`

## 22. Desarrollo local

### Requisitos

- Node.js 20 recomendado.
- npm.
- Proyecto Supabase activo.
- Variables `.env` configuradas.

### Instalacion

```bash
npm install
```

### Ejecutar app completa

```bash
npm run dev
```

Abre:

```text
http://localhost:3000
```

### Ejecutar servidor y cliente por separado

```bash
npm run dev:server
npm run dev:client
```

### Revision de tipos

```bash
npm run lint
```

### Build web

```bash
npm run build
```

### Preview del build

```bash
npm run preview
```

## 23. Despliegue

### Despliegue automatizado actual

Archivos:

- `deploy.ps1`
- `setup.sh`

Servidor configurado en `deploy.ps1`:

```text
IP: 107.170.33.75
Usuario: root
Directorio: /var/www/nglobal
```

Flujo de `deploy.ps1`:

1. Empaqueta el proyecto en `deploy.tar.gz`.
2. Excluye `node_modules`, `.git`, `dist`, `dist-desktop`, `.env`, logs y archivos temporales.
3. Sube `deploy.tar.gz` y `setup.sh` por `scp`.
4. Ejecuta `bash /root/setup.sh` por `ssh`.
5. Borra el tar local.

Flujo de `setup.sh`:

1. Crea `/var/www/nglobal`.
2. Extrae el tar.
3. Instala Node.js 20 si no existe.
4. Instala PM2 global.
5. Ejecuta `npm install`.
6. Ejecuta `npm run build`.
7. Detiene/elimina proceso PM2 `nglobal-backend`.
8. Inicia `NODE_ENV=production pm2 start "npx tsx server.ts" --name nglobal-backend`.
9. Ejecuta `pm2 save`.
10. Configura arranque con `pm2 startup`.

### Produccion

Cuando `NODE_ENV=production`:

- `server.ts` sirve archivos estaticos desde `dist`.
- Cualquier ruta cae a `dist/index.html`.
- WebSocket y API comparten el mismo puerto `3000`.

### Consideracion de proxy

Si se usa Nginx/Apache enfrente, debe soportar:

- Proxy HTTP hacia `localhost:3000`.
- Upgrade WebSocket.
- HTTPS para que PWA, push, permisos y `wss` funcionen correctamente.

## 24. Seguridad

Controles implementados:

- Supabase Auth obligatorio para app principal.
- Roles desde metadata de usuario.
- WebSocket requiere JWT valido.
- Edge Functions `gemini-chat` y `send-push` validan JWT.
- Roles restringidos para contexto IA y push.
- WhatsApp webhook valida firma HMAC.
- Selector inseguro de roles deshabilitado por default.
- Supabase Realtime escucha cambios, pero las politicas RLS deben proteger tablas.

Riesgos/observaciones:

- `.env` existe localmente. No debe subirse al repositorio.
- `lib/whatsappService.ts` contiene envio de WhatsApp desde frontend; esto puede exponer tokens si se configura para navegador. Recomendado mover todo envio WhatsApp al servidor o Edge Function.
- La VAPID public key esta hardcodeada; eso es normal. La private key debe quedar solo como secreto.
- `supabase/functions/send-push` contiene la public key hardcodeada y lee `VAPID_PRIVATE_KEY` de secretos.
- No se encontro una carpeta de migraciones SQL versionadas completa. La base depende de estructura existente en Supabase.
- Hay scripts SQL comentados dentro de `lib/supabase.ts`; conviene moverlos a migraciones formales.
- Algunas cadenas muestran caracteres mojibake en el codigo fuente; conviene normalizar codificacion UTF-8.

## 25. Modelo de permisos por modulo

Permisos generales desde `App.tsx`:

| Rol | Acceso principal |
| --- | --- |
| ADMINISTRADOR | Todas las vistas |
| GERENCIA | Todas las vistas |
| DIRECCION | Dashboard, planeacion, reporte ejecutivo, mapa Tive, USA, settings, fletes |
| SUBDIRECCION | Dashboard, planeacion, reporte ejecutivo, mapa Tive, USA, settings, fletes |
| LIDER_PROYECTO | Planeacion, programacion lider, settings |
| COORDINADOR | USA, mapa Tive, inventario, settings |
| SUBGERENCIA | USA, base de datos, mapa Tive, settings, fletes, inventario |
| ADMINISTRATIVO | USA, base de datos, mapa Tive, settings, fletes, inventario |

Permisos especificos:

- Escritura en Base de Datos: `ADMINISTRADOR` y `GERENCIA`.
- Contexto IA de embarques: roles operativos autorizados.
- Envio push: roles operativos autorizados.
- Chat: usuarios autenticados con rol valido.

## 26. Flujos operativos clave

### Flujo: planeacion a embarque

1. Planeacion crea proyeccion en `proyecciones_estrategicas`.
2. Lider programa lote en `lider_programacion_usa_reports`.
3. Coordinacion toma lote programado.
4. Se crea embarque en `usa_shipment_reports`.
5. El lote cambia a `Cargado`.
6. El embarque queda visible en Reporte USA, Dashboard y monitoreo Tive si tiene tracker.

### Flujo: tracker Tive a alerta

1. Tive envia webhook.
2. `tive-webhook` inserta `tive_events`.
3. Si es alerta, inserta `usa_shipment_alerts`.
4. Supabase Realtime avisa a `NotificationProvider`.
5. UI muestra toast y registra historial.
6. Dashboard puede consultar alertas.

### Flujo: tracker Tive a cambio de estatus

1. `TiveMonitoringProvider` consulta embarques activos cada 30 segundos.
2. Lee ultimos eventos por tracker.
3. Calcula ubicacion contra geocercas.
4. Si detecta llegada/salida, actualiza `usa_shipment_reports`.
5. Realtime notifica cambio de estatus.

### Flujo: WhatsApp a actualizacion de viaje

1. Operador envia mensaje por WhatsApp.
2. Meta llama `POST /api/webhook/whatsapp`.
3. Servidor valida firma.
4. Busca viajes activos por `transfer_phone`.
5. Detecta intencion de estatus.
6. Si hay una coincidencia segura, actualiza `usa_shipment_reports`.
7. Agrega auditoria a `comments`.
8. Responde al operador por WhatsApp.
9. Difunde el mensaje a usuarios operativos conectados por WebSocket.

### Flujo: notificacion push

1. Usuario registra dispositivo con `subscribeUserToPush`.
2. Suscripcion queda guardada en `push_subscriptions`.
3. Un usuario autorizado invoca `send-push`.
4. Edge Function envia Web Push.
5. `sw.js` muestra notificacion.
6. Click abre o enfoca la app.

## 27. Archivos criticos y responsabilidad

| Archivo | Responsabilidad |
| --- | --- |
| `App.tsx` | Estado global de sesion, rol, layout, permisos y vistas |
| `server.ts` | API, WebSocket, WhatsApp, servicio web en produccion |
| `lib/supabase.ts` | Cliente Supabase y login |
| `types.ts` | Tipos principales del dominio |
| `utils/formatters.ts` | Conversion de estructuras frontend/backend |
| `components/NotificationProvider.tsx` | Toasts, historial y Realtime global |
| `components/TiveMonitoringProvider.tsx` | Monitoreo periodico Tive y geocercas |
| `services/geminiService.ts` | Cliente frontend para IA |
| `services/tiveService.ts` | Cliente frontend para Tive |
| `pushService.ts` | Alta y prueba de Web Push |
| `sw.js` | Cache PWA y push |
| `supabase/functions/gemini-chat/index.ts` | IA segura en Edge Function |
| `supabase/functions/tive-webhook/index.ts` | Ingesta Tive |
| `supabase/functions/send-push/index.ts` | Envio Web Push |
| `deploy.ps1` | Automatizacion de despliegue |
| `setup.sh` | Instalacion y PM2 en servidor |

## 28. Recomendaciones tecnicas

1. Crear migraciones SQL formales para todas las tablas, indices, relaciones y politicas RLS.
2. Mover scripts SQL comentados en `lib/supabase.ts` a `supabase/migrations`.
3. Revisar que todas las tablas tengan RLS habilitado y politicas por rol.
4. Mover cualquier envio WhatsApp del frontend al servidor o Edge Function.
5. Agregar `.env.example` actualizado con `WHATSAPP_APP_SECRET`, `WHATSAPP_ALLOWED_SENDERS`, `SUPABASE_SERVICE_ROLE_KEY` y `VAPID_PRIVATE_KEY`.
6. Crear documentacion de despliegue de Edge Functions:
   - `supabase functions deploy gemini-chat`
   - `supabase functions deploy tive-webhook`
   - `supabase functions deploy send-push`
7. Agregar pruebas automaticas minimas para:
   - `toCamelCase` y `toSnakeCase`.
   - reglas de transicion WhatsApp.
   - validacion de roles.
8. Separar constantes de estados logisticos en un modulo compartido para evitar diferencias entre frontend, servidor y Edge Functions.
9. Normalizar codificacion UTF-8 de archivos que muestran textos con caracteres corruptos.
10. Documentar las URLs reales de produccion, Supabase project ref y webhooks configurados en un anexo privado fuera del repositorio.

## 29. Comandos utiles de operacion

### Verificar tipos

```bash
npm run lint
```

### Construir web

```bash
npm run build
```

### Ejecutar servidor produccion local

```bash
NODE_ENV=production npx tsx server.ts
```

En Windows PowerShell:

```powershell
$env:NODE_ENV="production"; npx tsx server.ts
```

### Ejecutar Electron en desarrollo

```bash
npm run dev
npm run desktop
```

### Generar app desktop portable

```bash
npm run dist:desktop
```

### Desplegar al servidor configurado

```powershell
.\deploy.ps1
```

## 30. Checklist para levantar una instancia nueva

1. Crear proyecto Supabase.
2. Crear tablas necesarias.
3. Configurar RLS y politicas.
4. Crear usuarios en Supabase Auth.
5. Asignar `app_metadata.role` o `user_metadata.role`.
6. Configurar `.env` local.
7. Configurar secretos de Edge Functions.
8. Desplegar Edge Functions.
9. Configurar webhook Tive hacia `tive-webhook`.
10. Configurar webhook WhatsApp hacia `/api/webhook/whatsapp`.
11. Ejecutar `npm install`.
12. Ejecutar `npm run lint`.
13. Ejecutar `npm run build`.
14. Ejecutar `npm run dev` para validar local.
15. Desplegar con `deploy.ps1` o pipeline equivalente.
16. Configurar reverse proxy HTTPS con soporte WebSocket.
17. Probar login, Realtime, push, WhatsApp, Tive y creacion de embarque.

