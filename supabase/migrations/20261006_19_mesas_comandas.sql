-- ════════════════════════════════════════════════════════════════════════════
-- 19 · Mesas y comandas (restaurantes, cafeterías, pollerías, bares, food trucks…)
--   Mesa → comanda abierta → platos "por enviar" → cocina → listo → entregado → cobro.
--   * Comandas en mesa, para llevar o delivery (numeración propia 'COMANDA').
--   * Cada línea tiene su estado de cocina; lo ya enviado no se borra: se anula con motivo.
--   * Cuenta dividida: se puede cobrar solo algunas líneas; la comanda se cierra cuando
--     todas las líneas vigentes están pagadas. Cada cobro es una venta normal (stock y caja).
--   * Escrituras solo por funciones; lectura por empresa.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.mesas (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nombre     text not null check (length(trim(nombre)) between 1 and 40),
  zona       text,
  capacidad  int check (capacidad is null or capacidad between 1 and 100),
  orden      int not null default 0,
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists ux_mesas_nombre on public.mesas (empresa_id, lower(nombre)) where activo;

create table if not exists public.comandas (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas(id) on delete cascade,
  numero         bigint not null,
  mesa_id        uuid references public.mesas(id) on delete set null,
  mesa_nombre    text,                               -- copia por si la mesa se elimina
  tipo           text not null default 'MESA' check (tipo in ('MESA','LLEVAR','DELIVERY')),
  estado         text not null default 'ABIERTA' check (estado in ('ABIERTA','CERRADA','ANULADA')),
  personas       int check (personas is null or personas between 1 and 200),
  cliente_id     uuid references public.clientes(id) on delete set null,
  cliente_nombre text,
  cliente_telefono text,
  direccion      text,
  notas          text,
  motivo_anulacion text,
  mesero_id      uuid, mesero_nombre text,
  abierta_at     timestamptz not null default now(),
  cerrada_at     timestamptz,
  updated_at     timestamptz not null default now(),
  unique (empresa_id, numero)
);
create index if not exists idx_comandas_empresa on public.comandas (empresa_id, estado, abierta_at desc);
-- Una sola comanda abierta por mesa
create unique index if not exists ux_comanda_abierta_mesa on public.comandas (mesa_id) where estado = 'ABIERTA' and mesa_id is not null;

create table if not exists public.comanda_items (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  comanda_id  uuid not null references public.comandas(id) on delete cascade,
  producto_id uuid references public.productos(id) on delete set null,
  nombre      text not null,
  cantidad    numeric(12,3) not null check (cantidad > 0),
  precio      numeric(12,2) not null check (precio >= 0),
  nota        text,                                  -- "sin cebolla", "término medio"
  estado      text not null default 'PENDIENTE' check (estado in ('PENDIENTE','ENVIADO','LISTO','ENTREGADO','ANULADO')),
  motivo_anulacion text,
  venta_id    uuid references public.ventas(id) on delete set null,   -- pagado en esta venta
  enviado_at  timestamptz,
  listo_at    timestamptz,
  usuario_nombre text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_comanda_items_comanda on public.comanda_items (comanda_id, created_at);
create index if not exists idx_comanda_items_cocina on public.comanda_items (empresa_id, estado) where estado in ('ENVIADO','LISTO');

alter table public.mesas enable row level security;
alter table public.comandas enable row level security;
alter table public.comanda_items enable row level security;
drop policy if exists mesas_select on public.mesas;
drop policy if exists comandas_select on public.comandas;
drop policy if exists comanda_items_select on public.comanda_items;
create policy mesas_select on public.mesas for select to authenticated using (empresa_id = (select public.get_empresa_id()));
create policy comandas_select on public.comandas for select to authenticated using (empresa_id = (select public.get_empresa_id()));
create policy comanda_items_select on public.comanda_items for select to authenticated using (empresa_id = (select public.get_empresa_id()));
revoke all on public.mesas, public.comandas, public.comanda_items from anon, authenticated;
grant select on public.mesas, public.comandas, public.comanda_items to authenticated;

-- Límites del plan: el módulo "mesas"
drop trigger if exists control_plan on public.comandas;
create trigger control_plan before insert on public.comandas for each row execute function public.trg_control_plan('mesas');
update public.planes set modulos = modulos || array['mesas'] where codigo in ('basico', 'negocio') and modulos is not null and not ('mesas' = any(modulos));

do $$ begin
  begin alter publication supabase_realtime add table public.mesas; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.comandas; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.comanda_items; exception when duplicate_object then null; end;
end $$;

-- Numeración propia de comandas
alter table public.contadores_correlativo drop constraint if exists contadores_correlativo_tipo_check;
alter table public.contadores_correlativo add constraint contadores_correlativo_tipo_check
  check (tipo = any (array['VENTA', 'COMPRA', 'ORDEN', 'PRODUCCION', 'PEDIDO', 'COTIZACION', 'COMANDA']));

-- ── Mesas (configuración) ──────────────────────────────────────────────────
create or replace function public.mesa_guardar(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ctx record; m public.mesas; v_id uuid := nullif(p->>'id', '')::uuid; v_nom text := trim(coalesce(p->>'nombre', ''));
begin
  select * into ctx from public.mi_contexto();
  if not public.es_admin() then raise exception 'Solo el administrador configura las mesas' using errcode = '42501'; end if;
  if v_nom = '' then raise exception 'Indica el nombre de la mesa'; end if;
  if exists (select 1 from public.mesas where empresa_id = ctx.empresa and activo and lower(nombre) = lower(v_nom) and id is distinct from v_id) then
    raise exception 'Ya existe una mesa "%"', v_nom;
  end if;
  if v_id is null then
    insert into public.mesas (empresa_id, nombre, zona, capacidad, orden)
    values (ctx.empresa, left(v_nom, 40), nullif(trim(p->>'zona'), ''), nullif(p->>'capacidad', '')::int,
      coalesce(nullif(p->>'orden', '')::int, (select coalesce(max(orden), 0) + 1 from public.mesas where empresa_id = ctx.empresa)))
    returning * into m;
  else
    update public.mesas set nombre = left(v_nom, 40), zona = nullif(trim(p->>'zona'), ''), capacidad = nullif(p->>'capacidad', '')::int,
      orden = coalesce(nullif(p->>'orden', '')::int, orden)
    where id = v_id and empresa_id = ctx.empresa and activo returning * into m;
    if not found then raise exception 'Mesa no encontrada'; end if;
    update public.comandas set mesa_nombre = m.nombre where mesa_id = m.id and estado = 'ABIERTA';
  end if;
  return to_jsonb(m);
end $$;

create or replace function public.mesa_eliminar(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare ctx record;
begin
  select * into ctx from public.mi_contexto();
  if not public.es_admin() then raise exception 'Solo el administrador configura las mesas' using errcode = '42501'; end if;
  if exists (select 1 from public.comandas where mesa_id = p_id and estado = 'ABIERTA') then raise exception 'La mesa tiene una comanda abierta'; end if;
  update public.mesas set activo = false where id = p_id and empresa_id = ctx.empresa;
end $$;

-- ── Comandas ───────────────────────────────────────────────────────────────
-- Total vigente (sin anuladas) de una comanda, y lo que falta cobrar
create or replace function public.comanda_resumen(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'total', coalesce(sum(cantidad * precio) filter (where estado <> 'ANULADO'), 0),
    'por_cobrar', coalesce(sum(cantidad * precio) filter (where estado <> 'ANULADO' and venta_id is null), 0),
    'lineas_por_cobrar', count(*) filter (where estado <> 'ANULADO' and venta_id is null))
  from public.comanda_items where comanda_id = p_id;
$$;

create or replace function public.comanda_abrir(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ctx record; c public.comandas; v_mesa public.mesas; v_tipo text := upper(coalesce(nullif(p->>'tipo', ''), 'MESA'));
  v_cli uuid := nullif(p->>'cliente_id', '')::uuid; v_nom text; v_tel text;
begin
  select * into ctx from public.mi_contexto();
  if v_tipo not in ('MESA', 'LLEVAR', 'DELIVERY') then raise exception 'Tipo no válido'; end if;
  if v_tipo = 'MESA' then
    select * into v_mesa from public.mesas where id = nullif(p->>'mesa_id', '')::uuid and empresa_id = ctx.empresa and activo;
    if not found then raise exception 'Mesa no encontrada'; end if;
    if exists (select 1 from public.comandas where mesa_id = v_mesa.id and estado = 'ABIERTA') then
      raise exception 'La mesa % ya está ocupada', v_mesa.nombre;
    end if;
  end if;
  if v_cli is not null then
    select nombre, telefono into v_nom, v_tel from public.clientes where id = v_cli and empresa_id = ctx.empresa;
    if not found then raise exception 'Cliente no encontrado'; end if;
  end if;
  insert into public.comandas (empresa_id, numero, mesa_id, mesa_nombre, tipo, personas, cliente_id, cliente_nombre, cliente_telefono,
    direccion, notas, mesero_id, mesero_nombre)
  values (ctx.empresa, public.siguiente_numero(ctx.empresa, 'COMANDA'), v_mesa.id, v_mesa.nombre, v_tipo, nullif(p->>'personas', '')::int,
    v_cli, coalesce(nullif(trim(p->>'cliente_nombre'), ''), v_nom), coalesce(nullif(trim(p->>'cliente_telefono'), ''), v_tel),
    nullif(trim(p->>'direccion'), ''), nullif(trim(p->>'notas'), ''), ctx.usuario, ctx.nombre)
  returning * into c;
  return to_jsonb(c);
end $$;

-- Datos de la comanda: personas, cliente, notas
create or replace function public.comanda_actualizar(p_id uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ctx record; c public.comandas;
begin
  select * into ctx from public.mi_contexto();
  update public.comandas set
    personas = case when p ? 'personas' then nullif(p->>'personas', '')::int else personas end,
    cliente_nombre = case when p ? 'cliente_nombre' then nullif(trim(p->>'cliente_nombre'), '') else cliente_nombre end,
    cliente_telefono = case when p ? 'cliente_telefono' then nullif(trim(p->>'cliente_telefono'), '') else cliente_telefono end,
    direccion = case when p ? 'direccion' then nullif(trim(p->>'direccion'), '') else direccion end,
    notas = case when p ? 'notas' then nullif(trim(p->>'notas'), '') else notas end,
    updated_at = now()
  where id = p_id and empresa_id = ctx.empresa and estado = 'ABIERTA' returning * into c;
  if not found then raise exception 'Comanda no encontrada o cerrada'; end if;
  return to_jsonb(c);
end $$;

-- Agregar platos (quedan "por enviar"). p_items: [{producto_id?, nombre, cantidad, precio?, nota?}]
create or replace function public.comanda_agregar(p_id uuid, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ctx record; c public.comandas; x jsonb; v_prod public.productos; v_nombre text; v_precio numeric; n int := 0;
begin
  select * into ctx from public.mi_contexto();
  select * into c from public.comandas where id = p_id and empresa_id = ctx.empresa for update;
  if not found then raise exception 'Comanda no encontrada'; end if;
  if c.estado <> 'ABIERTA' then raise exception 'La comanda #% ya está cerrada', c.numero; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'No hay platos para agregar'; end if;
  if jsonb_array_length(p_items) > 100 then raise exception 'Máximo 100 líneas por vez'; end if;
  for x in select * from jsonb_array_elements(p_items) loop
    v_prod := null;
    if nullif(x->>'producto_id', '') is not null then
      select * into v_prod from public.productos where id = (x->>'producto_id')::uuid and empresa_id = ctx.empresa;
      if not found then raise exception 'Producto no encontrado'; end if;
      if v_prod.es_grupo then raise exception '"%" tiene variantes: elige una', v_prod.nombre; end if;
    end if;
    v_nombre := coalesce(nullif(trim(x->>'nombre'), ''), v_prod.nombre);
    v_precio := coalesce(nullif(x->>'precio', '')::numeric, v_prod.precio_venta);
    if coalesce(v_nombre, '') = '' then raise exception 'Cada línea necesita un nombre'; end if;
    if coalesce((x->>'cantidad')::numeric, 0) <= 0 then raise exception 'Cantidad inválida en "%"', v_nombre; end if;
    if v_precio is null or v_precio < 0 then raise exception 'Precio inválido en "%"', v_nombre; end if;
    insert into public.comanda_items (empresa_id, comanda_id, producto_id, nombre, cantidad, precio, nota, usuario_nombre)
    values (ctx.empresa, p_id, v_prod.id, left(v_nombre, 150), (x->>'cantidad')::numeric, v_precio, nullif(left(trim(x->>'nota'), 200), ''), ctx.nombre);
    n := n + 1;
  end loop;
  update public.comandas set updated_at = now() where id = p_id;
  return jsonb_build_object('agregados', n) || public.comanda_resumen(p_id);
end $$;

-- Cambiar cantidad o nota de una línea que aún no se envió
create or replace function public.comanda_item_editar(p_item uuid, p_cantidad numeric, p_nota text)
returns void language plpgsql security definer set search_path = public as $$
declare ctx record; i public.comanda_items;
begin
  select * into ctx from public.mi_contexto();
  select ci.* into i from public.comanda_items ci join public.comandas c on c.id = ci.comanda_id
   where ci.id = p_item and ci.empresa_id = ctx.empresa and c.estado = 'ABIERTA' for update of ci;
  if not found then raise exception 'Línea no encontrada'; end if;
  if i.estado <> 'PENDIENTE' then raise exception 'Ya se envió a cocina: anúlala y agrega otra'; end if;
  if coalesce(p_cantidad, 0) <= 0 then raise exception 'Cantidad inválida'; end if;
  update public.comanda_items set cantidad = p_cantidad, nota = nullif(left(trim(p_nota), 200), '') where id = p_item;
end $$;

-- Quitar una línea: si no se envió se borra; si ya se envió se anula con motivo (queda en el historial)
create or replace function public.comanda_item_quitar(p_item uuid, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare ctx record; i public.comanda_items; c public.comandas;
begin
  select * into ctx from public.mi_contexto();
  select ci.* into i from public.comanda_items ci where ci.id = p_item and ci.empresa_id = ctx.empresa for update;
  if not found then raise exception 'Línea no encontrada'; end if;
  select * into c from public.comandas where id = i.comanda_id;
  if c.estado <> 'ABIERTA' then raise exception 'La comanda ya está cerrada'; end if;
  if i.venta_id is not null then raise exception 'Esa línea ya se cobró'; end if;
  if i.estado = 'ANULADO' then return; end if;
  if i.estado = 'PENDIENTE' then
    delete from public.comanda_items where id = p_item;
  else
    if coalesce(trim(p_motivo), '') = '' then raise exception 'Indica por qué se anula (ya se envió a cocina)'; end if;
    update public.comanda_items set estado = 'ANULADO', motivo_anulacion = left(trim(p_motivo), 200) where id = p_item;
    perform public.log_actividad(ctx.empresa, ctx.usuario, ctx.nombre,
      'Anuló ' || i.cantidad || ' × ' || i.nombre || ' (comanda #' || c.numero || '): ' || trim(p_motivo), 'comandas', c.id);
  end if;
  update public.comandas set updated_at = now() where id = c.id;
end $$;

-- Enviar a cocina todo lo pendiente; devuelve las líneas enviadas (para imprimir la comanda de cocina)
create or replace function public.comanda_enviar(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ctx record; c public.comandas; r jsonb;
begin
  select * into ctx from public.mi_contexto();
  select * into c from public.comandas where id = p_id and empresa_id = ctx.empresa for update;
  if not found then raise exception 'Comanda no encontrada'; end if;
  if c.estado <> 'ABIERTA' then raise exception 'La comanda ya está cerrada'; end if;
  with env as (
    update public.comanda_items set estado = 'ENVIADO', enviado_at = now()
     where comanda_id = p_id and estado = 'PENDIENTE' returning *)
  select coalesce(jsonb_agg(jsonb_build_object('nombre', nombre, 'cantidad', cantidad, 'nota', nota) order by created_at), '[]') into r from env;
  if jsonb_array_length(r) = 0 then raise exception 'No hay nada nuevo para enviar a cocina'; end if;
  update public.comandas set updated_at = now() where id = p_id;
  return jsonb_build_object('numero', c.numero, 'mesa', c.mesa_nombre, 'tipo', c.tipo, 'mesero', ctx.nombre, 'items', r);
end $$;

-- Cocina / mesero: marcar líneas como listas o entregadas (p_items null = todas las de la comanda en el estado anterior)
create or replace function public.comanda_items_estado(p_id uuid, p_estado text, p_items uuid[] default null)
returns int language plpgsql security definer set search_path = public as $$
declare ctx record; v text := upper(trim(p_estado)); n int;
begin
  select * into ctx from public.mi_contexto();
  if v not in ('LISTO', 'ENTREGADO') then raise exception 'Estado no válido'; end if;
  if not exists (select 1 from public.comandas where id = p_id and empresa_id = ctx.empresa and estado = 'ABIERTA') then
    raise exception 'Comanda no encontrada o cerrada';
  end if;
  -- LISTO: lo que está en cocina. ENTREGADO: lo enviado o listo (las bebidas se pueden entregar sin pasar por "listo")
  update public.comanda_items set estado = v, listo_at = coalesce(listo_at, now())
   where comanda_id = p_id and (p_items is null or id = any(p_items))
     and ((v = 'LISTO' and estado = 'ENVIADO') or (v = 'ENTREGADO' and estado in ('ENVIADO', 'LISTO')));
  get diagnostics n = row_count;
  update public.comandas set updated_at = now() where id = p_id;
  if v = 'ENTREGADO' then perform public.comanda_cerrar_si_termino(p_id); end if;
  return n;
end $$;

-- Mover la comanda a otra mesa (o de para llevar a una mesa)
create or replace function public.comanda_mover(p_id uuid, p_mesa uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ctx record; c public.comandas; m public.mesas;
begin
  select * into ctx from public.mi_contexto();
  select * into m from public.mesas where id = p_mesa and empresa_id = ctx.empresa and activo;
  if not found then raise exception 'Mesa no encontrada'; end if;
  if exists (select 1 from public.comandas where mesa_id = p_mesa and estado = 'ABIERTA' and id <> p_id) then raise exception 'La mesa % está ocupada', m.nombre; end if;
  update public.comandas set mesa_id = m.id, mesa_nombre = m.nombre, tipo = 'MESA', updated_at = now()
   where id = p_id and empresa_id = ctx.empresa and estado = 'ABIERTA' returning * into c;
  if not found then raise exception 'Comanda no encontrada o cerrada'; end if;
  return to_jsonb(c);
end $$;

-- La comanda se cierra sola cuando todo está cobrado y no queda nada en cocina ni por enviar
create or replace function public.comanda_cerrar_si_termino(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.comanda_items where comanda_id = p_id and estado <> 'ANULADO'
              and (venta_id is null or estado in ('PENDIENTE', 'ENVIADO', 'LISTO'))) then return false; end if;
  if not exists (select 1 from public.comanda_items where comanda_id = p_id and venta_id is not null) then return false; end if;
  update public.comandas set estado = 'CERRADA', cerrada_at = now(), updated_at = now() where id = p_id and estado = 'ABIERTA';
  return true;
end $$;

-- Liberar la mesa de una comanda ya cobrada (lo que quedaba en cocina se da por entregado)
create or replace function public.comanda_liberar(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ctx record; c public.comandas;
begin
  select * into ctx from public.mi_contexto();
  select * into c from public.comandas where id = p_id and empresa_id = ctx.empresa for update;
  if not found then raise exception 'Comanda no encontrada'; end if;
  if c.estado <> 'ABIERTA' then raise exception 'La comanda ya está cerrada'; end if;
  if exists (select 1 from public.comanda_items where comanda_id = p_id and estado <> 'ANULADO' and venta_id is null) then
    raise exception 'Todavía hay consumo sin cobrar';
  end if;
  if not exists (select 1 from public.comanda_items where comanda_id = p_id and venta_id is not null) then
    raise exception 'La comanda no tiene nada cobrado: anúlala si el cliente se fue sin consumir';
  end if;
  update public.comanda_items set estado = 'ENTREGADO', listo_at = coalesce(listo_at, now())
   where comanda_id = p_id and estado in ('PENDIENTE', 'ENVIADO', 'LISTO');
  update public.comandas set estado = 'CERRADA', cerrada_at = now(), updated_at = now() where id = p_id returning * into c;
  return to_jsonb(c);
end $$;

-- Cobrar: todas las líneas sin cobrar o solo algunas (cuenta dividida). Crea una venta normal.
-- p: {items: [uuid]?, pagos: [{monto, metodo}], cliente_id?, cliente_nombre?, descuento?, descuento_tipo?}
create or replace function public.comanda_cobrar(p_id uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ctx record; c public.comandas; v jsonb; v_ids uuid[]; v_items jsonb; res jsonb; v_cli uuid := nullif(p->>'cliente_id', '')::uuid;
begin
  select * into ctx from public.mi_contexto();
  select * into c from public.comandas where id = p_id and empresa_id = ctx.empresa for update;
  if not found then raise exception 'Comanda no encontrada'; end if;
  if c.estado <> 'ABIERTA' then raise exception 'La comanda #% ya está cerrada', c.numero; end if;
  if jsonb_typeof(p->'items') = 'array' and jsonb_array_length(p->'items') > 0 then
    select array_agg(x::uuid) into v_ids from jsonb_array_elements_text(p->'items') x;
  end if;
  select array_agg(id), jsonb_agg(jsonb_build_object('producto_id', producto_id, 'nombre', nombre,
           'unidad', case when producto_id is null then 'servicio' end, 'cantidad', cantidad, 'precio_unitario', precio) order by created_at)
    into v_ids, v_items
    from public.comanda_items
   where comanda_id = p_id and estado <> 'ANULADO' and venta_id is null and (v_ids is null or id = any(v_ids));
  if v_items is null then raise exception 'No hay nada por cobrar en la comanda #%', c.numero; end if;
  v := public.venta_registrar(jsonb_build_object(
    'cliente_id', coalesce(v_cli, c.cliente_id), 'cliente_nombre', coalesce(nullif(trim(p->>'cliente_nombre'), ''), c.cliente_nombre),
    'notas', 'Comanda #' || c.numero || coalesce(' · Mesa ' || c.mesa_nombre, case c.tipo when 'LLEVAR' then ' · Para llevar' when 'DELIVERY' then ' · Delivery' else '' end),
    'descuento', coalesce(nullif(p->>'descuento', '')::numeric, 0), 'descuento_tipo', coalesce(nullif(p->>'descuento_tipo', ''), 'monto'),
    'items', v_items, 'pagos', case when jsonb_typeof(p->'pagos') = 'array' then p->'pagos' else '[]' end));
  update public.comanda_items set venta_id = (v->>'id')::uuid where id = any(v_ids);
  update public.comandas set updated_at = now() where id = p_id;
  perform public.comanda_cerrar_si_termino(p_id);
  select * into c from public.comandas where id = p_id;
  return to_jsonb(c) || jsonb_build_object('venta', v) || public.comanda_resumen(p_id);
end $$;

-- Anular la comanda completa (no debe tener nada cobrado)
create or replace function public.comanda_anular(p_id uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ctx record; c public.comandas;
begin
  select * into ctx from public.mi_contexto();
  select * into c from public.comandas where id = p_id and empresa_id = ctx.empresa for update;
  if not found then raise exception 'Comanda no encontrada'; end if;
  if c.estado <> 'ABIERTA' then raise exception 'La comanda ya está cerrada'; end if;
  if exists (select 1 from public.comanda_items where comanda_id = p_id and venta_id is not null) then
    raise exception 'La comanda tiene cobros: anula las ventas en el módulo Ventas o cobra el resto';
  end if;
  if exists (select 1 from public.comanda_items where comanda_id = p_id and estado <> 'PENDIENTE') and coalesce(trim(p_motivo), '') = '' then
    raise exception 'Indica el motivo (ya se envió a cocina)';
  end if;
  update public.comanda_items set estado = 'ANULADO', motivo_anulacion = coalesce(motivo_anulacion, nullif(trim(p_motivo), ''))
   where comanda_id = p_id and estado <> 'ANULADO';
  update public.comandas set estado = 'ANULADA', motivo_anulacion = nullif(trim(p_motivo), ''), cerrada_at = now(), updated_at = now()
   where id = p_id returning * into c;
  perform public.log_actividad(ctx.empresa, ctx.usuario, ctx.nombre,
    'Anuló comanda #' || c.numero || coalesce(' (mesa ' || c.mesa_nombre || ')', '') || coalesce(': ' || nullif(trim(p_motivo), ''), ''), 'comandas', c.id);
  return to_jsonb(c);
end $$;

revoke execute on function public.comanda_resumen(uuid) from public, anon, authenticated;
revoke execute on function public.comanda_cerrar_si_termino(uuid) from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array['mesa_guardar(jsonb)', 'mesa_eliminar(uuid)', 'comanda_abrir(jsonb)', 'comanda_actualizar(uuid, jsonb)',
    'comanda_agregar(uuid, jsonb)', 'comanda_item_editar(uuid, numeric, text)', 'comanda_item_quitar(uuid, text)', 'comanda_enviar(uuid)',
    'comanda_items_estado(uuid, text, uuid[])', 'comanda_mover(uuid, uuid)', 'comanda_cobrar(uuid, jsonb)', 'comanda_liberar(uuid)', 'comanda_anular(uuid, text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- "Empezar de cero": también puede borrar las comandas (las mesas configuradas se conservan)
do $$
declare d text := pg_get_functiondef('public.empresa_reiniciar(text[], text)'::regprocedure);
  a1 text := $a$'servicios','agenda'];$a$;
  b1 text := $b$'servicios','agenda','mesas'];$b$;
  a2 text := $a$  if 'actividad' = any(p_modulos) then$a$;
  b2 text := $b$  if 'mesas' = any(p_modulos) then
    delete from public.comandas where empresa_id = ctx.empresa;   -- líneas en cascada
    get diagnostics n = row_count; r := r || jsonb_build_object('mesas', n);
  end if;
  if 'actividad' = any(p_modulos) then$b$;
begin
  if position(b1 in d) > 0 then return; end if;
  if (length(d) - length(replace(d, a1, ''))) / length(a1) <> 1 then raise exception 'parche reiniciar: a1'; end if;
  if (length(d) - length(replace(d, a2, ''))) / length(a2) <> 1 then raise exception 'parche reiniciar: a2'; end if;
  execute replace(replace(d, a1, b1), a2, b2);
end $$;
