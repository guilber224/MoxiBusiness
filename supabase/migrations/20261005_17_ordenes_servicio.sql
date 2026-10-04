-- ════════════════════════════════════════════════════════════════════════════
-- 17 · Órdenes de servicio (técnicos de celulares, talleres, ópticas, lavanderías…)
--   Recepción del equipo → diagnóstico → reparación → listo → entrega y cobro.
--   * Numeración propia (correlativo 'ORDEN').
--   * Anticipo: entra a la caja el día que se recibe (ingreso) y al entregar se descuenta
--     como pago "ANTICIPO" de la venta, así la venta queda por el total real y la caja cuadra.
--   * Repuestos del catálogo descuentan stock al entregar (la venta usa venta_registrar).
--   * Escrituras solo por funciones; lectura por empresa.
-- ════════════════════════════════════════════════════════════════════════════

-- (en un paso aparte, antes: alter type erp.metodo_pago add value if not exists 'ANTICIPO';)
create or replace function public.metodo_pago_normalizar(p text)
returns erp.metodo_pago language sql immutable as $$
  select case lower(coalesce(p, ''))
    when 'efectivo' then 'EFECTIVO' when 'qr' then 'QR' when 'banco' then 'TRANSFERENCIA' when 'transferencia' then 'TRANSFERENCIA'
    when 'tarjeta' then 'TARJETA' when 'mixto' then 'MIXTO' when 'credito' then 'CREDITO' when 'anticipo' then 'ANTICIPO'
    else 'EFECTIVO' end::erp.metodo_pago;
$$;

create table if not exists public.ordenes_servicio (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references public.empresas(id) on delete cascade,
  numero           bigint not null,
  cliente_id       uuid references public.clientes(id) on delete set null,
  cliente_nombre   text not null,
  cliente_telefono text,
  equipo           text not null check (length(trim(equipo)) between 1 and 120),
  marca            text, modelo text, serie text,
  accesorios       text,
  falla            text not null check (length(trim(falla)) between 1 and 1000),
  diagnostico      text,
  estado           text not null default 'RECIBIDO'
                   check (estado in ('RECIBIDO','DIAGNOSTICO','ESPERA_APROBACION','EN_REPARACION','LISTO','ENTREGADO','CANCELADO')),
  presupuesto      numeric(12,2) not null default 0 check (presupuesto >= 0),
  anticipo         numeric(12,2) not null default 0 check (anticipo >= 0),
  anticipo_metodo  text,
  items            jsonb not null default '[]',   -- [{producto_id?, nombre, cantidad, precio}] repuestos y mano de obra
  tecnico          text,
  fecha_recepcion  timestamptz not null default now(),
  fecha_prometida  date,
  fecha_entrega    timestamptz,
  garantia_dias    int check (garantia_dias is null or garantia_dias between 0 and 3650),
  notas            text,
  venta_id         uuid references public.ventas(id) on delete set null,
  usuario_id       uuid, usuario_nombre text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (empresa_id, numero)
);
create index if not exists idx_ordenes_servicio_empresa on public.ordenes_servicio (empresa_id, estado, created_at desc);

create table if not exists public.ordenes_servicio_eventos (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas(id) on delete cascade,
  orden_id       uuid not null references public.ordenes_servicio(id) on delete cascade,
  estado         text not null,
  nota           text,
  usuario_nombre text,
  created_at     timestamptz not null default now()
);
create index if not exists idx_os_eventos_orden on public.ordenes_servicio_eventos (orden_id, created_at);

alter table public.ordenes_servicio enable row level security;
alter table public.ordenes_servicio_eventos enable row level security;
drop policy if exists os_select on public.ordenes_servicio;
drop policy if exists os_eventos_select on public.ordenes_servicio_eventos;
create policy os_select on public.ordenes_servicio for select to authenticated using (empresa_id = (select public.get_empresa_id()));
create policy os_eventos_select on public.ordenes_servicio_eventos for select to authenticated using (empresa_id = (select public.get_empresa_id()));
revoke all on public.ordenes_servicio, public.ordenes_servicio_eventos from anon, authenticated;
grant select on public.ordenes_servicio, public.ordenes_servicio_eventos to authenticated;

-- Límites del plan: el módulo "servicios"
drop trigger if exists control_plan on public.ordenes_servicio;
create trigger control_plan before insert on public.ordenes_servicio for each row execute function public.trg_control_plan('servicios');
update public.planes set modulos = modulos || array['servicios'] where codigo = 'negocio' and modulos is not null and not ('servicios' = any(modulos));

do $$ begin
  begin alter publication supabase_realtime add table public.ordenes_servicio; exception when duplicate_object then null; end;
end $$;

-- Validación común de repuestos/mano de obra
create or replace function public.os_items_validos(p jsonb)
returns jsonb language plpgsql immutable as $$
declare x jsonb; r jsonb := '[]';
begin
  if p is null or jsonb_typeof(p) <> 'array' then return '[]'; end if;
  if jsonb_array_length(p) > 100 then raise exception 'Máximo 100 líneas por orden'; end if;
  for x in select * from jsonb_array_elements(p) loop
    if coalesce(trim(x->>'nombre'), '') = '' then raise exception 'Cada repuesto o servicio necesita un nombre'; end if;
    if coalesce((x->>'cantidad')::numeric, 0) <= 0 then raise exception 'Cantidad inválida en "%"', x->>'nombre'; end if;
    if coalesce((x->>'precio')::numeric, -1) < 0 then raise exception 'Precio inválido en "%"', x->>'nombre'; end if;
    r := r || jsonb_build_array(jsonb_build_object('producto_id', nullif(x->>'producto_id', ''), 'nombre', left(trim(x->>'nombre'), 150),
      'cantidad', (x->>'cantidad')::numeric, 'precio', (x->>'precio')::numeric));
  end loop;
  return r;
end $$;

-- Recibir un equipo
create or replace function public.servicio_crear(p jsonb)
returns jsonb language plpgsql security definer set search_path = public set timezone = 'America/La_Paz' as $$
declare ctx record; v_num bigint; v_id uuid; v_cli uuid := nullif(p->>'cliente_id', '')::uuid; v_nom text; v_tel text;
  v_ant numeric := coalesce(nullif(p->>'anticipo', '')::numeric, 0); r public.ordenes_servicio;
begin
  select * into ctx from public.mi_contexto();
  if v_ant < 0 then raise exception 'El anticipo no puede ser negativo'; end if;
  if v_cli is not null then
    select nombre, telefono into v_nom, v_tel from public.clientes where id = v_cli and empresa_id = ctx.empresa;
    if not found then raise exception 'Cliente no encontrado'; end if;
  end if;
  v_nom := coalesce(nullif(trim(p->>'cliente_nombre'), ''), v_nom);
  if coalesce(v_nom, '') = '' then raise exception 'Indica el nombre del cliente'; end if;
  v_num := public.siguiente_numero(ctx.empresa, 'ORDEN');
  insert into public.ordenes_servicio (empresa_id, numero, cliente_id, cliente_nombre, cliente_telefono, equipo, marca, modelo, serie,
    accesorios, falla, presupuesto, anticipo, anticipo_metodo, items, tecnico, fecha_prometida, garantia_dias, notas, usuario_id, usuario_nombre)
  values (ctx.empresa, v_num, v_cli, left(v_nom, 150), coalesce(nullif(trim(p->>'cliente_telefono'), ''), v_tel),
    trim(p->>'equipo'), nullif(trim(p->>'marca'), ''), nullif(trim(p->>'modelo'), ''), nullif(trim(p->>'serie'), ''),
    nullif(trim(p->>'accesorios'), ''), trim(p->>'falla'), coalesce(nullif(p->>'presupuesto', '')::numeric, 0), v_ant,
    case when v_ant > 0 then lower(coalesce(nullif(p->>'anticipo_metodo', ''), 'efectivo')) end,
    public.os_items_validos(p->'items'), nullif(trim(p->>'tecnico'), ''), nullif(p->>'fecha_prometida', '')::date,
    nullif(p->>'garantia_dias', '')::int, nullif(trim(p->>'notas'), ''), ctx.usuario, ctx.nombre)
  returning * into r;
  insert into public.ordenes_servicio_eventos (empresa_id, orden_id, estado, nota, usuario_nombre)
  values (ctx.empresa, r.id, 'RECIBIDO', 'Equipo recibido' || case when v_ant > 0 then ' con anticipo de ' || v_ant else '' end, ctx.nombre);
  if v_ant > 0 then
    insert into public.gastos (empresa_id, tipo, categoria, descripcion, monto, metodo_pago, fecha)
    values (ctx.empresa, 'ingreso', 'Anticipo de servicio', 'Anticipo orden #' || v_num || ' · ' || r.cliente_nombre, v_ant,
      public.metodo_pago_normalizar(r.anticipo_metodo), current_date);
  end if;
  perform public.log_actividad(ctx.empresa, ctx.usuario, ctx.nombre, 'Recibió equipo (orden #' || v_num || '): ' || r.equipo, 'ordenes_servicio', r.id);
  return to_jsonb(r);
end $$;

-- Editar diagnóstico, presupuesto, repuestos, técnico… (no en órdenes cerradas)
create or replace function public.servicio_actualizar(p_id uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ctx record; o public.ordenes_servicio;
begin
  select * into ctx from public.mi_contexto();
  select * into o from public.ordenes_servicio where id = p_id and empresa_id = ctx.empresa for update;
  if not found then raise exception 'Orden no encontrada'; end if;
  if o.estado in ('ENTREGADO', 'CANCELADO') then raise exception 'La orden #% ya está cerrada', o.numero; end if;
  update public.ordenes_servicio set
    equipo = coalesce(nullif(trim(p->>'equipo'), ''), equipo), marca = case when p ? 'marca' then nullif(trim(p->>'marca'), '') else marca end,
    modelo = case when p ? 'modelo' then nullif(trim(p->>'modelo'), '') else modelo end,
    serie = case when p ? 'serie' then nullif(trim(p->>'serie'), '') else serie end,
    accesorios = case when p ? 'accesorios' then nullif(trim(p->>'accesorios'), '') else accesorios end,
    falla = coalesce(nullif(trim(p->>'falla'), ''), falla),
    diagnostico = case when p ? 'diagnostico' then nullif(trim(p->>'diagnostico'), '') else diagnostico end,
    presupuesto = case when p ? 'presupuesto' then coalesce(nullif(p->>'presupuesto', '')::numeric, 0) else presupuesto end,
    items = case when p ? 'items' then public.os_items_validos(p->'items') else items end,
    tecnico = case when p ? 'tecnico' then nullif(trim(p->>'tecnico'), '') else tecnico end,
    fecha_prometida = case when p ? 'fecha_prometida' then nullif(p->>'fecha_prometida', '')::date else fecha_prometida end,
    garantia_dias = case when p ? 'garantia_dias' then nullif(p->>'garantia_dias', '')::int else garantia_dias end,
    cliente_telefono = case when p ? 'cliente_telefono' then nullif(trim(p->>'cliente_telefono'), '') else cliente_telefono end,
    notas = case when p ? 'notas' then nullif(trim(p->>'notas'), '') else notas end,
    updated_at = now()
  where id = p_id returning * into o;
  return to_jsonb(o);
end $$;

-- Cambiar de etapa (la entrega y la cancelación tienen su propia función)
create or replace function public.servicio_estado(p_id uuid, p_estado text, p_nota text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ctx record; o public.ordenes_servicio; v text := upper(trim(p_estado));
begin
  select * into ctx from public.mi_contexto();
  if v not in ('RECIBIDO','DIAGNOSTICO','ESPERA_APROBACION','EN_REPARACION','LISTO') then raise exception 'Estado no válido'; end if;
  select * into o from public.ordenes_servicio where id = p_id and empresa_id = ctx.empresa for update;
  if not found then raise exception 'Orden no encontrada'; end if;
  if o.estado in ('ENTREGADO', 'CANCELADO') then raise exception 'La orden #% ya está cerrada', o.numero; end if;
  update public.ordenes_servicio set estado = v, updated_at = now() where id = p_id returning * into o;
  insert into public.ordenes_servicio_eventos (empresa_id, orden_id, estado, nota, usuario_nombre)
  values (ctx.empresa, p_id, v, nullif(trim(p_nota), ''), ctx.nombre);
  return to_jsonb(o);
end $$;

-- Entregar y cobrar: crea la venta (repuestos descuentan stock) y aplica el anticipo como pago
-- p_pagos: [{monto, metodo}] lo que se cobra ahora (sin el anticipo)
create or replace function public.servicio_entregar(p_id uuid, p_pagos jsonb default '[]')
returns jsonb language plpgsql security definer set search_path = public as $$
declare ctx record; o public.ordenes_servicio; v jsonb; v_total numeric; v_pagos jsonb;
begin
  select * into ctx from public.mi_contexto();
  select * into o from public.ordenes_servicio where id = p_id and empresa_id = ctx.empresa for update;
  if not found then raise exception 'Orden no encontrada'; end if;
  if o.estado in ('ENTREGADO', 'CANCELADO') then raise exception 'La orden #% ya está cerrada', o.numero; end if;
  v_total := coalesce((select sum((x->>'cantidad')::numeric * (x->>'precio')::numeric) from jsonb_array_elements(o.items) x), 0);
  if o.anticipo > v_total + 0.005 then
    raise exception 'El anticipo (%) es mayor que el total de la orden (%). Agrega los repuestos y la mano de obra antes de entregar.', o.anticipo, v_total;
  end if;
  if v_total > 0 then
    v_pagos := coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(p_pagos, '[]')) x where coalesce((x->>'monto')::numeric, 0) > 0), '[]');
    if o.anticipo > 0 then v_pagos := v_pagos || jsonb_build_array(jsonb_build_object('monto', o.anticipo, 'metodo', 'anticipo')); end if;
    v := public.venta_registrar(jsonb_build_object(
      'cliente_id', o.cliente_id, 'cliente_nombre', o.cliente_nombre,
      'notas', 'Orden de servicio #' || o.numero || ' · ' || o.equipo,
      'items', (select jsonb_agg(jsonb_build_object('producto_id', x->>'producto_id', 'nombre', x->>'nombre', 'unidad', case when nullif(x->>'producto_id', '') is null then 'servicio' end,
                 'cantidad', (x->>'cantidad')::numeric, 'precio_unitario', (x->>'precio')::numeric)) from jsonb_array_elements(o.items) x),
      'pagos', v_pagos));
  end if;
  update public.ordenes_servicio set estado = 'ENTREGADO', fecha_entrega = now(), venta_id = (v->>'id')::uuid, updated_at = now()
   where id = p_id returning * into o;
  insert into public.ordenes_servicio_eventos (empresa_id, orden_id, estado, nota, usuario_nombre)
  values (ctx.empresa, p_id, 'ENTREGADO', case when v is not null then 'Entregado · venta #' || (v->>'numero') else 'Entregado sin cobro' end, ctx.nombre);
  return to_jsonb(o) || jsonb_build_object('venta', v);
end $$;

-- Cancelar (opcional: devolver el anticipo, sale como egreso de caja)
create or replace function public.servicio_cancelar(p_id uuid, p_motivo text, p_devolver_anticipo boolean default false)
returns jsonb language plpgsql security definer set search_path = public set timezone = 'America/La_Paz' as $$
declare ctx record; o public.ordenes_servicio;
begin
  select * into ctx from public.mi_contexto();
  select * into o from public.ordenes_servicio where id = p_id and empresa_id = ctx.empresa for update;
  if not found then raise exception 'Orden no encontrada'; end if;
  if o.estado in ('ENTREGADO', 'CANCELADO') then raise exception 'La orden #% ya está cerrada', o.numero; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Indica el motivo de la cancelación'; end if;
  update public.ordenes_servicio set estado = 'CANCELADO', updated_at = now() where id = p_id returning * into o;
  insert into public.ordenes_servicio_eventos (empresa_id, orden_id, estado, nota, usuario_nombre)
  values (ctx.empresa, p_id, 'CANCELADO', trim(p_motivo), ctx.nombre);
  if p_devolver_anticipo and o.anticipo > 0 then
    insert into public.gastos (empresa_id, tipo, categoria, descripcion, monto, metodo_pago, fecha)
    values (ctx.empresa, 'egreso', 'Devolución de anticipo', 'Devolución anticipo orden #' || o.numero || ' · ' || o.cliente_nombre, o.anticipo,
      public.metodo_pago_normalizar(o.anticipo_metodo), current_date);
  end if;
  return to_jsonb(o);
end $$;

revoke execute on function public.os_items_validos(jsonb) from public, anon, authenticated;
revoke execute on function public.servicio_crear(jsonb) from public, anon;
revoke execute on function public.servicio_actualizar(uuid, jsonb) from public, anon;
revoke execute on function public.servicio_estado(uuid, text, text) from public, anon;
revoke execute on function public.servicio_entregar(uuid, jsonb) from public, anon;
revoke execute on function public.servicio_cancelar(uuid, text, boolean) from public, anon;
grant execute on function public.servicio_crear(jsonb) to authenticated;
grant execute on function public.servicio_actualizar(uuid, jsonb) to authenticated;
grant execute on function public.servicio_estado(uuid, text, text) to authenticated;
grant execute on function public.servicio_entregar(uuid, jsonb) to authenticated;
grant execute on function public.servicio_cancelar(uuid, text, boolean) to authenticated;
