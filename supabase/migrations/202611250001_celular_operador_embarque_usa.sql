alter table public.usa_shipment_reports add column if not exists driver_phone text;

-- Keep the existing RPC for clients that haven't added the operator's phone.
create function public.ng_finalizar_embarque_usa(
  p_solicitud uuid, p_datos jsonb, p_partidas jsonb, p_fotos jsonb, p_celular_operador text
) returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare
  celular text := nullif(btrim(p_celular_operador), '');
  ya_finalizado boolean;
  resultado jsonb;
begin
  if celular is null or p_solicitud is null or not ng_embarques_private.puede_capturar() then
    return public.ng_finalizar_embarque_usa(p_solicitud, p_datos, p_partidas, p_fotos);
  end if;
  if length(celular) > 40 then
    raise exception 'El celular del operador debe tener hasta 40 caracteres.' using errcode = '22023';
  end if;

  -- Use the same lock as the four-argument finalizer to serialize old and new requests.
  perform pg_advisory_xact_lock(hashtextextended(p_solicitud::text, 0));
  select exists (select 1 from ng_embarques_private.finalizaciones f where f.solicitud = p_solicitud)
    into ya_finalizado;
  resultado := public.ng_finalizar_embarque_usa(p_solicitud, p_datos, p_partidas, p_fotos);
  if not ya_finalizado then
    update public.usa_shipment_reports
    set driver_phone = celular
    where id::text = resultado->>'despacho_id';
  end if;
  return resultado;
end
$$;

revoke all on function public.ng_finalizar_embarque_usa(uuid,jsonb,jsonb,jsonb,text) from public, anon;
grant execute on function public.ng_finalizar_embarque_usa(uuid,jsonb,jsonb,jsonb,text) to authenticated;
