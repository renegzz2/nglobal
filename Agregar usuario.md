Ingresa a tu panel de control en Supabase y abre tu proyecto.
En el menú lateral izquierdo, haz clic en Authentication.
Asegúrate de estar en la pestaña Users.
Haz clic en el botón verde superior derecho que dice "Add user".
Tienes dos opciones principales:
Send invitation: Envía un correo electrónico a la persona con un enlace para que ellos configuren su propia contraseña. (Recomendado)
Create new user: Tú escribes el correo y le asignas una contraseña temporal que le deberás compartir manualmente.
Paso 2: Asignarle un Rol (Muy importante)
Si el usuario recién creado intenta entrar, el sistema le bloqueará el acceso mostrando un mensaje de "Rol no configurado". Para que pueda usar la app, debes asignarle su rol interno.

Supabase guarda esto en el perfil del usuario (dentro de un objeto JSON llamado user_metadata o app_metadata). La forma más fácil de hacerlo desde el dashboard de Supabase (sin usar comandos) es:

En la misma pantalla de Authentication > Users, busca al usuario que acabas de agregar en la lista.
Del lado derecho de su fila de datos, haz clic en el botón de opciones (tres puntitos ... horizontales).
Selecciona Edit User.
Desplázate hacia abajo hasta la sección que dice User Metadata (JSON).
Ahí dentro, debes escribir el rol de la persona y su nombre en formato JSON (asegúrate de no borrar las llaves { }), de esta forma:a