alter table public.usa_shipment_reports add column if not exists lotes_asociados jsonb;
alter table public.usa_shipment_reports add column if not exists client_ids jsonb;
alter table public.usa_shipment_reports add column client_mutation_id uuid unique;

create function ng_private.shipment_lots(shipment jsonb) returns text[]
language sql immutable set search_path = pg_catalog
as $$
  select coalesce(array_agg(distinct lot order by lot), array[]::text[])
  from (
    select jsonb_array_elements_text(
      case when jsonb_typeof(shipment->'lotes_asociados') = 'array' then shipment->'lotes_asociados'
           else jsonb_build_array(shipment->>'lote_original_id', shipment->>'lote_secundario_id') end
    ) as lot
  ) ids
  where lot is not null and lot <> ''
$$;

create function ng_private.lock_shipment_changes() returns trigger
language plpgsql set search_path = pg_catalog
as $$
begin
  perform pg_advisory_xact_lock(21478120, 1);
  return null;
end $$;

create function ng_private.sync_shipment_lots() returns trigger
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  previous text[] := array[]::text[];
  current_lots text[] := array[]::text[];
  lot text;
  lot_status text;
begin
  if tg_op <> 'INSERT' then previous := ng_private.shipment_lots(to_jsonb(old)); end if;
  if tg_op <> 'DELETE' then current_lots := ng_private.shipment_lots(to_jsonb(new)); end if;
  if tg_op = 'UPDATE' then
    if previous @> current_lots and current_lots @> previous and new.trip_id is not distinct from old.trip_id then
      return null;
    end if;
  end if;

  for lot in select distinct id from unnest(previous || current_lots) as ids(id) order by id loop
    select p.usa_logistics_status into lot_status
    from public.lider_programacion_usa_reports p where p.id::text = lot for update;

    if lot = any(current_lots) then
      if not found or (not (lot = any(previous)) and coalesce(lot_status, '') not in ('Programado', 'Cargado')) then
        raise exception 'El lote % no está disponible.', lot using errcode = '23514';
      end if;
      if exists (
        select 1 from public.usa_shipment_reports s
        where s.id <> new.id and s.trip_id is distinct from new.trip_id
          and lot = any(ng_private.shipment_lots(to_jsonb(s)))
      ) or (lot_status = 'Cargado' and not (lot = any(previous)) and not exists (
        select 1 from public.usa_shipment_reports s
        where s.id <> new.id and s.trip_id = new.trip_id and lot = any(ng_private.shipment_lots(to_jsonb(s)))
      )) then
        raise exception 'El lote % ya está asignado.', lot using errcode = '23514';
      end if;
      update public.lider_programacion_usa_reports p set usa_logistics_status = 'Cargado'
      where p.id::text = lot and p.usa_logistics_status is distinct from 'Cargado';
    elsif not exists (
      select 1 from public.usa_shipment_reports s where lot = any(ng_private.shipment_lots(to_jsonb(s)))
    ) then
      update public.lider_programacion_usa_reports p set usa_logistics_status = 'Programado'
      where p.id::text = lot and p.usa_logistics_status = 'Cargado';
    end if;
  end loop;
  return null;
end $$;

create trigger ng_lock_shipment_changes before insert or update or delete on public.usa_shipment_reports
for each statement execute function ng_private.lock_shipment_changes();
create trigger ng_sync_shipment_lots after insert or update or delete on public.usa_shipment_reports
for each row execute function ng_private.sync_shipment_lots();

create function public.ng_save_shipments(shipments jsonb) returns void
language plpgsql set search_path = pg_catalog
as $$
declare
  allowed constant text[] := array[
    'client_mutation_id','trip_id','project','project_id','stop_over_project_id','sucursal_id','client_id','client_ids',
    'linea_transportista_id','unidad_transporte_id','is_consolidated','lotes_asociados',
    'lote_original_id','lote_secundario_id','products','logistic_status','departure_date_time',
    'driver_name','driver_phone','unit_type','tractor_plates','box_number','seal_number',
    'min_temp','temperature','total_real_boxes','ideal_temp','tive_tracker_id','caat','alpha',
    'transfer_agent','transfer_phone','freight_cost','real_departure_date','arrival_date_time','comments'
  ];
  shipment jsonb;
  shipment_id text;
  cols text;
  values_sql text;
  changed integer;
begin
  if not ng_private.has_role(array['COORDINADOR','SUBGERENCIA','ADMINISTRATIVO','GERENCIA','ADMINISTRADOR']) then
    raise exception 'Acceso denegado' using errcode = '42501';
  end if;
  if jsonb_typeof(shipments) is distinct from 'array' then
    raise exception 'Se requiere una lista de embarques' using errcode = '22023';
  end if;
  if jsonb_array_length(shipments) not between 1 and 25 then
    raise exception 'Cantidad de embarques inválida' using errcode = '22023';
  end if;
  for shipment in select jsonb_array_elements(shipments) loop
    shipment_id := shipment->>'id';
    shipment := shipment - 'id';
    if shipment_id is not null then shipment := shipment - 'client_mutation_id'; end if;
    if jsonb_typeof(shipment) is distinct from 'object' or btrim(coalesce(shipment->>'trip_id', '')) = '' or exists (
      select 1 from jsonb_object_keys(shipment) as keys(key) where not (key = any(allowed))
    ) then
      raise exception 'Campos de embarque inválidos' using errcode = '22023';
    end if;
    select string_agg(format('%I', key), ', ' order by key),
           string_agg(format('r.%I', key), ', ' order by key)
      into cols, values_sql from jsonb_object_keys(shipment) as keys(key);
    if shipment_id is null then
      execute format('insert into public.usa_shipment_reports (%s) select %s from jsonb_populate_record(null::public.usa_shipment_reports, $1) r on conflict (client_mutation_id) do nothing', cols, values_sql)
      using shipment;
    else
      execute format('update public.usa_shipment_reports s set (%s) = (select %s from jsonb_populate_record(null::public.usa_shipment_reports, $1) r) where s.id::text = $2', cols, values_sql)
      using shipment, shipment_id;
      get diagnostics changed = row_count;
      if changed <> 1 then raise exception 'No se pudo actualizar el embarque' using errcode = 'P0002'; end if;
    end if;
  end loop;
end $$;

create function public.ng_promote_shipment(shipment jsonb) returns void
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  payload public.usa_shipment_reports;
  lot text;
  lot_count integer := 0;
begin
  if not ng_private.has_role(array['LIDER_PROYECTO','GERENCIA','ADMINISTRADOR']) then
    raise exception 'Acceso denegado' using errcode = '42501';
  end if;
  payload := jsonb_populate_record(null::public.usa_shipment_reports, shipment);
  if btrim(coalesce(payload.trip_id, '')) = '' then raise exception 'Se requiere un folio' using errcode = '22023'; end if;
  for lot in select unnest(ng_private.shipment_lots(to_jsonb(payload) - 'lotes_asociados')) loop
    if not exists (
      select 1 from public.lider_programacion_usa_reports p
      where p.id::text = lot and ng_private.project_allowed(to_jsonb(p)->>'project_id')
    ) then raise exception 'Acceso denegado al lote' using errcode = '42501'; end if;
    lot_count := lot_count + 1;
  end loop;
  if lot_count = 0 or not ng_private.project_allowed(payload.project_id::text) then
    raise exception 'Se requiere un lote asignado al proyecto' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(21478120, 1);
  if exists (select 1 from public.usa_shipment_reports s where
    s.trip_id = payload.trip_id
    and ng_private.shipment_lots(to_jsonb(s)) = ng_private.shipment_lots(to_jsonb(payload) - 'lotes_asociados')
  ) then return; end if;
  insert into public.usa_shipment_reports (
    trip_id, project, project_id, client_id, is_consolidated, products, logistic_status,
    departure_date_time, lote_original_id, lote_secundario_id
  ) values (
    payload.trip_id, payload.project, payload.project_id, payload.client_id, lot_count > 1, payload.products, 'Pendiente',
    payload.departure_date_time, payload.lote_original_id, payload.lote_secundario_id
  );
end $$;

create function public.ng_update_freight(shipment_id text, fields jsonb) returns void
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  payment public.usa_shipment_reports;
begin
  if not ng_private.has_role(array['ADMINISTRADOR','GERENCIA','DIRECCION','SUBDIRECCION','SUBGERENCIA','ADMINISTRATIVO']) then
    raise exception 'Acceso denegado' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(21478120, 1);
  select jsonb_populate_record(s, fields) into payment from public.usa_shipment_reports s
  where s.id::text = shipment_id for update;

  update public.usa_shipment_reports s set
    freight_cost = payment.freight_cost, extra_costs = payment.extra_costs, fines = payment.fines,
    freight_payer = payment.freight_payer, reviewer_id = payment.reviewer_id,
    passed_to_payment = payment.passed_to_payment, passed_to_payment_date = payment.passed_to_payment_date,
    invoice_received = payment.invoice_received, invoice_received_date = payment.invoice_received_date,
    carrier_invoice_number = payment.carrier_invoice_number, fiscal_folio = payment.fiscal_folio,
    freight_in_portfolio = payment.freight_in_portfolio, payment_status = payment.payment_status, comments = payment.comments
  where s.id::text = shipment_id;
  if not found then raise exception 'Embarque inexistente' using errcode = 'P0002'; end if;
end $$;

revoke all on function public.ng_save_shipments(jsonb), public.ng_promote_shipment(jsonb), public.ng_update_freight(text,jsonb)
from public, anon, authenticated;
grant execute on function public.ng_save_shipments(jsonb), public.ng_promote_shipment(jsonb), public.ng_update_freight(text,jsonb)
to authenticated;
