-- Minimal schema for the standalone Embarques regression tests. Use only a blank database.
create role anon;
create role authenticated;

create schema auth;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;
create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
grant usage on schema auth to anon, authenticated;

create schema storage;
create table storage.buckets (
  id text primary key, name text not null, public boolean not null,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
  name text not null, owner_id text default auth.uid()::text, unique (bucket_id, name)
);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated;
grant select, insert, update, delete on storage.objects to anon, authenticated;
create policy fixture_storage_open on storage.objects for all to public using (true) with check (true);

create table public.usa_clientes (id uuid primary key, nombre text not null);
create table public.usa_proyectos (id uuid primary key, nombre text not null);
create table public.usa_sucursales (id uuid primary key, proyecto_id uuid references public.usa_proyectos(id));
create table public.usa_lineas_transporte (id uuid primary key, nombre text not null);
create table public.usa_productos (id uuid primary key);

create table public.usa_embarques (
  id uuid primary key default gen_random_uuid(),
  folio_embarque text unique not null, fecha_embarque timestamptz not null,
  linea_transporte text, nombre_operador text, placas_caja text, placas_tractor text, temperatura_viaje numeric,
  destino text, estatus_embarque text, alerta_inspeccion_pt boolean, diferencias_auditoria jsonb,
  foto_remision text, foto_termografo text, foto_diesel text, foto_refacciones text, foto_temperatura text
);
create table public.usa_embarques_detalle (
  embarque_id uuid references public.usa_embarques(id), numero_pallet text, producto_id uuid references public.usa_productos(id),
  remision text, mid text, lote_pt text, cantidad_cajas integer
);
create table public.usa_shipment_reports (
  id uuid primary key default gen_random_uuid(),
  trip_id text unique not null, project text, project_id uuid references public.usa_proyectos(id),
  sucursal_id uuid references public.usa_sucursales(id), client_id uuid references public.usa_clientes(id), client_ids uuid[],
  products jsonb, is_consolidated boolean, logistic_status text, departure_date_time timestamptz, real_departure_date timestamptz,
  linea_transportista_id uuid references public.usa_lineas_transporte(id), driver_name text, tractor_plates text, box_number text,
  unit_type text, tive_tracker_id text, temperature numeric check (temperature <> 99), ideal_temp numeric, total_real_boxes integer,
  incidents jsonb, comments text
);

insert into public.usa_clientes values ('20000000-0000-0000-0000-000000000001', 'Cliente de prueba');
insert into public.usa_proyectos values ('30000000-0000-0000-0000-000000000001', 'Proyecto de prueba');
insert into public.usa_sucursales values ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001');
insert into public.usa_lineas_transporte values ('50000000-0000-0000-0000-000000000001', 'Transportista de prueba');
insert into public.usa_productos values ('60000000-0000-0000-0000-000000000001');
