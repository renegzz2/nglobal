-- Retry an explicitly failed delivery without reopening events already accepted by the provider.
create function public.ng_release_webhook(channel text, event_key text) returns void
language sql security definer set search_path = pg_catalog
as $$ delete from ng_private.webhook_receipts r where r.channel = $1 and r.event_key = $2 $$;
revoke all on function public.ng_release_webhook(text,text) from public, anon, authenticated;
grant execute on function public.ng_release_webhook(text,text) to service_role;

create function public.ng_store_tive_event(event_key text, event jsonb) returns void
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  detail public.tive_events;
begin
  if not public.ng_claim_webhook('tive', event_key) then return; end if;
  detail := jsonb_populate_record(null::public.tive_events, event);
  insert into public.tive_events (tracker_id, temperature, humidity, lat, lng, location, battery, timestamp, alert_type)
  values (detail.tracker_id, detail.temperature, detail.humidity, detail.lat, detail.lng, detail.location, detail.battery, detail.timestamp, detail.alert_type);
end $$;

revoke all on function public.ng_store_tive_event(text,jsonb) from public, anon, authenticated;
grant execute on function public.ng_store_tive_event(text,jsonb) to service_role;
