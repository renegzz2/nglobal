do $$
declare
  table_name text;
  table_names text[] := array[
    'inventario_proyectos',
    'lider_programacion_usa_reports',
    'proyecciones_estrategicas',
    'push_subscriptions',
    'tipo_unidad',
    'tive_alert_config',
    'tive_alert_dictionary',
    'tive_events',
    'transferencias_stock',
    'usa_clientes',
    'usa_estatus',
    'usa_lineas_transporte',
    'usa_productos',
    'usa_proyectos',
    'usa_proyecto_producto',
    'usa_responsables',
    'usa_shipment_alerts',
    'usa_shipment_reports',
    'usa_sucursales',
    'usa_unidades_transporte'
  ];
begin
  foreach table_name in array table_names loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('alter table public.%I enable row level security', table_name);
      execute format('alter table public.%I force row level security', table_name);

      execute format('drop policy if exists "%I authenticated read" on public.%I', table_name, table_name);
      execute format('drop policy if exists "%I authenticated insert" on public.%I', table_name, table_name);
      execute format('drop policy if exists "%I authenticated update" on public.%I', table_name, table_name);
      execute format('drop policy if exists "%I authenticated delete" on public.%I', table_name, table_name);

      execute format(
        'create policy "%I authenticated read" on public.%I for select to authenticated using (true)',
        table_name,
        table_name
      );
      execute format(
        'create policy "%I authenticated insert" on public.%I for insert to authenticated with check (true)',
        table_name,
        table_name
      );
      execute format(
        'create policy "%I authenticated update" on public.%I for update to authenticated using (true) with check (true)',
        table_name,
        table_name
      );
      execute format(
        'create policy "%I authenticated delete" on public.%I for delete to authenticated using (true)',
        table_name,
        table_name
      );
    end if;
  end loop;
end $$;
