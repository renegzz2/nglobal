# nGlobal

Aplicación de logística, embarques e inspecciones. Instala Node.js 24 y ejecuta los comandos en esta carpeta, donde están package.json y supabase/.

```sh
npm ci
npm run lint
npm test
npm run build
npm run dev
```

npm run dev inicia Express y Vite juntos en el puerto 3000 y escucha solo en el equipo local durante el desarrollo. npm run dev:client inicia el frontend por separado. Para verificar las Edge Functions instala Deno 2 y ejecuta npm run check:edge.

## Estructura

- `components/` contiene las pantallas, formularios y presentación.
- `features/auth/` contiene los permisos de navegación y la verificación administrativa.
- `features/shipments/`, `features/inspections/` y `features/alerts/` concentran las operaciones de sus módulos.
- `supabase/migrations/` impone permisos y transacciones. `supabase/functions/` contiene las Edge Functions.
- `public/` contiene el manifiesto, los iconos y el service worker para la instalación web y las notificaciones.

## Alta y permisos de cuentas

Asignar el rol de negocio en `app_metadata.role` desde Supabase Auth Admin. Conservar los demás atributos de la cuenta y renovar su sesión después de cambiar el rol. Las cuentas con el rol `ADMINISTRADOR` deben configurar TOTP y completar el segundo factor al iniciar sesión. Supabase comprueba AAL2 para el acceso administrativo a los datos de negocio y para los envíos push masivos.

Matriz inicial derivada de las pantallas y operaciones existentes. Validar con el responsable de cada área antes de aplicar en producción.

| Área | Consulta | Modificación |
| --- | --- | --- |
| Embarques USA | Administración, Gerencia, Dirección, Subdirección, Coordinación, Subgerencia y Administrativo | Administración, Gerencia, Coordinación, Subgerencia y Administrativo. La promoción desde Planeación tiene un permiso propio |
| Planeación de cargas | Los roles operativos y directivos. Líder de Proyecto, por proyecto asignado | Administración, Gerencia y Líder de Proyecto en su proyecto |
| Proyección estratégica | Administración, Gerencia, Dirección, Subdirección y Líder de Proyecto en su proyecto | Administración, Dirección y Subdirección. Líderes asignados pueden editar campos operativos |
| Pagos de fletes | Los roles con acceso al módulo | Administración, Gerencia, Dirección, Subdirección, Subgerencia y Administrativo, mediante una operación limitada a los campos de pago |
| Inspecciones | Administración e Inspector | Ambos pueden crear inspecciones. Administración mantiene los catálogos y puede corregir o eliminar registros |
| Push | Cada cuenta administra su propia suscripción | El usuario puede probar su dispositivo. Administración con MFA puede solicitar un envío masivo |

Para un Líder de Proyecto, registrar cada asignación con el UUID de la cuenta y el identificador del proyecto en `ng_private.user_projects`, desde una sesión administrativa de base de datos. Los demás alcances son globales para los roles habilitados. La interfaz usa la misma matriz de navegación en el menú y en las pantallas. Supabase impone sus permisos por separado.

## Secretos e integraciones

1. Revocar en el proveedor cualquier secreto que llegó a Git y configurar su reemplazo. Revisar Mi Chamba y WhatsApp/Meta, así como el uso desde la fecha de exposición. Limpiar el historial requiere coordinar ramas y clones. [GitHub y credenciales expuestas](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
2. Usar `.env.example` para Node y Vite y `supabase/functions/.env.example` para Edge Functions. Vite recibe la URL y la clave pública de Supabase. El servidor conserva `SUPABASE_SERVER_KEY` y los secretos de WhatsApp. Configurar el número de Meta y los remitentes permitidos en formato internacional para que el bot procese los cambios de embarques.
3. Configurar `GEMINI_API_KEY`, `VAPID_PRIVATE_KEY`, `EDGE_ALLOWED_ORIGINS`, `TIVE_WEBHOOK_SECRET`, `DB_WEBHOOK_SECRET` y las credenciales de WhatsApp en Edge Function Secrets. Incluye en `EDGE_ALLOWED_ORIGINS` los orígenes HTTPS de la aplicación y solo los orígenes de desarrollo o nativos que se utilicen. El cliente Electron que abre archivos locales envía un origen `null`, que requiere configuración explícita para invocar Edge Functions. Migrar las variables antiguas `phone_number_id_wpp` y `whatsapp_token_` a `WHATSAPP_PHONE_ID` y `WHATSAPP_ACCESS_TOKEN`.
4. Configurar el webhook Tive sobre HTTPS con `x-tive-signature`. Registrar su `secretKey` como `TIVE_WEBHOOK_SECRET`. Para los Webhooks de la base de datos usar otro secreto y la cabecera `x-ng-db-webhook-secret`. Configurar las altas y los cambios de estatus en embarques y las altas en `usa_shipment_incidents`. El punto de entrada es `supabase/functions/tive-webhook/index.ts`. [Firmas de webhook Tive](https://developers.tive.com/docs/webhook-signatures)
5. Pedir a cada usuario volver a activar las notificaciones push después del despliegue. Los envíos se limitan a suscripciones vinculadas al ID autenticado.

## Validación y despliegue

1. Preparar un entorno Supabase de pruebas con el esquema y una copia anonimizada de los datos operativos. Las migraciones del repositorio son incrementales. `supabase/tests/bootstrap.sql` simula el esquema mínimo para CI.
2. Revisar los roles y asignaciones de proyecto. Comprobar MFA con las cuentas administrativas, los tipos de columnas, los lotes marcados como `Cargado` sin embarque y los lotes compartidos entre folios. Verificar una restauración de respaldo.
3. Aplicar las migraciones en pruebas, configurar los webhooks y desplegar las Edge Functions y el frontend como una sola entrega. Probar cada rol con su cuenta, un alta fallida con varios lotes, el borrado de la última unidad, una incidencia sin conexión y una alerta de cada proveedor.
4. Verificar que **Verify nGlobal** pasó compilación, TypeScript, Deno, pruebas de permisos y escaneo de secretos. Configurar esos trabajos como requisitos de la rama principal en GitHub.
5. Tras activar los cambios, revisar rechazos de origen, fallos de permisos y resultados de entrega. Un envío aceptado por el proveedor no acredita recepción en el dispositivo. Revisar los resultados indeterminados antes de reenviar.
6. Las incidencias históricas guardadas en el embarque siguen visibles. Si un dispositivo conserva registros de la cola local antigua sin identidad de cuenta, verificar su autor y embarque antes de recuperar el contenido.
