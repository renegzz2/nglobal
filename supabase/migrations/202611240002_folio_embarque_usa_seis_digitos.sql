-- Update the installed finalizer without changing existing shipments or reports.
alter table public.usa_embarques
  add column if not exists dispatch_activation_enabled boolean not null default true;

create sequence if not exists ng_embarques_private.folios_embarque
  as integer minvalue 1 maxvalue 999999 start with 1 no cycle;
revoke all on sequence ng_embarques_private.folios_embarque from public, anon, authenticated;

create or replace function public.ng_finalizar_embarque_usa(p_solicitud uuid, p_datos jsonb, p_partidas jsonb, p_fotos jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare
  cuenta uuid := auth.uid();
  guardado ng_embarques_private.finalizaciones;
  folio text;
  folio_candidato text;
  cliente text;
  proyecto text;
  linea text;
  foto text;
  tipo text;
  ruta text;
  productos jsonb;
  cajas numeric;
  cabecera public.usa_embarques;
  despacho public.usa_shipment_reports;
  embarque_id_guardado text;
  despacho_id_guardado text;
  tipos constant text[] := array['remision','termografo','diesel','refacciones','temperatura'];
begin
  if not ng_embarques_private.puede_capturar() then
    raise exception 'Sin permiso para finalizar embarques USA.' using errcode = '42501';
  end if;
  if p_solicitud is null then raise exception 'Falta el identificador de la solicitud.' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_solicitud::text, 0));
  select * into guardado from ng_embarques_private.finalizaciones f where f.solicitud = p_solicitud;
  if found then
    if guardado.usuario <> cuenta then raise exception 'Solicitud no disponible.' using errcode = '42501'; end if;
    return jsonb_build_object('embarque_id', guardado.embarque_id, 'despacho_id', guardado.despacho_id, 'folio', guardado.folio);
  end if;

  if jsonb_typeof(p_datos) is distinct from 'object' or jsonb_typeof(p_partidas) is distinct from 'array'
     or jsonb_typeof(p_fotos) is distinct from 'object' then
    raise exception 'Datos de embarque inválidos.' using errcode = '22023';
  end if;

  if jsonb_array_length(p_partidas) not between 1 and 5000 or not (p_fotos ?& tipos)
     or (select count(*) from jsonb_object_keys(p_fotos)) <> 5 then
    raise exception 'Se requieren partidas y las cinco evidencias.' using errcode = '22023';
  end if;

  foreach tipo in array tipos loop
    ruta := cuenta::text || '/' || p_solicitud::text || '/' || tipo || '-';
    foto := p_fotos->>tipo;
    if foto is null or foto !~ ('^' || ruta || '[0-9a-f-]{36}[.](jpg|png|webp|heic|heif)$')
       or not exists (
         select 1 from storage.objects o
         where o.bucket_id = 'usa-embarques-evidencias' and o.owner_id = cuenta::text and o.name = foto
       ) then
      raise exception 'Falta la evidencia de %.', tipo using errcode = '22023';
    end if;
  end loop;

  select coalesce(nullif(to_jsonb(c)->>'nombre_cliente', ''), nullif(to_jsonb(c)->>'nombre', ''),
                  nullif(to_jsonb(c)->>'razon_social', ''), c.id::text)
    into cliente from public.usa_clientes c where c.id::text = p_datos->>'cliente_id';
  select p.nombre into proyecto from public.usa_proyectos p where p.id::text = p_datos->>'proyecto_id';
  if cliente is null or proyecto is null then raise exception 'Selecciona un cliente y un proyecto vigentes.' using errcode = '22023'; end if;
  if nullif(p_datos->>'sucursal_id', '') is not null and not exists (
    select 1 from public.usa_sucursales s where s.id::text = p_datos->>'sucursal_id' and s.proyecto_id::text = p_datos->>'proyecto_id'
  ) then raise exception 'La sucursal no pertenece al proyecto.' using errcode = '22023'; end if;
  if nullif(p_datos->>'transportista_id', '') is null then
    linea := nullif(btrim(p_datos->>'transportista_manual'), '');
  else
    select coalesce(nullif(to_jsonb(t)->>'nombre_linea', ''), nullif(to_jsonb(t)->>'nombre', ''),
                    nullif(to_jsonb(t)->>'razon_social', ''), nullif(to_jsonb(t)->>'linea', ''), t.id::text)
      into linea from public.usa_lineas_transporte t where t.id::text = p_datos->>'transportista_id';
  end if;
  if linea is null or exists (
    select 1 from unnest(array['fecha_salida','operador','placas_caja','placas_tractor','pies','termografo','temperatura','economico','termo_continuo']) campo
    where nullif(btrim(p_datos->>campo), '') is null
  ) or nullif(p_datos->>'temperatura', '')::numeric in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
     or nullif(p_datos->>'fecha_salida', '')::timestamptz in ('infinity'::timestamptz, '-infinity'::timestamptz) then
    raise exception 'Completa los datos de salida del embarque.' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_partidas) p
    where not exists (select 1 from public.usa_productos c where c.id::text = p->>'producto_id')
      or nullif(btrim(p->>'numero_pallet'), '') is null
      or nullif(btrim(p->>'remision'), '') is null
      or nullif(btrim(p->>'mid'), '') is null
      or jsonb_typeof(p->'cantidad_cajas') is distinct from 'number'
      or (p->>'cantidad_cajas')::numeric <= 0
      or (p->>'cantidad_cajas')::numeric <> trunc((p->>'cantidad_cajas')::numeric)
  ) then raise exception 'Revisa el producto y los datos de cada partida.' using errcode = '22023'; end if;

  select jsonb_agg(jsonb_build_object('product_id', p->>'producto_id', 'quantity', p->'cantidad_cajas',
      'projected_qty', p->'cantidad_cajas', 'real_qty', p->'cantidad_cajas', 'invoice_number', p->>'remision',
      'remision', p->>'remision', 'mid', p->>'mid', 'lote_pt', p->>'lote_pt', 'numero_pallet', p->'numero_pallet') order by posicion),
      sum((p->>'cantidad_cajas')::numeric)
    into productos, cajas from jsonb_array_elements(p_partidas) with ordinality as detalle(p, posicion);

  -- The sequence gives concurrent finalizations distinct candidates. Legacy folios can already exist.
  loop
    folio_candidato := 'EMB-' || lpad(nextval('ng_embarques_private.folios_embarque')::text, 6, '0');
    exit when not exists (select 1 from public.usa_embarques e where e.folio_embarque = folio_candidato)
      and not exists (select 1 from public.usa_shipment_reports d where d.trip_id = folio_candidato)
      and not exists (select 1 from ng_embarques_private.finalizaciones f where f.folio = folio_candidato);
  end loop;
  folio := folio_candidato;
  cabecera := jsonb_populate_record(null::public.usa_embarques, jsonb_build_object(
    'folio_embarque', folio, 'fecha_embarque', p_datos->>'fecha_salida', 'linea_transporte', linea,
    'nombre_operador', p_datos->>'operador', 'placas_caja', p_datos->>'placas_caja', 'placas_tractor', p_datos->>'placas_tractor',
    'temperatura_viaje', p_datos->'temperatura', 'destino', cliente, 'estatus_embarque', 'EN REVISIÓN RI',
    'alerta_inspeccion_pt', exists (select 1 from jsonb_array_elements(p_partidas) p where nullif(btrim(p->>'lote_pt'), '') is null),
    'diferencias_auditoria', coalesce(p_datos->'discrepancias', '[]'::jsonb),
    'foto_remision', p_fotos->>'remision', 'foto_termografo', p_fotos->>'termografo', 'foto_diesel', p_fotos->>'diesel',
    'foto_refacciones', p_fotos->>'refacciones', 'foto_temperatura', p_fotos->>'temperatura'
  ));
  -- This transaction creates its own dispatch. Keep the existing detail trigger from creating a second one.
  insert into public.usa_embarques (folio_embarque, fecha_embarque, linea_transporte, nombre_operador, placas_caja, placas_tractor,
    temperatura_viaje, destino, estatus_embarque, alerta_inspeccion_pt, diferencias_auditoria, foto_remision, foto_termografo,
    foto_diesel, foto_refacciones, foto_temperatura, dispatch_activation_enabled)
  values (cabecera.folio_embarque, cabecera.fecha_embarque, cabecera.linea_transporte, cabecera.nombre_operador, cabecera.placas_caja,
    cabecera.placas_tractor, cabecera.temperatura_viaje, cabecera.destino, cabecera.estatus_embarque, cabecera.alerta_inspeccion_pt,
    cabecera.diferencias_auditoria, cabecera.foto_remision, cabecera.foto_termografo, cabecera.foto_diesel, cabecera.foto_refacciones,
    cabecera.foto_temperatura, false)
  returning id::text into embarque_id_guardado;

  insert into public.usa_embarques_detalle (embarque_id, numero_pallet, producto_id, remision, mid, lote_pt, cantidad_cajas)
  select d.embarque_id, d.numero_pallet, d.producto_id, d.remision, d.mid, d.lote_pt, d.cantidad_cajas
  from jsonb_array_elements(p_partidas) p
  cross join lateral jsonb_populate_record(null::public.usa_embarques_detalle,
    p || jsonb_build_object('embarque_id', embarque_id_guardado)) d;

  despacho := jsonb_populate_record(null::public.usa_shipment_reports, jsonb_build_object(
    'trip_id', folio, 'project', proyecto, 'project_id', p_datos->>'proyecto_id', 'sucursal_id', nullif(p_datos->>'sucursal_id', ''),
    'client_id', p_datos->>'cliente_id', 'client_ids', jsonb_build_array(p_datos->>'cliente_id'), 'products', productos,
    'is_consolidated', false, 'logistic_status', 'En Tránsito', 'departure_date_time', p_datos->>'fecha_salida',
    'real_departure_date', p_datos->>'fecha_salida', 'linea_transportista_id', nullif(p_datos->>'transportista_id', ''),
    'driver_name', p_datos->>'operador', 'tractor_plates', p_datos->>'placas_tractor', 'box_number', p_datos->>'placas_caja',
    'unit_type', (p_datos->>'pies') || ' pies', 'tive_tracker_id', p_datos->>'termografo', 'temperature', p_datos->'temperatura',
    'ideal_temp', p_datos->'temperatura', 'total_real_boxes', cajas, 'incidents', '[]'::jsonb,
    'comments', concat_ws(E'\n', case when nullif(p_datos->>'transportista_id', '') is null then 'Transportista: ' || linea end,
      'Económico: ' || (p_datos->>'economico'), 'Termo continuo: ' || (p_datos->>'termo_continuo'),
      (select string_agg(diferencia, ' | ') from jsonb_array_elements_text(coalesce(p_datos->'discrepancias', '[]'::jsonb)) diferencia))
  ));
  insert into public.usa_shipment_reports (trip_id, project, project_id, sucursal_id, client_id, client_ids, products, is_consolidated,
    logistic_status, departure_date_time, real_departure_date, linea_transportista_id, driver_name, tractor_plates, box_number,
    unit_type, tive_tracker_id, temperature, ideal_temp, total_real_boxes, incidents, comments)
  values (despacho.trip_id, despacho.project, despacho.project_id, despacho.sucursal_id, despacho.client_id, despacho.client_ids,
    despacho.products, despacho.is_consolidated, despacho.logistic_status, despacho.departure_date_time, despacho.real_departure_date,
    despacho.linea_transportista_id, despacho.driver_name, despacho.tractor_plates, despacho.box_number, despacho.unit_type,
    despacho.tive_tracker_id, despacho.temperature, despacho.ideal_temp, despacho.total_real_boxes, despacho.incidents, despacho.comments)
  returning id::text into despacho_id_guardado;

  insert into ng_embarques_private.finalizaciones (solicitud, usuario, embarque_id, despacho_id, folio, fotos)
  values (p_solicitud, cuenta, embarque_id_guardado, despacho_id_guardado, folio, p_fotos);
  return jsonb_build_object('embarque_id', embarque_id_guardado, 'despacho_id', despacho_id_guardado, 'folio', folio);
end
$$;
