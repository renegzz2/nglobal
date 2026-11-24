# nglobal
App Don Pedro

## Embarques USA

La captura importa el Excel, solicita las cinco fotos y confirma el embarque, sus partidas y el despacho de Operaciones USA en una sola transacción. Las fotos quedan en el bucket privado `usa-embarques-evidencias`. Para consultarlas, abre el despacho y usa **Evidencias del embarque → Ver fotos**.

Para probar la entrega:

1. En Supabase de pruebas, verifica el esquema que usan `usa_embarques`, `usa_embarques_detalle` y `usa_shipment_reports`. Aplica la migración `202611240001_finalizar_embarque_usa.sql` antes de desplegar la web. La migración crea el bucket privado y las funciones que usa la pantalla.
2. Usa una cuenta operativa con rol asignado en `app_metadata.role`. El rol definido solo en `user_metadata` no concede permisos para finalizar ni para leer evidencias.
3. Importa un Excel con variantes de producto, adjunta las cinco fotos y confirma. Abre Operaciones USA, busca el folio y verifica que aparezca un solo despacho, que cuadren sus cajas y que se puedan abrir las fotos después de recargar. Reintenta desde la misma captura si la conexión falla durante el guardado.
4. Ejecuta `npm ci`, `npm run test:embarques` y `npm run build`. Para las pruebas de la migración, ejecuta `tests/sql/embarques-schema.sql`, la migración y `tests/sql/embarques-finalize.sql`, en ese orden, sobre una base PostgreSQL vacía dedicada a pruebas.
