-- Authorization remains enforced even when an existing permissive policy grants broader access.
create schema if not exists ng_private;
revoke all on schema ng_private from public;
grant usage on schema ng_private to anon, authenticated;

create function ng_private.app_role() returns text
language sql stable set search_path = pg_catalog
as $$ select upper(trim(coalesce(auth.jwt()->'app_metadata'->>'role', ''))) $$;

create function ng_private.has_role(roles text[]) returns boolean
language sql stable set search_path = pg_catalog
as $$
  select coalesce(
    auth.uid() is not null and ng_private.app_role() = any(roles) and
    (ng_private.app_role() <> 'ADMINISTRADOR' or auth.jwt()->>'aal' = 'aal2'),
    false
  )
$$;

create table ng_private.user_projects (
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id text not null check (length(project_id) between 1 and 128),
  primary key (user_id, project_id)
);

create function ng_private.project_allowed(project text) returns boolean
language sql stable security definer set search_path = pg_catalog
as $$
  select ng_private.app_role() <> 'LIDER_PROYECTO'
    or exists (
      select 1 from ng_private.user_projects p
      where p.user_id = auth.uid() and ng_private.has_role(array['COORDINADOR','SUBGERENCIA','ADMINISTRATIVO','GERENCIA','DIRECCION','SUBDIRECCION','ADMINISTRADOR','LIDER_PROYECTO','INSPECTOR']) and p.project_id = project
    )
$$;

do $$
declare
  rule record;
  command text;
  roles text;
  predicate text;
  read_roles constant text := 'GERENCIA,ADMINISTRADOR,DIRECCION,SUBDIRECCION';
  operations constant text := ',COORDINADOR,SUBGERENCIA,ADMINISTRATIVO';
  catalog_roles constant text := 'GERENCIA,ADMINISTRADOR';
  inspection_roles constant text := 'ADMINISTRADOR,INSPECTOR';
begin
  for rule in
    select * from (values
      ('usa_shipment_reports', read_roles || operations, 'GERENCIA,ADMINISTRADOR' || operations, null),
      ('nacional_shipment_reports', read_roles || operations, 'GERENCIA,ADMINISTRADOR' || operations, null),
      ('lider_programacion_usa_reports', read_roles || operations || ',LIDER_PROYECTO', 'GERENCIA,ADMINISTRADOR,LIDER_PROYECTO', 'project_id'),
      ('proyecciones_estrategicas', read_roles || ',LIDER_PROYECTO', 'ADMINISTRADOR,DIRECCION,SUBDIRECCION,LIDER_PROYECTO', 'proyecto_id'),
      ('inventario_proyectos', catalog_roles || operations, catalog_roles || operations, null),
      ('transferencias_stock', catalog_roles || operations, catalog_roles || operations, null),
      ('tipo_unidad', read_roles || operations || ',LIDER_PROYECTO', catalog_roles, null),
      ('usa_clientes', read_roles || operations || ',LIDER_PROYECTO', catalog_roles, null),
      ('usa_estatus', read_roles || operations, catalog_roles, null),
      ('usa_lineas_transporte', read_roles || operations, catalog_roles, null),
      ('usa_productos', read_roles || operations || ',LIDER_PROYECTO', catalog_roles, null),
      ('usa_proyectos', read_roles || operations || ',LIDER_PROYECTO', catalog_roles, null),
      ('usa_proyecto_producto', read_roles || operations || ',LIDER_PROYECTO', catalog_roles, null),
      ('usa_responsables', read_roles || operations, catalog_roles, null),
      ('usa_sucursales', read_roles || operations, catalog_roles, null),
      ('usa_unidades_transporte', read_roles || operations, catalog_roles || operations, null),
      ('tive_alert_config', read_roles || operations, catalog_roles, null),
      ('tive_alert_dictionary', read_roles || operations, catalog_roles, null),
      ('tive_events', read_roles || operations, 'ADMINISTRADOR', null),
      ('usa_shipment_alerts', read_roles || operations, 'GERENCIA,ADMINISTRADOR' || operations, null),
      ('alert_recipients', 'ADMINISTRADOR,GERENCIA,COORDINADOR,SUBGERENCIA,DIRECCION', 'ADMINISTRADOR,GERENCIA,COORDINADOR,SUBGERENCIA,DIRECCION', null),
      ('productos', inspection_roles, 'ADMINISTRADOR', null),
      ('catalogo_danos', inspection_roles, 'ADMINISTRADOR', null),
      ('productores', inspection_roles, 'ADMINISTRADOR', null),
      ('huertas', inspection_roles, 'ADMINISTRADOR', null),
      ('inspecciones', inspection_roles, inspection_roles, null)
    ) as t(table_name, readers, writers, scope_column)
  loop
    if to_regclass(format('public.%I', rule.table_name)) is null then continue; end if;
    execute format('alter table public.%I enable row level security', rule.table_name);
    foreach command in array array['select', 'insert', 'update', 'delete']
    loop
      roles := case when command = 'select' then rule.readers else rule.writers end;
      if rule.table_name = 'inspecciones' and command in ('update', 'delete') then roles := 'ADMINISTRADOR'; end if;
      if rule.table_name = 'tive_events' and command in ('update', 'delete') then roles := ''; end if;
      if rule.table_name = 'proyecciones_estrategicas' and command in ('insert', 'delete') then
        roles := 'ADMINISTRADOR,DIRECCION,SUBDIRECCION';
      end if;
      predicate := format('ng_private.has_role(string_to_array(%L, '',''))', roles);
      if rule.scope_column is not null then
        predicate := predicate || format(' and ng_private.project_allowed((to_jsonb(%I)->>%L))', rule.table_name, rule.scope_column);
      end if;
      execute format('create policy %I on public.%I as permissive for %s to authenticated %s',
        'ng_allow_' || command, rule.table_name, command,
        case when command = 'insert' then 'with check (true)' else 'using (true)' end);
      execute format('create policy %I on public.%I as restrictive for %s to public %s',
        'ng_limit_' || command, rule.table_name, command,
        case command
          when 'insert' then 'with check (' || predicate || ')'
          when 'update' then 'using (' || predicate || ') with check (' || predicate || ')'
          else 'using (' || predicate || ')'
        end);
    end loop;
  end loop;
end $$;

-- A subscription belongs to a verified account, including when two accounts have the same name.
alter table public.push_subscriptions add column user_id uuid references auth.users(id) on delete cascade;
create unique index ng_push_subscription_owner on public.push_subscriptions(user_id);
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select c.conname from pg_constraint c
    where c.conrelid = 'public.push_subscriptions'::regclass and c.contype = 'u'
      and pg_get_constraintdef(c.oid) = 'UNIQUE (user_name)'
  loop
    execute format('alter table public.push_subscriptions drop constraint %I', constraint_name);
  end loop;
end $$;
create policy ng_push_own_allow on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid() and ng_private.has_role(array['COORDINADOR','SUBGERENCIA','ADMINISTRATIVO','GERENCIA','DIRECCION','SUBDIRECCION','ADMINISTRADOR','LIDER_PROYECTO','INSPECTOR'])) with check (user_id = auth.uid() and ng_private.has_role(array['COORDINADOR','SUBGERENCIA','ADMINISTRATIVO','GERENCIA','DIRECCION','SUBDIRECCION','ADMINISTRADOR','LIDER_PROYECTO','INSPECTOR']));
create policy ng_push_own_limit on public.push_subscriptions as restrictive for all to public
  using (user_id = auth.uid() and ng_private.has_role(array['COORDINADOR','SUBGERENCIA','ADMINISTRATIVO','GERENCIA','DIRECCION','SUBDIRECCION','ADMINISTRADOR','LIDER_PROYECTO','INSPECTOR'])) with check (user_id = auth.uid() and ng_private.has_role(array['COORDINADOR','SUBGERENCIA','ADMINISTRATIVO','GERENCIA','DIRECCION','SUBDIRECCION','ADMINISTRADOR','LIDER_PROYECTO','INSPECTOR']));

create table ng_private.rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation text not null,
  window_start timestamptz not null,
  request_count integer not null,
  primary key (user_id, operation)
);

create function public.ng_consume_rate_limit(operation text) returns boolean
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  account uuid := auth.uid();
  current_window timestamptz := date_trunc('minute', clock_timestamp());
  maximum integer;
  used integer;
begin
  maximum := case $1 when 'gemini' then 12 when 'push' then 4 end;
  if account is null or maximum is null or not ng_private.has_role(array['COORDINADOR','SUBGERENCIA','ADMINISTRATIVO','GERENCIA','DIRECCION','SUBDIRECCION','ADMINISTRADOR','LIDER_PROYECTO','INSPECTOR']) then return false; end if;
  insert into ng_private.rate_limits as r (user_id, operation, window_start, request_count)
  values (account, $1, current_window, 1)
  on conflict on constraint rate_limits_pkey do update
    set window_start = greatest(r.window_start, excluded.window_start),
        request_count = case when r.window_start < excluded.window_start then 1
                             else least(r.request_count + 1, maximum + 1) end
  returning request_count into used;
  return used <= maximum;
end $$;

create table ng_private.webhook_receipts (
  channel text not null,
  event_key text not null,
  received_at timestamptz not null default now(),
  primary key (channel, event_key)
);

create function public.ng_claim_webhook(channel text, event_key text) returns boolean
language plpgsql security definer set search_path = pg_catalog
as $$
begin
  if $1 not in ('whatsapp', 'tive', 'dispatch') or $2 is null or length($2) not between 1 and 200 then
    raise exception 'Webhook identifier invalid' using errcode = '22023';
  end if;
  insert into ng_private.webhook_receipts (channel, event_key) values ($1, $2)
  on conflict do nothing;
  return found;
end $$;

revoke all on function public.ng_consume_rate_limit(text) from public, anon, authenticated;
grant execute on function public.ng_consume_rate_limit(text) to authenticated;
revoke all on function public.ng_claim_webhook(text, text) from public, anon, authenticated;
grant execute on function public.ng_claim_webhook(text, text) to service_role;

-- Project leaders edit operational fields for their assigned projects.
create function ng_private.guard_projection_updates() returns trigger
language plpgsql set search_path = pg_catalog
as $$
declare
  operational constant text[] := array[
    'lunes','martes','miercoles','jueves','viernes','sabado','domingo','fecha_salida','fecha_llegada',
    'desglose_diario','canje_productos','proyeccion_cajas','client_id','venta_real_manual','updated_at'
  ];
begin
  if ng_private.app_role() = 'LIDER_PROYECTO' and
      (to_jsonb(new) - operational) is distinct from (to_jsonb(old) - operational) then
    raise exception 'El rol solo puede actualizar campos operativos de planeación' using errcode = '42501';
  end if;
  return new;
end $$;

do $$
begin
  if to_regclass('public.proyecciones_estrategicas') is not null then
    create trigger ng_projection_fields before update on public.proyecciones_estrategicas
    for each row execute function ng_private.guard_projection_updates();
  end if;
end $$;
