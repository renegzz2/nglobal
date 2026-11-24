# nglobal
App Don Pedro

## Embarques USA

La captura importa el Excel, solicita las cinco fotos y confirma el embarque, sus partidas y un solo despacho de Operaciones USA en una sola transacción. El folio del despacho tiene el formato `EMB-000001`, con seis dígitos. Las fotos quedan en el bucket privado `usa-embarques-evidencias`. Para consultarlas, abre el despacho y usa **Evidencias del embarque → Ver fotos**.

Para probar la entrega:

1. En Supabase de pruebas, verifica el esquema que usan `usa_embarques`, `usa_embarques_detalle` y `usa_shipment_reports`. Aplica `202611240001_finalizar_embarque_usa.sql` y luego `202611240002_folio_embarque_usa_seis_digitos.sql` antes de desplegar la web. Si ya existe el bucket privado y la primera migración se aplicó, ejecuta solo la segunda.
2. Usa una cuenta operativa con rol asignado en `app_metadata.role`. El rol definido solo en `user_metadata` no concede permisos para finalizar ni para leer evidencias.
3. Importa un Excel con variantes de producto, adjunta las cinco fotos y confirma. Abre Operaciones USA, busca el folio y verifica que aparezca un solo despacho, que cuadren sus cajas y que se puedan abrir las fotos después de recargar. Reintenta desde la misma captura si la conexión falla durante el guardado.
4. Ejecuta `npm ci`, `npm run test:embarques` y `npm run build`. Para las pruebas SQL, ejecuta `tests/sql/embarques-schema.sql`, las dos migraciones de Embarques en orden y `tests/sql/embarques-finalize.sql` sobre una base PostgreSQL vacía dedicada a pruebas.
