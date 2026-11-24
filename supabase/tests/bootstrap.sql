-- Minimal application schema for the isolated PostgreSQL CI database.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.jwt() returns jsonb language sql stable
as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;

create table public.usa_shipment_reports (
  id uuid primary key default gen_random_uuid(),
  trip_id text not null, project text, project_id uuid, client_id uuid, is_consolidated boolean,
  products jsonb, logistic_status text, departure_date_time timestamptz,
  lote_original_id uuid, lote_secundario_id uuid,
  freight_cost numeric, extra_costs numeric, fines numeric, freight_payer text, reviewer_id uuid,
  passed_to_payment boolean, passed_to_payment_date timestamptz, invoice_received boolean,
  invoice_received_date timestamptz, carrier_invoice_number text, fiscal_folio text,
  freight_in_portfolio boolean, payment_status text, comments text
);
create table public.lider_programacion_usa_reports (
  id uuid primary key default gen_random_uuid(), project_id uuid, usa_logistics_status text not null
);
create table public.proyecciones_estrategicas (id uuid primary key default gen_random_uuid(), proyecto_id uuid, autorizado boolean default false, proyeccion_cajas integer);
create table public.inspecciones (id uuid primary key default gen_random_uuid());
create table public.tive_events (
  id uuid primary key default gen_random_uuid(), tracker_id text, temperature numeric, humidity numeric,
  lat numeric, lng numeric, location text, battery numeric, timestamp timestamptz, alert_type text
);
create table public.push_subscriptions (user_name text unique, subscription jsonb);
grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
-- Simulate an overly broad policy left over from a deployed project.
create policy previous_open_access on public.usa_shipment_reports for all to public using (true) with check (true);
