-- Moxi Business — Migración 04: pasa los datos de las columnas antiguas (inglés/camelCase)
-- al esquema canónico. Re-ejecutable: se corre una vez para probar y otra en el cambio de
-- versión (p_final = true), que además mueve aperturas/cierres de caja a caja_turnos.

-- El registro de actividad ahora lo hacen venta_registrar/venta_anular (con más detalle)
drop trigger if exists trg_log_ventas on public.ventas;

-- Convierte texto a uuid o devuelve null (CASE garantiza que no se intente castear basura)
create or replace function public.a_uuid(t text)
returns uuid language sql immutable as $$
  select case when t ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then t::uuid end;
$$;

create or replace function public.migrar_legacy(p_final boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r record; v_turno uuid; n_ventas int := 0; n_det int := 0; n_pagos int := 0; n_turnos int := 0; n_mov int := 0;
begin
  -- 1. Productos
  update productos set
    nombre        = coalesce(nullif(trim(name), ''), nombre),
    precio_venta  = coalesce(price, precio_venta, 0),
    precio_costo  = coalesce(cost, precio_costo, 0),
    stock_minimo  = coalesce("minStock", stock_minimo, 0),
    unidad        = coalesce(nullif(trim(unit), ''), unidad, 'unidad'),
    descripcion   = coalesce(nullif(trim("desc"), ''), descripcion)
  where name is not null or price is not null;
  update productos p set stock = i.stock
    from inventario i where i."productId" = p.id::text and i.empresa_id = p.empresa_id and i.stock is not null;

  -- 2. Clientes
  update clientes set
    nombre    = coalesce(nullif(trim(name), ''), nombre),
    telefono  = coalesce(nullif(trim(phone), ''), telefono),
    direccion = coalesce(nullif(trim(address), ''), direccion),
    nit       = coalesce(nullif(trim(ci), ''), nit),
    mercado   = coalesce(nullif(trim(market), ''), mercado),
    notas     = coalesce(nullif(trim(notes), ''), notas)
  where name is not null or phone is not null or market is not null;

  -- 3. Ventas antiguas (las creadas por venta_registrar no tienen "items")
  for r in select * from ventas v where v.items is not null
      and (v.legacy_migrado_at is null or v.updated_at > v.legacy_migrado_at) loop
    delete from pagos_venta where venta_id = r.id;
    delete from venta_detalles where venta_id = r.id;
    update ventas set
      cliente_id = (select c.id from clientes c where c.id = a_uuid(r."customerId") and c.empresa_id = r.empresa_id),
      cliente_nombre = coalesce(nullif(r."customerName", ''), 'Público general'),
      cliente_mercado = nullif(r."customerMarket", ''),
      fecha = coalesce(r.date, r."createdAt", r.created_at),
      descuento = coalesce(r.discount, r.descuento, 0),
      descuento_tipo = case when r."discountType" = 'pct' then 'pct' else 'monto' end,
      subtotal = coalesce(nullif(r.subtotal, 0), r.total + coalesce(r.discount, r.descuento, 0)),
      notas = coalesce(nullif(r.notes, ''), r.notas),
      metodo_pago = case when coalesce(r.paid, 0) = 0 then 'CREDITO'::erp.metodo_pago
                         else metodo_pago_normalizar(coalesce(r."paymentMethod", r.payment_method)) end,
      -- las fotos ya no viajan dentro de la venta
      items = (select jsonb_agg(i - 'image') from jsonb_array_elements(r.items) i)
    where id = r.id;
    insert into venta_detalles (venta_id, empresa_id, producto_id, nombre_producto, unidad, cantidad, precio_unitario, precio_costo, descuento)
    select r.id, r.empresa_id,
      (select p.id from productos p where p.id = a_uuid(i->>'productId')),
      coalesce(nullif(i->>'name', ''), (select nombre from productos p where p.id::text = i->>'productId'), 'Producto'),
      nullif(i->>'unit', ''),
      (i->>'qty')::numeric,
      coalesce((i->>'unitPrice')::numeric, (i->>'sale_price')::numeric, 0),
      coalesce((select precio_costo from productos p where p.id::text = i->>'productId'), 0),
      0
    from jsonb_array_elements(r.items) i where coalesce((i->>'qty')::numeric, 0) > 0;
    get diagnostics n_det = row_count;
    -- pagos: del arreglo "payments" o, si no existe, del total pagado
    if jsonb_typeof(r.payments) = 'array' and jsonb_array_length(r.payments) > 0 then
      insert into pagos_venta (venta_id, empresa_id, usuario_id, metodo_pago, monto, fecha)
      select r.id, r.empresa_id, r.usuario_id, metodo_pago_normalizar(coalesce(pg->>'method', r."paymentMethod")),
        round((pg->>'amount')::numeric, 2), coalesce((pg->>'date')::timestamptz, r.date, r.created_at)
      from jsonb_array_elements(r.payments) pg where coalesce((pg->>'amount')::numeric, 0) > 0;
    elsif coalesce(r.paid, 0) > 0 then
      insert into pagos_venta (venta_id, empresa_id, usuario_id, metodo_pago, monto, fecha)
      values (r.id, r.empresa_id, r.usuario_id, metodo_pago_normalizar(r."paymentMethod"), round(r.paid, 2), coalesce(r.date, r.created_at));
    end if;
    perform venta_recalcular(r.id);
    update ventas set legacy_migrado_at = now() where id = r.id;
    n_ventas := n_ventas + 1;
  end loop;

  -- Numeración correlativa por empresa (las antiguas usaban Date.now() como número)
  update ventas v set numero = -s.rn from (
    select id, row_number() over (partition by empresa_id order by coalesce(fecha, created_at), id) rn
    from ventas where numero > 1000000000) s where v.id = s.id;
  update ventas v set numero = (select coalesce(max(numero), 0) from ventas x where x.empresa_id = v.empresa_id and x.numero > 0) + (-v.numero)
    where v.numero < 0;
  insert into contadores_correlativo (empresa_id, tipo, ultimo_numero)
    select empresa_id, 'VENTA', max(numero) from ventas group by empresa_id
  on conflict (empresa_id, tipo) do update set ultimo_numero = greatest(contadores_correlativo.ultimo_numero, excluded.ultimo_numero);

  -- 4. Gastos e ingresos
  update gastos set
    descripcion = coalesce(nullif(trim(description), ''), descripcion),
    monto       = coalesce(amount, monto),
    categoria   = coalesce(nullif(trim(category), ''), categoria),
    notas       = coalesce(nullif(trim(notes), ''), notas),
    fecha       = coalesce((date at time zone 'America/La_Paz')::date, fecha),
    tipo        = case when type = 'ingreso' then 'ingreso' else 'egreso' end,
    usuario_nombre = coalesce(usuario_nombre, nullif(responsable, ''))
  where type is not null and type not in ('apertura_caja', 'cierre_caja');

  -- 5. Kardex: movimientos antiguos
  insert into movimientos_inventario (empresa_id, producto_id, usuario_id, tipo, cantidad, costo_unitario, referencia_tipo, notas, producto_nombre, created_at, legacy_id)
  select m.empresa_id, a_uuid(m."productId"), m.usuario_id,
    (case lower(m.type) when 'salida' then 'SALIDA' when 'ajuste' then 'AJUSTE' when 'produccion' then 'PRODUCCION' else 'ENTRADA' end)::erp.movimiento_tipo,
    coalesce(m.qty, 0), m.cost, 'MANUAL', coalesce(nullif(m.notes, ''), m.description, m.reason),
    (select nombre from productos p where p.id::text = m."productId"), coalesce(m."createdAt", m.date, now()), m.id
  from movimientos m
  where exists (select 1 from productos p where p.id = a_uuid(m."productId"))
    and not exists (select 1 from movimientos_inventario mi where mi.legacy_id = m.id);
  get diagnostics n_mov = row_count;

  -- 6. Solo en el cambio final: aperturas/cierres de caja → caja_turnos
  if p_final then
    for r in select * from gastos where type in ('apertura_caja', 'cierre_caja') order by empresa_id, coalesce("createdAt", created_at) loop
      if r.type = 'apertura_caja' then
        update caja_turnos set estado = 'CERRADO', cerrado_at = coalesce(r."createdAt", r.created_at), notas_cierre = 'Cerrado automáticamente (migración)'
          where empresa_id = r.empresa_id and estado = 'ABIERTO';
        insert into caja_turnos (empresa_id, abierto_por, abierto_por_nombre, abierto_at, fondo_inicial, notas_apertura)
        values (r.empresa_id, r.usuario_id, r.responsable, coalesce(r."createdAt", r.created_at), coalesce(r.amount, r.monto, 0), nullif(r.notes, ''));
        n_turnos := n_turnos + 1;
      else
        update caja_turnos set estado = 'CERRADO', cerrado_por = r.usuario_id, cerrado_por_nombre = r.responsable,
          cerrado_at = coalesce(r."createdAt", r.created_at), arqueo = coalesce(r.amount, r.monto), notas_cierre = coalesce(nullif(r.notes, ''), r.description)
        where id = (select id from caja_turnos where empresa_id = r.empresa_id and estado = 'ABIERTO' limit 1);
      end if;
    end loop;
    delete from gastos where type in ('apertura_caja', 'cierre_caja');
  end if;

  return jsonb_build_object('ventas_migradas', n_ventas, 'turnos', n_turnos, 'movimientos', n_mov);
end $$;
revoke execute on function public.migrar_legacy(boolean) from public, anon, authenticated;
