create table public.usa_shipment_incidents (
  id uuid primary key,
  shipment_id uuid not null references public.usa_shipment_reports(id) on delete cascade,
  reported_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  occurred_at timestamptz not null,
  kind text not null check (length(btrim(kind)) between 1 and 100),
  location text not null default '' check (length(location) <= 300),
  description text not null check (length(btrim(description)) between 1 and 3000)
);

create index ng_incidents_shipment_time on public.usa_shipment_incidents(shipment_id, occurred_at desc);
alter table public.usa_shipment_incidents enable row level security;
revoke all on public.usa_shipment_incidents from anon, authenticated;
grant select, insert on public.usa_shipment_incidents to authenticated;

create policy ng_incident_read on public.usa_shipment_incidents for select to authenticated
using (exists (select 1 from public.usa_shipment_reports s where s.id = shipment_id));

create policy ng_incident_write on public.usa_shipment_incidents for insert to authenticated
with check (
  reported_by = auth.uid() and
  ng_private.has_role(array['COORDINADOR','SUBGERENCIA','ADMINISTRATIVO','GERENCIA','ADMINISTRADOR']) and
  exists (select 1 from public.usa_shipment_reports s where s.id = shipment_id)
);
