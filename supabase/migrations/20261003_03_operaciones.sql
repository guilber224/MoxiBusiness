-- Moxi Business — Migración 03: operaciones atómicas en el servidor.
-- Cada operación de negocio (venta, cobro, anulación, stock, caja, producción, compra)
-- se ejecuta en UNA transacción: o se guarda todo, o nada. Las funciones son
-- SECURITY DEFINER pero validan siempre la empresa del usuario (get_empresa_id()).

-- ── Helpers ────────────────────────────────────────────────────────────────
create or replace function public.turno_abierto_id(p_empresa uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.caja_turnos where empresa_id = p_empresa and estado = 'ABIERTO' limit 1;
$$;

create or replace function public.metodo_pago_normalizar(p text)
returns erp.metodo_pago language sql immutable as $$
  select case lower(coalesce(p, ''))
    when 'efectivo' then 'EFECTIVO' when 'qr' then 'QR'
    when 'banco' then 'TRANSFERENCIA' when 'transferencia' then 'TRANSFERENCIA'
    when 'tarjeta' then 'TARJETA' when 'mixto' then 'MIXTO' when 'credito' then 'CREDITO'
    else 'EFECTIVO' end::erp.metodo_pago;
$$;

create or replace function public.mi_contexto(out empresa uuid, out usuario uuid, out nombre text)
language plpgsql stable security definer set search_path = public as $$
begin
  select u.empresa_id, u.id, u.nombre into empresa, usuario, nombre from public.usuarios u where u.id = auth.uid();
  if empresa is null then raise exception 'Tu usuario no tiene una empresa asignada' using errcode = '42501'; end if;
end $$;

create or replace function public.log_actividad(p_empresa uuid, p_usuario uuid, p_nombre text, p_accion text, p_tabla text, p_registro uuid, p_detalle jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into public.activity_logs (empresa_id, usuario_id, usuario_nombre, accion, tabla_afectada, registro_id, detalle)
  values (p_empresa, p_usuario, p_nombre, p_accion, p_tabla, p_registro, p_detalle);
$$;

-- ── Ventas ─────────────────────────────────────────────────────────────────
create or replace function public.venta_obtener(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(v) || jsonb_build_object(
    'detalles', coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at, d.id) from public.venta_detalles d where d.venta_id = v.id), '[]'),
    'pagos',    coalesce((select jsonb_agg(to_jsonb(pg) order by pg.fecha) from public.pagos_venta pg where pg.venta_id = v.id), '[]'))
  from public.ventas v where v.id = p_id and v.empresa_id = public.get_empresa_id();
$$;

-- Recalcula monto_pagado y estado a partir de pagos_venta (fuente única de verdad)
create or replace function public.venta_recalcular(p_venta_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_pagado numeric; v_total numeric; v_estado erp.venta_estado;
begin
  select coalesce(sum(monto), 0) into v_pagado from public.pagos_venta where venta_id = p_venta_id and not anulado;
  select total, estado into v_total, v_estado from public.ventas where id = p_venta_id;
  if not found then return; end if;
  update public.ventas set
    monto_pagado = v_pagado,
    estado = case
      when v_estado = 'ANULADA' then 'ANULADA'
      when v_pagado >= v_total then 'PAGADA'
      when v_pagado > 0 then 'PARCIAL'
      else 'PENDIENTE' end::erp.venta_estado,
    updated_at = now()
  where id = p_venta_id;
end $$;

create or replace function public.trg_pagos_venta_recalcular()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.venta_recalcular(coalesce(new.venta_id, old.venta_id));
  return null;
end $$;
drop trigger if exists trg_pagos_venta_recalcular on public.pagos_venta;
create trigger trg_pagos_venta_recalcular after insert or update or delete on public.pagos_venta
  for each row execute function public.trg_pagos_venta_recalcular();

-- p: { id?, cliente_id?, cliente_nombre?, fecha?, notas?, pedido_id?,
--      descuento?, descuento_tipo?: 'monto'|'pct',
--      items: [{ producto_id?, nombre?, unidad?, cantidad, precio_unitario }],
--      pagos: [{ monto, metodo, referencia? }] }   (monto = lo aplicado, sin cambio)
create or replace function public.venta_registrar(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  ctx record; v_cfg record; v_item jsonb; v_pago jsonb;
  v_pid uuid; v_pnombre text; v_punidad text; v_pcosto numeric; v_pstock numeric;
  v_id uuid := coalesce(nullif(p->>'id', '')::uuid, gen_random_uuid());
  v_cliente uuid := nullif(p->>'cliente_id', '')::uuid;
  v_cliente_nombre text; v_cliente_mercado text;
  v_subtotal numeric := 0; v_desc numeric := 0; v_total numeric; v_pagado numeric := 0;
  v_qty numeric; v_precio numeric; v_numero bigint; v_turno uuid; v_metodo erp.metodo_pago;
  v_metodos int;
begin
  select * into ctx from public.mi_contexto();
  -- Idempotente: si el cliente reintenta con el mismo id, devuelve la venta ya creada
  if exists (select 1 from public.ventas where id = v_id) then return public.venta_obtener(v_id); end if;
  if jsonb_typeof(p->'items') <> 'array' or jsonb_array_length(p->'items') = 0 then
    raise exception 'La venta no tiene productos';
  end if;
  select * into v_cfg from public.configuracion_empresa where empresa_id = ctx.empresa;

  if v_cliente is not null then
    select nombre, mercado into v_cliente_nombre, v_cliente_mercado from public.clientes
     where id = v_cliente and empresa_id = ctx.empresa;
    if not found then raise exception 'Cliente no encontrado'; end if;
  else
    v_cliente_nombre := coalesce(nullif(trim(p->>'cliente_nombre'), ''), 'Público general');
  end if;

  for v_item in select * from jsonb_array_elements(p->'items') loop
    v_qty := coalesce((v_item->>'cantidad')::numeric, 0);
    v_precio := coalesce((v_item->>'precio_unitario')::numeric, -1);
    if v_qty <= 0 then raise exception 'Cantidad inválida en un producto'; end if;
    if v_precio < 0 then raise exception 'Precio inválido en un producto'; end if;
    v_subtotal := v_subtotal + round(v_qty * v_precio, 2);
  end loop;

  v_desc := greatest(coalesce((p->>'descuento')::numeric, 0), 0);
  if p->>'descuento_tipo' = 'pct' then v_desc := round(v_subtotal * least(v_desc, 100) / 100, 2);
  else v_desc := least(v_desc, v_subtotal); end if;
  v_total := v_subtotal - v_desc;

  select coalesce(sum((x->>'monto')::numeric), 0), count(distinct public.metodo_pago_normalizar(x->>'metodo'))
    into v_pagado, v_metodos
    from jsonb_array_elements(coalesce(p->'pagos', '[]')) x where coalesce((x->>'monto')::numeric, 0) > 0;
  if v_pagado > v_total + 0.005 then raise exception 'El pago (%) supera el total de la venta (%)', v_pagado, v_total; end if;
  if v_pagado < v_total - 0.005 then
    if v_cliente is null then raise exception 'Para vender a crédito selecciona un cliente registrado'; end if;
    if coalesce(v_cfg.permite_venta_credito, true) = false then raise exception 'La venta a crédito está desactivada en tu empresa'; end if;
  end if;
  v_metodo := case
    when v_pagado = 0 then 'CREDITO'::erp.metodo_pago
    when v_metodos > 1 then 'MIXTO'::erp.metodo_pago
    else (select public.metodo_pago_normalizar(x->>'metodo') from jsonb_array_elements(p->'pagos') x
           where coalesce((x->>'monto')::numeric, 0) > 0 limit 1) end;

  v_turno := public.turno_abierto_id(ctx.empresa);
  v_numero := public.siguiente_numero(ctx.empresa, 'VENTA');

  insert into public.ventas (id, empresa_id, cliente_id, usuario_id, numero, estado, metodo_pago, subtotal, descuento,
    descuento_tipo, total, monto_pagado, notas, fecha, cliente_nombre, cliente_mercado, turno_id, pedido_id)
  values (v_id, ctx.empresa, v_cliente, ctx.usuario, v_numero, 'PENDIENTE', v_metodo, v_subtotal, v_desc,
    coalesce(p->>'descuento_tipo', 'monto'), v_total, 0, nullif(trim(p->>'notas'), ''),
    coalesce(nullif(p->>'fecha', '')::timestamptz, now()), v_cliente_nombre, v_cliente_mercado, v_turno,
    nullif(p->>'pedido_id', '')::uuid);

  for v_item in select * from jsonb_array_elements(p->'items') loop
    v_qty := (v_item->>'cantidad')::numeric;
    v_precio := (v_item->>'precio_unitario')::numeric;
    v_pid := null; v_pnombre := null; v_punidad := null; v_pcosto := null; v_pstock := null;
    if nullif(v_item->>'producto_id', '') is not null then
      select id, nombre, unidad, precio_costo, coalesce(stock, 0) into v_pid, v_pnombre, v_punidad, v_pcosto, v_pstock
        from public.productos where id = (v_item->>'producto_id')::uuid and empresa_id = ctx.empresa for update;
    end if;
    insert into public.venta_detalles (venta_id, empresa_id, producto_id, nombre_producto, unidad, cantidad, precio_unitario, precio_costo, descuento)
    values (v_id, ctx.empresa, v_pid, coalesce(v_pnombre, nullif(v_item->>'nombre', ''), 'Producto'),
      coalesce(v_punidad, v_item->>'unidad'), v_qty, v_precio, coalesce(v_pcosto, 0), 0);
    if v_pid is not null then
      if coalesce(v_cfg.permite_stock_negativo, true) = false and v_pstock < v_qty then
        raise exception 'Stock insuficiente de % (disponible: %)', v_pnombre, v_pstock;
      end if;
      update public.productos set stock = coalesce(stock, 0) - v_qty where id = v_pid;
      insert into public.movimientos_inventario (empresa_id, producto_id, usuario_id, tipo, cantidad, stock_antes, stock_despues,
        costo_unitario, referencia_tipo, referencia_id, notas, producto_nombre, usuario_nombre)
      values (ctx.empresa, v_pid, ctx.usuario, 'VENTA', v_qty, v_pstock, v_pstock - v_qty,
        v_pcosto, 'VENTA', v_id, 'Venta #' || v_numero, v_pnombre, ctx.nombre);
    end if;
  end loop;

  for v_pago in select * from jsonb_array_elements(coalesce(p->'pagos', '[]')) loop
    if coalesce((v_pago->>'monto')::numeric, 0) > 0 then
      insert into public.pagos_venta (venta_id, empresa_id, usuario_id, metodo_pago, monto, referencia, turno_id)
      values (v_id, ctx.empresa, ctx.usuario, public.metodo_pago_normalizar(v_pago->>'metodo'),
        round((v_pago->>'monto')::numeric, 2), nullif(v_pago->>'referencia', ''), v_turno);
    end if;
  end loop;
  perform public.venta_recalcular(v_id);

  if nullif(p->>'pedido_id', '') is not null then
    update public.pedidos set estado = 'entregado', "convertedToSaleId" = v_id::text, "updatedAt" = now()
     where id = (p->>'pedido_id')::uuid and empresa_id = ctx.empresa;
  end if;

  perform public.log_actividad(ctx.empresa, ctx.usuario, ctx.nombre,
    'Venta #' || v_numero || ' a ' || v_cliente_nombre || ' por ' || v_total, 'ventas', v_id,
    jsonb_build_object('total', v_total, 'pagado', v_pagado));
  return public.venta_obtener(v_id);
end $$;

create or replace function public.venta_cobrar(p_venta_id uuid, p_monto numeric, p_metodo text default 'efectivo', p_referencia text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ctx record; v record;
begin
  select * into ctx from public.mi_contexto();
  select * into v from public.ventas where id = p_venta_id and empresa_id = ctx.empresa for update;
  if not found then raise exception 'Venta no encontrada'; end if;
  if v.estado = 'ANULADA' then raise exception 'La venta está anulada'; end if;
  if coalesce(p_monto, 0) <= 0 then raise exception 'El monto debe ser mayor a 0'; end if;
  if p_monto > v.total - v.monto_pagado + 0.005 then
    raise exception 'El cobro (%) supera la deuda (%)', p_monto, v.total - v.monto_pagado;
  end if;
  insert into public.pagos_venta (venta_id, empresa_id, usuario_id, metodo_pago, monto, referencia, turno_id)
  values (p_venta_id, ctx.empresa, ctx.usuario, public.metodo_pago_normalizar(p_metodo), round(p_monto, 2),
    nullif(p_referencia, ''), public.turno_abierto_id(ctx.empresa));
  perform public.log_actividad(ctx.empresa, ctx.usuario, ctx.nombre,
    'Cobro de ' || round(p_monto, 2) || ' a venta #' || v.numero, 'ventas', p_venta_id, jsonb_build_object('monto', p_monto));
  return public.venta_obtener(p_venta_id);
end $$;

create or replace function public.venta_anular(p_venta_id uuid, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ctx record; v record; d record; v_stock numeric;
begin
  select * into ctx from public.mi_contexto();
  if not public.es_admin() then raise exception 'Solo un administrador puede anular ventas' using errcode = '42501'; end if;
  select * into v from public.ventas where id = p_venta_id and empresa_id = ctx.empresa for update;
  if not found then raise exception 'Venta no encontrada'; end if;
  if v.estado = 'ANULADA' then raise exception 'La venta ya está anulada'; end if;
  for d in select * from public.venta_detalles where venta_id = p_venta_id and producto_id is not null loop
    update public.productos set stock = coalesce(stock, 0) + d.cantidad where id = d.producto_id returning stock into v_stock;
    if found then
      insert into public.movimientos_inventario (empresa_id, producto_id, usuario_id, tipo, cantidad, stock_antes, stock_despues,
        referencia_tipo, referencia_id, notas, producto_nombre, usuario_nombre)
      values (ctx.empresa, d.producto_id, ctx.usuario, 'ANULACION', d.cantidad, v_stock - d.cantidad, v_stock,
        'VENTA', p_venta_id, 'Anulación venta #' || v.numero, d.nombre_producto, ctx.nombre);
    end if;
  end loop;
  update public.ventas set estado = 'ANULADA', anulada_por = ctx.usuario, anulada_at = now(),
    notas = concat_ws(' · ', notas, 'ANULADA: ' || coalesce(nullif(trim(p_motivo), ''), 'sin motivo')) where id = p_venta_id;
  update public.pagos_venta set anulado = true where venta_id = p_venta_id;
  perform public.log_actividad(ctx.empresa, ctx.usuario, ctx.nombre,
    'Anuló venta #' || v.numero || ' por ' || v.total, 'ventas', p_venta_id, jsonb_build_object('motivo', p_motivo));
  return public.venta_obtener(p_venta_id);
end $$;

-- ── Inventario ─────────────────────────────────────────────────────────────
-- p_tipo: ENTRADA (suma), SALIDA (resta), AJUSTE (fija el stock al valor indicado)
create or replace function public.stock_movimiento(p_producto_id uuid, p_tipo text, p_cantidad numeric,
  p_costo numeric default null, p_notas text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ctx record; pr record; v_nuevo numeric; v_mov numeric; v_tipo erp.movimiento_tipo; v_costo numeric;
begin
  select * into ctx from public.mi_contexto();
  if coalesce(p_cantidad, -1) < 0 then raise exception 'Cantidad inválida'; end if;
  select * into pr from public.productos where id = p_producto_id and empresa_id = ctx.empresa for update;
  if not found then raise exception 'Producto no encontrado'; end if;
  v_tipo := upper(p_tipo)::erp.movimiento_tipo;
  if v_tipo = 'ENTRADA' then v_nuevo := coalesce(pr.stock, 0) + p_cantidad; v_mov := p_cantidad;
  elsif v_tipo = 'SALIDA' then v_nuevo := coalesce(pr.stock, 0) - p_cantidad; v_mov := p_cantidad;
  elsif v_tipo = 'AJUSTE' then v_nuevo := p_cantidad; v_mov := p_cantidad - coalesce(pr.stock, 0);
  else raise exception 'Tipo de movimiento inválido'; end if;
  if v_tipo <> 'AJUSTE' and p_cantidad = 0 then raise exception 'La cantidad debe ser mayor a 0'; end if;
  -- Costo promedio ponderado en entradas con costo
  v_costo := pr.precio_costo;
  if v_tipo = 'ENTRADA' and coalesce(p_costo, 0) > 0 then
    v_costo := case when coalesce(pr.stock, 0) > 0
      then round((pr.stock * coalesce(pr.precio_costo, 0) + p_cantidad * p_costo) / (pr.stock + p_cantidad), 4)
      else p_costo end;
  end if;
  update public.productos set stock = v_nuevo, precio_costo = coalesce(v_costo, precio_costo) where id = pr.id;
  insert into public.movimientos_inventario (empresa_id, producto_id, usuario_id, tipo, cantidad, stock_antes, stock_despues,
    costo_unitario, referencia_tipo, notas, producto_nombre, usuario_nombre)
  values (ctx.empresa, pr.id, ctx.usuario, v_tipo, v_mov, coalesce(pr.stock, 0), v_nuevo,
    coalesce(p_costo, pr.precio_costo), 'MANUAL', nullif(trim(p_notas), ''), pr.nombre, ctx.nombre);
  return (select to_jsonb(x) from public.productos x where x.id = pr.id);
end $$;

-- ── Caja por turnos ────────────────────────────────────────────────────────
create or replace function public.caja_resumen(p_turno_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_emp uuid := public.get_empresa_id(); t record; r jsonb;
begin
  if p_turno_id is null then select * into t from public.caja_turnos where empresa_id = v_emp and estado = 'ABIERTO';
  else select * into t from public.caja_turnos where id = p_turno_id and empresa_id = v_emp; end if;
  if not found then return null; end if;
  select jsonb_build_object(
    'turno', to_jsonb(t),
    'ventas_efectivo', coalesce((select sum(monto) from public.pagos_venta where turno_id = t.id and not anulado and metodo_pago = 'EFECTIVO'), 0),
    'ventas_otros_metodos', coalesce((select jsonb_object_agg(metodo_pago, total) from (select metodo_pago, sum(monto) total from public.pagos_venta where turno_id = t.id and not anulado and metodo_pago <> 'EFECTIVO' group by metodo_pago) s), '{}'),
    'ingresos_efectivo', coalesce((select sum(monto) from public.gastos where turno_id = t.id and tipo = 'ingreso' and metodo_pago = 'EFECTIVO'), 0),
    'egresos_efectivo', coalesce((select sum(monto) from public.gastos where turno_id = t.id and tipo = 'egreso' and metodo_pago = 'EFECTIVO'), 0),
    'num_ventas', (select count(*) from public.ventas where turno_id = t.id and estado <> 'ANULADA')
  ) into r;
  return r || jsonb_build_object('esperado',
    t.fondo_inicial + (r->>'ventas_efectivo')::numeric + (r->>'ingresos_efectivo')::numeric - (r->>'egresos_efectivo')::numeric);
end $$;

create or replace function public.caja_abrir(p_fondo numeric default 0, p_notas text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ctx record; v_id uuid;
begin
  select * into ctx from public.mi_contexto();
  if coalesce(p_fondo, 0) < 0 then raise exception 'El fondo inicial no puede ser negativo'; end if;
  if public.turno_abierto_id(ctx.empresa) is not null then raise exception 'Ya hay una caja abierta'; end if;
  insert into public.caja_turnos (empresa_id, abierto_por, abierto_por_nombre, fondo_inicial, notas_apertura)
  values (ctx.empresa, ctx.usuario, ctx.nombre, round(coalesce(p_fondo, 0), 2), nullif(trim(p_notas), ''))
  returning id into v_id;
  perform public.log_actividad(ctx.empresa, ctx.usuario, ctx.nombre, 'Abrió caja con fondo ' || round(coalesce(p_fondo, 0), 2), 'caja_turnos', v_id);
  return public.caja_resumen(v_id);
end $$;

create or replace function public.caja_cerrar(p_arqueo numeric, p_notas text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ctx record; v_id uuid; r jsonb; v_esperado numeric;
begin
  select * into ctx from public.mi_contexto();
  if coalesce(p_arqueo, -1) < 0 then raise exception 'Ingresa el efectivo contado'; end if;
  v_id := public.turno_abierto_id(ctx.empresa);
  if v_id is null then raise exception 'No hay ninguna caja abierta'; end if;
  r := public.caja_resumen(v_id);
  v_esperado := (r->>'esperado')::numeric;
  update public.caja_turnos set estado = 'CERRADO', cerrado_por = ctx.usuario, cerrado_por_nombre = ctx.nombre,
    cerrado_at = now(), esperado = v_esperado, arqueo = round(p_arqueo, 2), diferencia = round(p_arqueo - v_esperado, 2),
    notas_cierre = nullif(trim(p_notas), '')
  where id = v_id;
  perform public.log_actividad(ctx.empresa, ctx.usuario, ctx.nombre,
    'Cerró caja. Arqueo ' || round(p_arqueo, 2) || ', esperado ' || v_esperado, 'caja_turnos', v_id);
  return public.caja_resumen(v_id);
end $$;

-- Gastos/ingresos: completa empresa, usuario y turno automáticamente
create or replace function public.trg_gastos_defaults()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.empresa_id := coalesce(new.empresa_id, public.get_empresa_id());
  new.usuario_id := coalesce(new.usuario_id, auth.uid());
  if new.usuario_nombre is null then select nombre into new.usuario_nombre from public.usuarios where id = new.usuario_id; end if;
  if tg_op = 'INSERT' and new.turno_id is null then new.turno_id := public.turno_abierto_id(new.empresa_id); end if;
  return new;
end $$;
drop trigger if exists trg_gastos_defaults on public.gastos;
create trigger trg_gastos_defaults before insert on public.gastos for each row execute function public.trg_gastos_defaults();

-- ── Producción ─────────────────────────────────────────────────────────────
create or replace function public.produccion_ejecutar(p_formula_id uuid, p_lotes numeric, p_costo_extra numeric default 0,
  p_fecha date default current_date, p_notas text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ctx record; f record; ins record; outp record; v_usado numeric; v_prod numeric; v_costo numeric; v_ingreso numeric; v_id uuid;
begin
  select * into ctx from public.mi_contexto();
  if coalesce(p_lotes, 0) <= 0 then raise exception 'La cantidad de lotes debe ser mayor a 0'; end if;
  select * into f from public.formulas_produccion where id = p_formula_id and empresa_id = ctx.empresa;
  if not found then raise exception 'Fórmula no encontrada'; end if;
  select * into ins from public.productos where id = f.insumo_id and empresa_id = ctx.empresa for update;
  if not found then raise exception 'El insumo de la fórmula ya no existe'; end if;
  select * into outp from public.productos where id = f.producto_id and empresa_id = ctx.empresa for update;
  if not found then raise exception 'El producto resultante de la fórmula ya no existe'; end if;
  v_usado := f.insumo_cantidad * p_lotes;
  v_prod := f.producto_cantidad * p_lotes;
  v_costo := (f.costo_mano_obra + f.costo_energia) * p_lotes + coalesce(p_costo_extra, 0) + v_usado * coalesce(ins.precio_costo, 0);
  v_ingreso := v_prod * coalesce(outp.precio_venta, 0);
  insert into public.ordenes_produccion (empresa_id, formula_id, formula_nombre, insumo_id, producto_id, lotes, insumo_usado, producido,
    costo_total, costo_unitario, ingreso_estimado, margen, fecha, notas, usuario_id)
  values (ctx.empresa, f.id, f.nombre, ins.id, outp.id, p_lotes, v_usado, v_prod, round(v_costo, 2),
    case when v_prod > 0 then round(v_costo / v_prod, 4) else 0 end, round(v_ingreso, 2),
    case when v_ingreso > 0 then round((v_ingreso - v_costo) / v_ingreso * 100, 2) else 0 end,
    coalesce(p_fecha, current_date), nullif(trim(p_notas), ''), ctx.usuario)
  returning id into v_id;
  update public.productos set stock = coalesce(stock, 0) - v_usado where id = ins.id;
  insert into public.movimientos_inventario (empresa_id, producto_id, usuario_id, tipo, cantidad, stock_antes, stock_despues, referencia_tipo, referencia_id, notas, producto_nombre, usuario_nombre)
  values (ctx.empresa, ins.id, ctx.usuario, 'PRODUCCION', v_usado, coalesce(ins.stock, 0), coalesce(ins.stock, 0) - v_usado, 'PRODUCCION', v_id, 'Insumo: ' || f.nombre, ins.nombre, ctx.nombre);
  update public.productos set stock = coalesce(stock, 0) + v_prod,
    precio_costo = case when v_prod > 0 then round(v_costo / v_prod, 4) else precio_costo end where id = outp.id;
  insert into public.movimientos_inventario (empresa_id, producto_id, usuario_id, tipo, cantidad, stock_antes, stock_despues, referencia_tipo, referencia_id, notas, producto_nombre, usuario_nombre)
  values (ctx.empresa, outp.id, ctx.usuario, 'PRODUCCION', v_prod, coalesce(outp.stock, 0), coalesce(outp.stock, 0) + v_prod, 'PRODUCCION', v_id, 'Producido: ' || f.nombre, outp.nombre, ctx.nombre);
  perform public.log_actividad(ctx.empresa, ctx.usuario, ctx.nombre, 'Producción ' || f.nombre || ': ' || v_prod || ' unidades', 'ordenes_produccion', v_id);
  return (select to_jsonb(o) from public.ordenes_produccion o where o.id = v_id);
end $$;

create or replace function public.produccion_anular(p_orden_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ctx record; o record;
begin
  select * into ctx from public.mi_contexto();
  if not public.es_admin() then raise exception 'Solo un administrador puede anular producciones' using errcode = '42501'; end if;
  select * into o from public.ordenes_produccion where id = p_orden_id and empresa_id = ctx.empresa for update;
  if not found then raise exception 'Orden no encontrada'; end if;
  if o.anulada then raise exception 'La orden ya está anulada'; end if;
  update public.productos set stock = coalesce(stock, 0) + o.insumo_usado where id = o.insumo_id and empresa_id = ctx.empresa;
  update public.productos set stock = coalesce(stock, 0) - o.producido where id = o.producto_id and empresa_id = ctx.empresa;
  insert into public.movimientos_inventario (empresa_id, producto_id, usuario_id, tipo, cantidad, referencia_tipo, referencia_id, notas, usuario_nombre)
  select ctx.empresa, x.pid, ctx.usuario, 'ANULACION', x.cant, 'PRODUCCION', o.id, 'Anulación producción ' || o.formula_nombre, ctx.nombre
    from (values (o.insumo_id, o.insumo_usado), (o.producto_id, o.producido)) x(pid, cant) where x.pid is not null;
  update public.ordenes_produccion set anulada = true where id = o.id;
  return (select to_jsonb(x) from public.ordenes_produccion x where x.id = o.id);
end $$;

-- ── Compras a proveedores ──────────────────────────────────────────────────
-- p: { proveedor_id?, fecha?, notas?, monto_pagado?, ingresar_stock?: bool,
--      items: [{ producto_id?, nombre, cantidad, precio_unitario }] }
create or replace function public.compra_registrar(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ctx record; v_id uuid := gen_random_uuid(); v_item jsonb; v_total numeric := 0; v_prov_id uuid; v_prov_nombre text; v_num bigint;
  v_qty numeric; v_precio numeric; v_pid uuid;
begin
  select * into ctx from public.mi_contexto();
  if jsonb_typeof(p->'items') <> 'array' or jsonb_array_length(p->'items') = 0 then raise exception 'La compra no tiene productos'; end if;
  if nullif(p->>'proveedor_id', '') is not null then
    select id, nombre into v_prov_id, v_prov_nombre from public.proveedores where id = (p->>'proveedor_id')::uuid and empresa_id = ctx.empresa;
    if not found then raise exception 'Proveedor no encontrado'; end if;
  end if;
  for v_item in select * from jsonb_array_elements(p->'items') loop
    if coalesce((v_item->>'cantidad')::numeric, 0) <= 0 then raise exception 'Cantidad inválida'; end if;
    v_total := v_total + round((v_item->>'cantidad')::numeric * coalesce((v_item->>'precio_unitario')::numeric, 0), 2);
  end loop;
  v_num := public.siguiente_numero(ctx.empresa, 'COMPRA');
  insert into public.compras (id, empresa_id, proveedor_id, proveedor_nombre, usuario_id, numero, estado, subtotal, total, monto_pagado, notas, fecha)
  values (v_id, ctx.empresa, v_prov_id, v_prov_nombre, ctx.usuario, v_num, 'RECIBIDA', v_total, v_total,
    least(greatest(coalesce((p->>'monto_pagado')::numeric, 0), 0), v_total), nullif(trim(p->>'notas'), ''),
    coalesce(nullif(p->>'fecha', '')::date, current_date));
  for v_item in select * from jsonb_array_elements(p->'items') loop
    v_qty := (v_item->>'cantidad')::numeric; v_precio := coalesce((v_item->>'precio_unitario')::numeric, 0);
    v_pid := null;
    if nullif(v_item->>'producto_id', '') is not null then
      select id into v_pid from public.productos where id = (v_item->>'producto_id')::uuid and empresa_id = ctx.empresa;
    end if;
    insert into public.compra_detalles (compra_id, empresa_id, producto_id, nombre_producto, cantidad, precio_unitario)
    values (v_id, ctx.empresa, v_pid, coalesce(nullif(v_item->>'nombre', ''), (select nombre from public.productos where id = v_pid), 'Producto'), v_qty, v_precio);
    if v_pid is not null and coalesce((p->>'ingresar_stock')::boolean, true) then
      perform public.stock_movimiento(v_pid, 'ENTRADA', v_qty, v_precio, 'Compra #' || v_num);
      update public.movimientos_inventario set tipo = 'COMPRA', referencia_tipo = 'COMPRA', referencia_id = v_id
       where id = (select id from public.movimientos_inventario where producto_id = v_pid order by created_at desc, id desc limit 1);
    end if;
  end loop;
  perform public.log_actividad(ctx.empresa, ctx.usuario, ctx.nombre, 'Compra #' || v_num || ' por ' || v_total, 'compras', v_id);
  return (select to_jsonb(c) || jsonb_build_object('detalles', (select jsonb_agg(to_jsonb(d)) from public.compra_detalles d where d.compra_id = c.id))
            from public.compras c where c.id = v_id);
end $$;

-- ── Permisos: solo usuarios autenticados pueden ejecutar las operaciones ────
do $$ declare f text; begin
  foreach f in array array[
    'venta_obtener(uuid)', 'venta_registrar(jsonb)', 'venta_cobrar(uuid, numeric, text, text)', 'venta_anular(uuid, text)',
    'stock_movimiento(uuid, text, numeric, numeric, text)', 'caja_resumen(uuid)', 'caja_abrir(numeric, text)',
    'caja_cerrar(numeric, text)', 'produccion_ejecutar(uuid, numeric, numeric, date, text)', 'produccion_anular(uuid)',
    'compra_registrar(jsonb)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['venta_recalcular(uuid)', 'turno_abierto_id(uuid)', 'log_actividad(uuid, uuid, text, text, text, uuid, jsonb)', 'mi_contexto()'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;
