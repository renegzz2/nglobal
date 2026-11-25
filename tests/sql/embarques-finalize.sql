begin;

create function public.fixture_embarque_datos() returns jsonb language sql immutable as $$
  select '{"cliente_id":"20000000-0000-0000-0000-000000000001",
           "proyecto_id":"30000000-0000-0000-0000-000000000001",
           "sucursal_id":"40000000-0000-0000-0000-000000000001",
           "transportista_id":"50000000-0000-0000-0000-000000000001",
           "fecha_salida":"2026-11-24T14:00:00Z","operador":"Operador","placas_caja":"CAJA","placas_tractor":"TRACTOR",
           "pies":"53","termografo":"TERM-123","temperatura":45,"economico":"100","termo_continuo":"Sí","discrepancias":[]}'::jsonb
$$;
create function public.fixture_embarque_partidas() returns jsonb language sql immutable as $$
  select '[{"numero_pallet":"1","producto_id":"60000000-0000-0000-0000-000000000001","remision":"R1","mid":"MID1","lote_pt":"PT1","cantidad_cajas":10},
           {"numero_pallet":"1","producto_id":"60000000-0000-0000-0000-000000000001","remision":"R2","mid":"MID2","lote_pt":"PT2","cantidad_cajas":15}]'::jsonb
$$;
create function public.fixture_embarque_fotos(solicitud uuid) returns jsonb language sql immutable as $$
  select jsonb_object_agg(tipo, '10000000-0000-0000-0000-000000000001/' || solicitud::text || '/' || tipo ||
    '-80000000-0000-0000-0000-000000000001.jpg')
  from unnest(array['remision','termografo','diesel','refacciones','temperatura']) tipo
$$;

insert into public.usa_embarques (folio_embarque, fecha_embarque) values ('EMB-000001', now());
insert into public.usa_shipment_reports (trip_id) values ('EMB-000002');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","user_metadata":{"role":"COORDINADOR"}}',true);
do $$
begin
  begin
    perform public.ng_finalizar_embarque_usa('70000000-1111-0000-0000-000000000001', public.fixture_embarque_datos(),
      public.fixture_embarque_partidas(), public.fixture_embarque_fotos('70000000-1111-0000-0000-000000000001'));
    raise exception 'Editable metadata granted capture rights';
  exception when insufficient_privilege then null;
  end;
end
$$;

select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","app_metadata":{"role":"COORDINADOR"}}',true);
do $$
declare
  solicitud uuid := '70000000-1111-0000-0000-000000000001';
  solicitud_fallida uuid := '70000000-2222-0000-0000-000000000002';
  resultado jsonb;
begin
  begin
    insert into storage.objects (bucket_id, name) values (
      'usa-embarques-evidencias', '10000000-0000-0000-0000-000000000002/70000000-1111-0000-0000-000000000001/remision-80000000-0000-0000-0000-000000000001.jpg'
    );
    raise exception 'Storage accepts uploads to a different owner folder';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.ng_finalizar_embarque_usa(solicitud, public.fixture_embarque_datos(), public.fixture_embarque_partidas(),
      public.fixture_embarque_fotos(solicitud));
    raise exception 'A shipment was finalized without any uploaded evidence';
  exception when invalid_parameter_value then null;
  end;

  insert into storage.objects (bucket_id, name)
  select 'usa-embarques-evidencias', value from jsonb_each_text(public.fixture_embarque_fotos(solicitud));
  insert into storage.objects (bucket_id, name)
  select 'usa-embarques-evidencias', value from jsonb_each_text(public.fixture_embarque_fotos(solicitud_fallida));

  begin
    perform public.ng_finalizar_embarque_usa(solicitud_fallida, public.fixture_embarque_datos() || '{"temperatura":99}',
      public.fixture_embarque_partidas(), public.fixture_embarque_fotos(solicitud_fallida));
    raise exception 'Expected the simulated dispatch constraint to fail';
  exception when check_violation then null;
  end;

  resultado := public.ng_finalizar_embarque_usa(solicitud, public.fixture_embarque_datos(),
    public.fixture_embarque_partidas(), public.fixture_embarque_fotos(solicitud), ' +52 1234567890 ');
  if resultado->>'folio' is null or resultado->>'folio' !~ '^EMB-[0-9]{6}$'
    or resultado->>'folio' in ('EMB-000001', 'EMB-000002') then
    raise exception 'The dispatch must have an unused six-digit EMB folio';
  end if;
  if resultado is distinct from public.ng_finalizar_embarque_usa(solicitud, public.fixture_embarque_datos(),
    public.fixture_embarque_partidas(), public.fixture_embarque_fotos(solicitud), '0000000000') then
    raise exception 'The retry returned a different dispatch';
  end if;
end
$$;

reset role;
do $$
begin
  if (select count(*) from public.usa_embarques) <> 2 or (select count(*) from public.usa_embarques_detalle) <> 2
    or (select count(*) from public.usa_shipment_reports) <> 2 then
    raise exception 'A failed write or retry left duplicated or partial rows';
  end if;
  if not exists (
    select 1 from public.usa_shipment_reports d join public.usa_embarques e on d.trip_id = e.folio_embarque
    where d.logistic_status = 'En Tránsito' and d.total_real_boxes = 25 and jsonb_array_length(d.products) = 2
      and d.products->0->>'invoice_number' = 'R1' and e.foto_remision <> 'pendiente'
      and d.driver_phone = '+52 1234567890'
  ) then raise exception 'Evidence paths, folio, status or detail did not persist as expected'; end if;
end
$$;

select set_config('test.despacho_id', (select id::text from public.usa_shipment_reports where trip_id <> 'EMB-000002'), true);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000002","app_metadata":{"role":"GERENCIA"}}',true);
do $$
begin
  if (select count(*) from storage.objects where bucket_id = 'usa-embarques-evidencias') <> 5 then
    raise exception 'A manager must only see completed evidence belonging to other users';
  end if;
  if (select count(*) from jsonb_object_keys(public.ng_fotos_despacho_usa(current_setting('test.despacho_id')))) <> 5 then
    raise exception 'Operations cannot retrieve the five photo references';
  end if;
end
$$;

select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000003","app_metadata":{"role":"INSPECTOR"}}',true);
do $$
begin
  if exists (select 1 from storage.objects where bucket_id = 'usa-embarques-evidencias') or
    public.ng_fotos_despacho_usa(current_setting('test.despacho_id')) is not null then
    raise exception 'An unrelated role can read dispatch evidence';
  end if;
end
$$;
rollback;
