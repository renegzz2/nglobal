# nglobal
App Don Pedro

## Embarques USA

La captura importa el Excel, solicita las cinco fotos y confirma el embarque, sus partidas y un solo despacho de Operaciones USA en una sola transacción. El folio del despacho tiene el formato `EMB-000001`, con seis dígitos. Las fotos quedan en el bucket privado `usa-embarques-evidencias`. Para consultarlas, abre el despacho y usa **Evidencias del embarque → Ver fotos**.

Para probar la entrega:

1. En Supabase de pruebas, verifica el esquema que usan `usa_embarques`, `usa_embarques_detalle` y `usa_shipment_reports`. Aplica las migraciones de Embarques en orden: `202611240001_finalizar_embarque_usa.sql`, `202611240002_folio_embarque_usa_seis_digitos.sql` y `202611250001_celular_operador_embarque_usa.sql`. Si el guardado con folio de seis dígitos ya está operativo, aplica únicamente la migración del celular antes de publicar esta versión.
2. Usa una cuenta operativa con rol asignado en `app_metadata.role`. El rol definido solo en `user_metadata` no concede permisos para finalizar ni para leer evidencias.
3. Importa el Excel en el paso 1 y verifica los datos de salida y el celular. Revisa los productos y las tarimas en el paso 2, adjunta las cinco fotos y confirma. Abre Operaciones USA, busca el folio y verifica que aparezca un solo despacho, que cuadren sus cajas y que se puedan abrir las fotos después de recargar.
4. Ejecuta `npm ci`, `npm run test:embarques` y `npm run build`. Para las pruebas SQL, ejecuta `tests/sql/embarques-schema.sql`, las migraciones de Embarques en orden y `tests/sql/embarques-finalize.sql` sobre una base PostgreSQL vacía dedicada a pruebas.
