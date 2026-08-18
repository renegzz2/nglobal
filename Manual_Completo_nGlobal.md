# Manual de Procesos Completo - nGlobal Logistics

## 1. Objetivo del documento
Este manual define el funcionamiento operativo, administrativo y técnico de la aplicación **nGlobal Logistics**, con base en el comportamiento real del sistema. Su propósito es estandarizar el uso de la plataforma, aclarar responsabilidades por rol y documentar el flujo completo desde la planeación comercial hasta la liquidación del flete y el cierre ejecutivo.

## 2. Alcance
La aplicación cubre los siguientes frentes:

- Planeación estratégica semanal por proyecto y producto.
- Programación operativa de cargas por parte de líderes.
- Generación y control de viajes hacia Estados Unidos.
- Monitoreo satelital y actualización automática de estatus.
- Registro de incidencias, auditoría y calificación de transportistas.
- Control administrativo del pago de fletes.
- Gestión de inventario y transferencias internas.
- Reporteo ejecutivo y seguimiento de cumplimiento.
- Mensajería interna, notificaciones push y apoyo con IA.

## 3. Descripción general del sistema
nGlobal Logistics es una plataforma logística multirol desarrollada con **React + Vite**, con autenticación y base de datos en **Supabase**, soporte de escritorio con **Electron**, soporte móvil con **Capacitor**, mensajería en tiempo real mediante **WebSocket**, monitoreo de rastreo vía **Tive**, y servicios auxiliares integrados para notificaciones push y asistencia con IA.

La operación central del sistema se construye sobre tres capas:

1. **Planeación**
   Captura metas, presupuestos, semanas fiscales y volúmenes esperados.
2. **Operación**
   Programa lotes, genera embarques, monitorea trayectos y registra incidencias.
3. **Administración y control**
   Liquida fletes, controla inventarios y mide cumplimiento ejecutivo.

## 4. Arquitectura funcional

### 4.1 Frontend
- Aplicación web principal en React.
- Navegación por vistas según rol.
- Carga diferida de módulos pesados.

### 4.2 Backend y persistencia
- Supabase para autenticación, base de datos, funciones Edge y tiempo real.
- WebSocket local en `server.ts` para chat y difusión operativa.

### 4.3 Canales externos
- **Tive** para eventos de rastreo y telemetría.
- **WhatsApp Webhook** para recepción de mensajes operativos de transportistas.
- **Push Notifications** para alertas críticas.
- **Gemini Chat** para asistencia conversacional y análisis de imagen.

## 5. Roles y alcance operativo

### 5.1 Administrador / Gerencia
Acceso total. Puede operar todos los módulos, gestionar catálogos, consultar tableros, crear y editar planeación, registrar viajes, monitorear flota, administrar pagos y revisar inventario.

### 5.2 Dirección / Subdirección
Enfoque estratégico y ejecutivo. Acceso a:

- Dashboard.
- Alcance y Metas.
- Reporte Ejecutivo.
- Consola Radar.
- Operaciones USA.
- Control de Pagos.
- Configuración.

### 5.3 Líder de Proyecto
Responsable de programar carga en origen. Acceso a:

- Alcance y Metas.
- Programación Líder.
- Configuración.

### 5.4 Coordinador
Responsable de operación y seguimiento. Acceso a:

- Operaciones USA.
- Consola Radar.
- Inventario.
- Configuración.

### 5.5 Subgerencia / Administrativo
Responsables de control documental y seguimiento administrativo. Acceso a:

- Operaciones USA.
- Archivos Maestros.
- Consola Radar.
- Control de Pagos.
- Inventario.
- Configuración.

## 6. Módulos del sistema

### 6.1 Ecosistema Global
Dashboard principal con KPIs, alertas por excepción, viajes recientes y accesos rápidos por zona funcional.

### 6.2 Archivos Maestros
Catálogos de operación:

- Proyectos.
- Productos.
- Clientes.
- Líneas de transporte.
- Unidades.
- Tipos de unidad.
- Estatus.
- Escalas.
- Responsables.
- Brokers.
- Configuración Tive.

### 6.3 Alcance y Metas
Planeación estratégica por semana fiscal, proyecto y producto. Calcula cajas, pallets, unidades recomendadas y seguimiento contra real.

### 6.4 Programación Líder
Captura lotes programados de salida, con cálculo de pallets, fecha de salida, fecha estimada de arribo, consolidaciones y promoción a embarque.

### 6.5 Operaciones USA
Centro operativo de viajes. Permite crear, editar, consultar, cerrar, calificar, registrar incidencias y alternar entre vista activa e histórica.

### 6.6 Consola Radar
Vista embebida del portal Tive para rastreo satelital y seguimiento visual.

### 6.7 Control Pagos
Liquidación administrativa de cada viaje: flete base, extras, multas, factura, folio fiscal, cartera y estatus de pago.

### 6.8 Inventario Global
Control de stock por proyecto y producto, carga de cosecha y transferencias internas.

### 6.9 Reporte Ejecutivo
Cruza proyecciones con operación real para medir cumplimiento por producto y por proyecto.

### 6.10 Mensajería
Canal de comunicación interna por usuario o por rol, sobre WebSocket autenticado.

### 6.11 Políticas y Seguridad
Consulta de privacidad, términos, eliminación de datos y postura general de seguridad.

## 7. Flujo macro del negocio
El proceso estándar de la aplicación sigue este orden:

1. Dirección o planeación captura metas semanales en **Alcance y Metas**.
2. Líder de proyecto genera lotes en **Programación Líder**.
3. Cuando la unidad llega a cargar, el lote se promueve a viaje en **Operaciones USA**.
4. Coordinación asigna línea, unidad, operador, tracker, cajas reales y datos del traslado.
5. El viaje entra en monitoreo con Tive, actualizaciones manuales, incidencias y mensajes de operador.
6. Al arribo se cierra el viaje y el sistema obliga a realizar la calificación del transportista.
7. El área administrativa liquida el flete, registra factura y controla el paso a pago.
8. Dirección revisa cumplimiento operativo y comercial en el tablero ejecutivo.

## 8. Proceso 1 - Acceso y autenticación

### 8.1 Objetivo
Garantizar que solo personal autorizado entre al sistema y vea únicamente lo permitido por su rol.

### 8.2 Entradas
- Correo corporativo.
- Contraseña o enlace mágico.
- Metadatos de rol en Supabase Auth.

### 8.3 Flujo
1. El usuario accede a la pantalla de login.
2. Elige autenticación por contraseña o por enlace mágico.
3. Supabase valida credenciales.
4. El sistema resuelve el rol desde `app_metadata` o `user_metadata`.
5. Se construye el perfil local de sesión.
6. La aplicación habilita solo las vistas permitidas para ese rol.

### 8.4 Controles
- Si faltan `VITE_SUPABASE_URL` o `VITE_SUPABASE_ANON_KEY`, la app no inicia operación.
- Si no existe rol válido, no se habilita navegación funcional.
- La sesión se sincroniza con Supabase y se limpia al cerrar sesión.

## 9. Proceso 2 - Administración de archivos maestros

### 9.1 Objetivo
Mantener catálogos consistentes para alimentar planeación, operación, monitoreo e inventario.

### 9.2 Responsables
- Alta y edición: Administrador y Gerencia.
- Consulta: Subgerencia y Administrativo.

### 9.3 Entidades principales
- `usa_proyectos`
- `usa_productos`
- `usa_clientes`
- `usa_lineas_transporte`
- `usa_unidades_transporte`
- `tipo_unidad`
- `usa_estatus`
- `usa_escalas`
- `usa_responsables`
- `tive_alert_config`

### 9.4 Reglas operativas
- Los proyectos y clientes deben tener coordenadas y radio de geocerca cuando se quiera usar automatización por ubicación.
- Los productos deben incluir, cuando aplique, cajas por pallet y temperatura óptima.
- Las unidades deben asociarse a una línea de transporte.
- Los tipos de unidad alimentan cálculos de capacidad en planeación y programación.

## 10. Proceso 3 - Planeación estratégica semanal

### 10.1 Objetivo
Traducir metas comerciales en volumen operativo semanal.

### 10.2 Módulo
**Alcance y Metas**

### 10.3 Datos capturados
- Semana fiscal.
- Proyecto.
- Producto.
- Cliente.
- Presupuesto monetario.
- Referencias de venta.
- Precio compra / venta.
- Proyección de cajas.
- Desglose diario.
- Línea y unidad sugerida.
- Estatus de autorización.

### 10.4 Flujo
1. Dirección/Subdirección captura metas por proyecto y producto.
2. El sistema calcula base logística para pallets y camiones requeridos.
3. Se puede operar en modo cajas o modo camiones.
4. Se puede autorizar o rechazar planeación.
5. Líder y coordinación consumen esa meta como referencia operativa.

### 10.5 Salidas
- Metas semanales autorizadas.
- Referencia de demanda para programación líder.
- Comparativo contra ventas reales desde embarques despachados.

### 10.6 Controles
- El sistema trabaja por semana fiscal.
- Las metas autorizadas sirven como bolsa operativa para programación.
- El orden visual semanal puede reorganizarse y se conserva localmente.

## 11. Proceso 4 - Programación líder de carga

### 11.1 Objetivo
Registrar lo que saldrá físicamente desde origen y preparar los lotes para despacho.

### 11.2 Módulo
**Programación Líder**

### 11.3 Entradas
- Metas autorizadas.
- Catálogo de productos.
- Catálogo de proyectos.
- Cliente destino.

### 11.4 Datos del lote
- `loteId`
- Semana fiscal
- Proyecto
- Fecha salida
- Fecha llegada estimada
- Pallets
- Cajas
- Productos y cantidades
- Temperatura ideal
- Comentarios
- Estatus logístico USA

### 11.5 Flujo
1. El líder crea un lote.
2. Selecciona proyecto, cliente, fecha de salida y productos.
3. El sistema calcula automáticamente:
   - cajas totales
   - pallets estimados
   - temperatura promedio objetivo
   - unidad recomendada
4. Si hay consolidación, se vincula un lote socio.
5. El lote nace con estatus **Programado**.
6. Cuando el camión llega a cargar, el usuario ejecuta **Despachar**.

### 11.6 Reglas clave
- El lote siempre inicia en `Programado`.
- Una consolidación agrupa dos lotes y forma una salida conjunta.
- La fecha estimada de llegada puede calcularse a partir del tiempo óptimo del proyecto.
- El sistema permite producto manual si todavía no existe en catálogo.

### 11.7 Salida del proceso
El lote se convierte en base para un viaje de **Operaciones USA**.

## 12. Proceso 5 - Promoción de lote a viaje

### 12.1 Objetivo
Convertir la intención programada en un embarque operativo monitoreable.

### 12.2 Flujo
1. Desde Programación Líder se pulsa **Despachar**.
2. El sistema abre o genera la estructura del viaje en Operaciones USA.
3. Se conservan referencias al lote original y, si aplica, al lote secundario.
4. Los lotes promovidos cambian de `Programado` a `Cargado`.

### 12.3 Datos transferidos
- Proyecto
- Cliente
- Productos
- Cajas
- Temperatura ideal
- Consolidación
- IDs de lote origen

### 12.4 Control de integridad
- Si un embarque se elimina después, los lotes relacionados vuelven a `Programado`.

## 13. Proceso 6 - Registro y operación del viaje

### 13.1 Objetivo
Controlar cada embarque activo hasta su cierre.

### 13.2 Módulo
**Operaciones USA**

### 13.3 Datos operativos del viaje
- `tripId`
- Proyecto y cliente
- Línea transportista
- Unidad de transporte
- Operador
- Caja / sello
- Tipo de unidad
- Fecha salida
- Fecha real salida
- ETA / llegada
- Temperatura
- Tracker Tive
- Agente transfer
- Teléfono transfer
- Costo de flete
- Incidencias
- Comentarios

### 13.4 Flujo operativo
1. Coordinación crea o completa el viaje.
2. Asigna línea, unidad, operador y tracker.
3. Audita cajas reales por producto.
4. Define estatus inicial del viaje, normalmente `Confirmado`.
5. El sistema lo deja disponible en vista activa.
6. El viaje entra a monitoreo por Tive y actualizaciones manuales.

### 13.5 Reglas de negocio
- Solo roles operativos/autorizados pueden modificar embarques.
- El sistema separa vista activa de históricos.
- Los viajes con `Finalizado` o `Cancelado` salen de la operación viva.

## 14. Proceso 7 - Monitoreo satelital y actualización automática

### 14.1 Objetivo
Detectar ubicación, temperatura y eventos críticos en tiempo real.

### 14.2 Fuentes
- Tabla `tive_events`.
- Portal Tive embebido en la Consola Radar.
- Configuración de geocercas de proyecto, escala y cliente.

### 14.3 Lógica automática
El proveedor de monitoreo ejecuta ciclos de lectura y:

- recupera el último evento del tracker
- mide antigüedad del dato
- estima velocidad actual o promedio
- evalúa entrada/salida de geocercas
- actualiza el estatus del viaje según ubicación detectada

### 14.4 Hitos automáticos
- Entrada a origen: `En [Proyecto]`
- Salida de origen: `En Tránsito`
- Entrada a escala técnica: `En [Escala]`
- Salida de escala: `En Tránsito`
- Arribo a cliente: `En [Cliente]`

### 14.5 Efectos automáticos
- Se registra `arrival_date_time` cuando detecta arribo a cliente.
- Se activa `rating_pending` para obligar auditoría del transportista.
- Se generan notificaciones operativas.

### 14.6 Alertas visibles
- excursión de temperatura
- falta de señal
- anomalías por ubicación
- viajes que requieren intervención crítica

## 15. Proceso 8 - Seguimiento manual, incidencias y mensajería

### 15.1 Incidencias manuales
Durante el trayecto, coordinación puede registrar incidencias como:

- retrasos
- ponchaduras
- aduana
- desvíos
- observaciones del viaje

Estas incidencias quedan integradas al expediente del embarque.

### 15.2 Comentarios de alerta
En Dashboard, las alertas críticas aceptan comentario operativo para dejar evidencia de seguimiento.

### 15.3 Mensajería interna
La aplicación cuenta con chat en tiempo real:

- por usuario
- por rol

El servidor WebSocket autentica la sesión con el token actual de Supabase antes de aceptar mensajes.

### 15.4 Integración WhatsApp
El servidor recibe mensajes entrantes del webhook de WhatsApp y:

- valida firma del proveedor
- restringe remitentes si existe lista permitida
- busca viajes activos asociados al teléfono
- intenta inferir estatus por palabras clave
- actualiza el viaje si la transición es válida
- difunde el mensaje a roles de supervisión conectados

### 15.5 Estatus detectables por WhatsApp
- `En Tránsito`
- `Entregado`
- `Retrasado`
- `Hold`
- `Pendiente`

## 16. Proceso 9 - Cierre de viaje y auditoría de transportista

### 16.1 Objetivo
Cerrar formalmente un viaje y dejar evidencia de evaluación del servicio.

### 16.2 Flujo
1. El operador administrativo o coordinador marca el viaje como finalizado.
2. El sistema registra fecha/hora de arribo final.
3. El viaje se marca con `rating_pending = true`.
4. Se abre el modal de calificación del transportista.
5. El usuario captura:
   - puntuación
   - comentarios
6. Se guarda la auditoría y el viaje queda sin pendiente de evaluación.

### 16.3 Controles
- No debe cerrarse un viaje sin dejar calificación.
- Un viaje finalizado ya no debe aceptar transiciones operativas automáticas por WhatsApp.

## 17. Proceso 10 - Liquidación y pago de fletes

### 17.1 Objetivo
Controlar el costo real del viaje y su transición administrativa hasta pago.

### 17.2 Módulo
**Control Pagos**

### 17.3 Campos de liquidación
- flete base
- costos extra
- multas
- pagador del flete
- revisor
- factura recibida
- folio de factura del transportista
- folio fiscal
- pasar a pago
- flete en cartera
- estatus de pago
- comentarios

### 17.4 Cálculo central
**Flete final = Flete base + Extras - Multas**

### 17.5 Flujo
1. El viaje aparece en Control Pagos cuando está en operación o concluido.
2. El administrativo abre la ficha de liquidación.
3. Captura o ajusta importes.
4. Registra documentos fiscales.
5. Marca si la factura fue recibida.
6. Marca si el viaje pasa a pago.
7. Actualiza estatus administrativo:
   - Pendiente
   - Programado
   - En Tesorería
   - Liquidado / Pagado

### 17.6 Trazabilidad automática
- Si se marca `invoiceReceived`, se guarda fecha de recepción.
- Si se marca `passedToPayment`, se guarda fecha de envío a pago.

## 18. Proceso 11 - Control de inventario y transferencias

### 18.1 Objetivo
Mantener visibilidad del stock por proyecto y mover existencias entre sedes de forma controlada.

### 18.2 Módulo
**Inventario Global**

### 18.3 Datos principales
- proyecto
- producto
- stock disponible
- stock reservado
- transferencias

### 18.4 Flujo de carga de stock
1. El usuario registra cosecha o incremento de existencias.
2. La tabla `inventario_proyectos` refleja el nuevo saldo.
3. La vista se actualiza en tiempo real.

### 18.5 Flujo de transferencia
1. Se crea una solicitud en `transferencias_stock`.
2. La transferencia nace en estatus `Pendiente`.
3. El responsable destino decide aceptar o rechazar.
4. Si acepta:
   - se valida stock suficiente en origen
   - se descuenta stock origen
   - se suma o crea stock destino
   - la transferencia pasa a `Completado`
5. Si rechaza:
   - la transferencia pasa a `Rechazado`

### 18.6 Controles
- No se puede completar una transferencia sin stock suficiente en origen.
- Inventario y transferencias están suscritos a tiempo real.

## 19. Proceso 12 - Reporteo ejecutivo y cumplimiento

### 19.1 Objetivo
Medir si la ejecución real está cumpliendo la planeación financiera y operativa.

### 19.2 Fuente de datos
- `proyecciones_estrategicas`
- `usa_shipment_reports`
- `usa_productos`
- `usa_proyectos`

### 19.3 Métricas principales
- referencia 2025
- presupuesto
- proyección de cajas
- real acumulado
- cumplimiento por producto
- cumplimiento por proyecto
- calidad logística por tránsito

### 19.4 Modos de reporte
- por semana fiscal
- por rango de fechas
- modo proyección
- modo cierre

### 19.5 Uso esperado
- Dirección revisa avance vs objetivo.
- Operación identifica desvíos.
- Administración exporta evidencias en CSV o PDF.

## 20. Proceso 13 - Dashboard y control por excepción

### 20.1 Objetivo
Concentrar visibilidad rápida de la operación y priorizar intervención humana.

### 20.2 Funciones
- KPIs de total, activos y finalizados.
- Radar de excepciones críticas.
- Comentarios de seguimiento.
- Accesos rápidos por zona.
- Tendencia semanal de embarques.

### 20.3 Regla principal
El Dashboard no sustituye la operación detallada; funciona como centro de mando y escalamiento.

## 21. Proceso 14 - Asistencia con IA y análisis visual

### 21.1 Chat IA
La app consume la función `gemini-chat` para responder preguntas operativas.

### 21.2 Calidad IA
También puede enviar imagen más prompt para análisis visual, útil en controles de calidad.

### 21.3 Uso esperado
- consultas rápidas
- apoyo operativo
- análisis de evidencia fotográfica

## 22. Reglas de transición de estatus
El sistema contiene restricciones de transición, especialmente en el servidor y en automatismos.

### 22.1 Estados relevantes
- Programado
- Pendiente
- Confirmado
- Unidad en Empaque
- En Tránsito
- Retrasado
- Hold
- Entregado
- Finalizado
- Cancelado

### 22.2 Restricciones
- `Finalizado` y `Cancelado` son estados de cierre.
- No deben recibir nuevas transiciones operativas.
- WhatsApp solo actualiza si la transición propuesta es válida.

## 23. Controles operativos y administrativos

### 23.1 Controles de captura
- Campos estructurales dependen de catálogos maestros.
- Productos y proyectos manuales deben usarse solo cuando el catálogo no esté actualizado.

### 23.2 Controles de rol
- El menú y la capacidad de edición dependen del rol autenticado.

### 23.3 Controles de trazabilidad
- fechas automáticas de pago y factura
- bitácora en comentarios
- incidencias por viaje
- rating del transportista

### 23.4 Controles de monitoreo
- datos Tive con vigencia
- geocercas para hitos
- notificaciones por excepción

## 24. Operación diaria recomendada

### 24.1 Inicio de jornada
1. Validar acceso y notificaciones push.
2. Revisar Dashboard.
3. Revisar lotes programados del día.
4. Revisar viajes activos y alertas críticas.
5. Validar responsables en turno.

### 24.2 Durante la jornada
1. Promover lotes a viaje conforme arriban unidades.
2. Completar datos operativos faltantes.
3. Registrar incidencias y observaciones.
4. Atender mensajes internos y WhatsApp.
5. Vigilar desvíos de temperatura y tiempos.

### 24.3 Cierre de jornada
1. Finalizar viajes concluidos.
2. Capturar calificación del transportista.
3. Avanzar liquidaciones pendientes.
4. Revisar transferencias de inventario.
5. Exportar reporte si aplica.

## 25. Responsabilidades por área

### 25.1 Dirección / Subdirección
- definir metas
- autorizar planeación
- revisar cumplimiento
- tomar decisiones correctivas

### 25.2 Líder de Proyecto
- programar lotes
- asegurar calidad y volumen declarado
- preparar salida de carga

### 25.3 Coordinación
- crear y mantener viajes activos
- monitorear ruta
- registrar incidencias
- cerrar operación diaria

### 25.4 Subgerencia / Administrativo
- validar información documental
- liquidar fletes
- controlar pago y cartera
- consultar y mantener catálogos según permisos

### 25.5 Sistemas / Soporte
- mantener variables de entorno
- monitorear servicios Supabase, WebSocket y Edge Functions
- atender fallas de integración

## 26. Dependencias técnicas

### 26.1 Variables de entorno mínimas
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### 26.2 Servicios integrados
- Supabase Auth
- Supabase Database
- Supabase Realtime
- Supabase Edge Functions
- Tive
- WhatsApp Webhook
- Web Push
- Gemini

### 26.3 Plataformas soportadas
- Web
- Escritorio con Electron
- Android con Capacitor

## 27. Tablas clave del sistema

### 27.1 Planeación
- `proyecciones_estrategicas`

### 27.2 Programación
- `lider_programacion_usa_reports`

### 27.3 Operación
- `usa_shipment_reports`
- `usa_shipment_alerts`
- `tive_events`

### 27.4 Catálogos
- `usa_proyectos`
- `usa_productos`
- `usa_clientes`
- `usa_lineas_transporte`
- `usa_unidades_transporte`
- `tipo_unidad`
- `usa_escalas`
- `usa_responsables`
- `usa_estatus`

### 27.5 Administración
- `inventario_proyectos`
- `transferencias_stock`
- `push_subscriptions`

## 28. Riesgos operativos conocidos
- Catálogos incompletos reducen automatización.
- Ausencia de coordenadas impide geocercas correctas.
- Tracker Tive sin datos deja monitoreo parcial.
- Teléfono transfer mal capturado impide actualización por WhatsApp.
- Viajes sin cierre formal afectan métricas y pago.

## 29. Buenas prácticas obligatorias
- Mantener actualizados productos, proyectos y clientes antes de operar.
- No usar registros manuales si el maestro ya existe.
- Cerrar cada viaje con calificación.
- Registrar factura y folio fiscal en cuanto se reciban.
- Atender transferencias pendientes el mismo día.
- Validar alertas críticas antes del cierre de turno.

## 30. Conclusión
La aplicación nGlobal Logistics no es solo un tablero de consulta; es un sistema de ejecución operativa con trazabilidad de punta a punta. La secuencia correcta de uso es:

**Planeación -> Programación -> Despacho -> Monitoreo -> Cierre -> Liquidación -> Cumplimiento**

Seguir este flujo garantiza integridad de datos, control operativo, trazabilidad administrativa y visibilidad ejecutiva.
