begin;

insert into auth.users values
('10000000-0000-0000-0000-000000000001'),
('10000000-0000-0000-0000-000000000002'),
('10000000-0000-0000-0000-000000000003');

insert into public.lider_programacion_usa_reports (id, project_id, usa_logistics_status) values
('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Programado'),
('20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 'Programado'),
('20000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', 'Programado');

insert into public.proyecciones_estrategicas (proyecto_id)
values ('30000000-0000-0000-0000-000000000001'),('30000000-0000-0000-0000-000000000002');
insert into ng_private.user_projects values ('10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001');
insert into public.usa_shipment_reports (id, trip_id) values ('40000000-0000-0000-0000-000000000001', 'EXISTENTE');

set local role anon;
do $$ begin
  if exists (select 1 from public.usa_shipment_reports) then raise exception 'anon can read shipments'; end if;
  begin
    insert into public.usa_shipment_reports (trip_id) values ('NOT ALLOWED');
    raise exception 'anon can write shipments';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","user_metadata":{"role":"ADMINISTRADOR"},"aal":"aal2"}', true);
do $$ begin
  if exists (select 1 from public.usa_shipment_reports) then raise exception 'User metadata grants access'; end if;
  if public.ng_consume_rate_limit('push') then raise exception 'Unprovisioned account can call push'; end if;
end $$;

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","app_metadata":{"role":"ADMINISTRADOR"},"aal":"aal1"}', true);
do $$ begin
  if exists (select 1 from public.usa_shipment_reports) then raise exception 'Admin can read without MFA'; end if;
end $$;

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","app_metadata":{"role":"ADMINISTRADOR"},"aal":"aal2"}', true);
do $$ begin
  if not exists (select 1 from public.usa_shipment_reports) then raise exception 'Admin with MFA cannot read'; end if;
end $$;

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","app_metadata":{"role":"LIDER_PROYECTO"},"aal":"aal1"}', true);
do $$ begin
  if (select count(*) from public.lider_programacion_usa_reports) <> 2 then raise exception 'Project RLS is wrong'; end if;
  update public.proyecciones_estrategicas set proyeccion_cajas = 42;
  if (select count(*) from public.proyecciones_estrategicas where proyeccion_cajas = 42) <> 1 then
    raise exception 'Project leader cannot edit an assigned projection';
  end if;
  begin
    update public.proyecciones_estrategicas set autorizado = true;
    raise exception 'Project leader can approve a projection';
  exception when insufficient_privilege then null; end;
  begin
    perform public.ng_promote_shipment('{"trip_id":"DENIED","project_id":"30000000-0000-0000-0000-000000000002","lote_original_id":"20000000-0000-0000-0000-000000000002"}');
    raise exception 'Cross-project promotion allowed';
  exception when insufficient_privilege then null; end;
  perform public.ng_promote_shipment('{"trip_id":"PROMOTED","project_id":"30000000-0000-0000-0000-000000000001","lote_original_id":"20000000-0000-0000-0000-000000000003"}');
end $$;

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","app_metadata":{"role":"COORDINADOR"},"aal":"aal1"}', true);
do $$
begin
  begin
    perform public.ng_save_shipments('[
      {"trip_id":"ROLLBACK","lotes_asociados":["20000000-0000-0000-0000-000000000001"]},
      {"trip_id":"ROLLBACK","lotes_asociados":["20000000-0000-0000-0000-000000000009"]}
    ]');
    raise exception 'Expected invalid lot to reject save';
  exception when check_violation then null; end;
  if exists (select from public.usa_shipment_reports where trip_id = 'ROLLBACK')
     or (select usa_logistics_status from public.lider_programacion_usa_reports where id = '20000000-0000-0000-0000-000000000001') <> 'Programado' then
    raise exception 'Failed batch left persisted state';
  end if;

  perform public.ng_save_shipments('[{"trip_id":"RETRY","client_mutation_id":"60000000-0000-0000-0000-000000000001"}]');
  perform public.ng_save_shipments('[{"trip_id":"RETRY","client_mutation_id":"60000000-0000-0000-0000-000000000001"}]');
  if (select count(*) from public.usa_shipment_reports where trip_id = 'RETRY') <> 1 then
    raise exception 'A repeated request created a duplicate shipment';
  end if;

  perform public.ng_save_shipments('[
    {"trip_id":"SAME-TRIP","lotes_asociados":["20000000-0000-0000-0000-000000000001"]},
    {"trip_id":"SAME-TRIP","lotes_asociados":["20000000-0000-0000-0000-000000000001"]}
  ]');
  perform public.ng_save_shipments(jsonb_build_array(jsonb_build_object(
    'id', (select id from public.usa_shipment_reports where trip_id = 'SAME-TRIP' limit 1),
    'trip_id','SAME-TRIP','logistic_status','En Tránsito'
  )));
  if not exists (select 1 from public.usa_shipment_reports where trip_id = 'SAME-TRIP' and logistic_status = 'En Tránsito') then
    raise exception 'Editing a shipment did not save changes';
  end if;
  if (select count(*) from public.usa_shipment_reports where trip_id = 'SAME-TRIP') <> 2 then
    raise exception 'Multi-unit shipment not saved';
  end if;
  begin
    perform public.ng_save_shipments('[{"trip_id":"DIFFERENT","lotes_asociados":["20000000-0000-0000-0000-000000000001"]}]');
    raise exception 'Same lot was assigned to different trips';
  exception when check_violation then null; end;

  delete from public.usa_shipment_reports where id in (select id from public.usa_shipment_reports where trip_id = 'SAME-TRIP' limit 1);
  if (select usa_logistics_status from public.lider_programacion_usa_reports where id = '20000000-0000-0000-0000-000000000001') <> 'Cargado' then
    raise exception 'Lot released while another unit uses it';
  end if;
  delete from public.usa_shipment_reports where trip_id = 'SAME-TRIP';
  if (select usa_logistics_status from public.lider_programacion_usa_reports where id = '20000000-0000-0000-0000-000000000001') <> 'Programado' then
    raise exception 'Lot not released';
  end if;

  insert into public.usa_shipment_incidents (id, shipment_id, occurred_at, kind, description)
  values ('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', now(), 'Demora', 'Prueba')
  on conflict do nothing;
  insert into public.usa_shipment_incidents (id, shipment_id, occurred_at, kind, description)
  values ('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', now(), 'Demora', 'Prueba')
  on conflict do nothing;
  if (select count(*) from public.usa_shipment_incidents) <> 1 then raise exception 'Incident retry duplicates data'; end if;
  insert into public.push_subscriptions (user_name, user_id, subscription)
  values ('Nombre compartido', '10000000-0000-0000-0000-000000000001', '{}');

  for attempt in 1..4 loop
    if not public.ng_consume_rate_limit('push') then raise exception 'Push limited too early'; end if;
  end loop;
  if public.ng_consume_rate_limit('push') then raise exception 'Push limit failed'; end if;
end $$;

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000003","app_metadata":{"role":"INSPECTOR"},"aal":"aal1"}', true);
do $$ begin
  if exists (select 1 from public.usa_shipment_incidents) then raise exception 'Inspector can see shipment incidents'; end if;
  if exists (select 1 from public.push_subscriptions) then raise exception 'Account can read another subscription'; end if;
  insert into public.push_subscriptions (user_name, user_id, subscription)
  values ('Nombre compartido', '10000000-0000-0000-0000-000000000003', '{}');
  insert into public.inspecciones values (default);
  begin
    perform public.ng_claim_webhook('tive','private-test');
    raise exception 'Client can claim webhooks';
  exception when insufficient_privilege then null; end;
end $$;

set local role service_role;
do $$ begin
  perform public.ng_store_tive_event('event', '{"tracker_id":"T-A","temperature":0}');
  perform public.ng_store_tive_event('event', '{"tracker_id":"T-A","temperature":0}');
  if (select count(*) from public.tive_events) <> 1 then raise exception 'Tive retry duplicates records'; end if;
end $$;
rollback;
