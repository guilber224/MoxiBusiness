-- ════════════════════════════════════════════════════════════════════════════
-- 14 · Lotes y fechas de vencimiento (farmacias, veterinarias, alimentos)
--   * Solo para productos con controla_lotes = true.
--   * Todo movimiento de kardex se refleja en los lotes con un disparador:
--       - lo que sale se descuenta del lote que vence primero (FEFO);
--       - una anulación devuelve las unidades a los mismos lotes de los que salieron;
--       - lo que entra va al lote indicado (lote_ingresar) o al lote "SIN LOTE".
--   * Las operaciones de venta, compra y producción no cambian.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.productos add column if not exists controla_lotes boolean not null default false;

create table if not exists public.lotes (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references public.empresas(id) on delete cascade,
  producto_id      uuid not null references public.productos(id) on delete cascade,
  codigo           text not null default 'SIN LOTE' check (length(trim(codigo)) between 1 and 60),
  vencimiento      date,
  cantidad         numeric(14,4) not null default 0,     -- lo que queda del lote
  cantidad_inicial numeric(14,4) not null default 0,
  costo_unitario   numeric(12,4),
  created_at       timestamptz not null default now()
);
create index if not exists idx_lotes_producto on public.lotes (producto_id, vencimiento nulls last, created_at);
create index if not exists idx_lotes_empresa_venc on public.lotes (empresa_id, vencimiento) where cantidad > 0;
create unique index if not exists uq_lote_producto_codigo on public.lotes (producto_id, codigo, coalesce(vencimiento, 'infinity'::date));

create table if not exists public.lote_consumos (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.empresas(id) on delete cascade,
  lote_id       uuid not null references public.lotes(id) on delete cascade,
  producto_id   uuid not null,
  referencia_id uuid,                 -- venta, orden de producción, etc.
  cantidad      numeric(14,4) not null,  -- consumida (las devoluciones la reducen)
  created_at    timestamptz not null default now()
);
create index if not exists idx_lote_consumos_ref on public.lote_consumos (referencia_id, producto_id);

alter table public.lotes enable row level security;
alter table public.lote_consumos enable row level security;
drop policy if exists lotes_select on public.lotes;
drop policy if exists lote_consumos_select on public.lote_consumos;
create policy lotes_select on public.lotes for select to authenticated
  using (empresa_id = (select public.get_empresa_id()) or (select public.is_superadmin()));
create policy lote_consumos_select on public.lote_consumos for select to authenticated
  using (empresa_id = (select public.get_empresa_id()) or (select public.is_superadmin()));
-- Nadie escribe directo: solo el disparador y las funciones
revoke all on public.lotes, public.lote_consumos from anon, authenticated;
grant select on public.lotes, public.lote_consumos to authenticated;

-- Lote "SIN LOTE" del producto (para entradas sin datos de lote)
create or replace function public.lote_sin_lote(p_emp uuid, p_prod uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  select id into v from public.lotes where producto_id = p_prod and codigo = 'SIN LOTE' and vencimiento is null;
  if v is null then
    insert into public.lotes (empresa_id, producto_id, codigo) values (p_emp, p_prod, 'SIN LOTE') returning id into v;
  end if;
  return v;
end $$;

-- Refleja cada movimiento del kardex en los lotes
create or replace function public.trg_lotes_movimiento()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_delta numeric := coalesce(new.stock_despues, 0) - coalesce(new.stock_antes, 0);
  v_resto numeric; v_toma numeric; l record; c record; v_lote uuid;
begin
  if v_delta = 0 or not exists (select 1 from public.productos where id = new.producto_id and controla_lotes) then return null; end if;

  if v_delta < 0 then
    -- Sale stock: primero lo que vence antes
    v_resto := -v_delta;
    for l in select id, cantidad from public.lotes where producto_id = new.producto_id and cantidad > 0
             order by vencimiento nulls last, created_at for update loop
      exit when v_resto <= 0;
      v_toma := least(l.cantidad, v_resto);
      update public.lotes set cantidad = cantidad - v_toma where id = l.id;
      insert into public.lote_consumos (empresa_id, lote_id, producto_id, referencia_id, cantidad)
      values (new.empresa_id, l.id, new.producto_id, new.referencia_id, v_toma);
      v_resto := v_resto - v_toma;
    end loop;
    -- Si se vendió sin stock, la diferencia no sale de ningún lote (el stock queda negativo)
    return null;
  end if;

  v_resto := v_delta;
  -- Anulación: devolver a los lotes de los que salió esa misma operación
  if new.tipo::text = 'ANULACION' and new.referencia_id is not null then
    for c in select id, lote_id, cantidad from public.lote_consumos
             where referencia_id = new.referencia_id and producto_id = new.producto_id and cantidad > 0
             order by created_at desc for update loop
      exit when v_resto <= 0;
      v_toma := least(c.cantidad, v_resto);
      update public.lotes set cantidad = cantidad + v_toma where id = c.lote_id;
      update public.lote_consumos set cantidad = cantidad - v_toma where id = c.id;
      v_resto := v_resto - v_toma;
    end loop;
  end if;
  if v_resto > 0 then
    v_lote := nullif(current_setting('moxi.lote_id', true), '')::uuid;
    if v_lote is null or not exists (select 1 from public.lotes where id = v_lote and producto_id = new.producto_id) then
      v_lote := public.lote_sin_lote(new.empresa_id, new.producto_id);
    end if;
    update public.lotes set cantidad = cantidad + v_resto, cantidad_inicial = cantidad_inicial + v_resto,
      costo_unitario = coalesce(new.costo_unitario, costo_unitario) where id = v_lote;
  end if;
  return null;
end $$;
drop trigger if exists lotes_movimiento on public.movimientos_inventario;
create trigger lotes_movimiento after insert on public.movimientos_inventario for each row execute function public.trg_lotes_movimiento();

-- Al activar el control de lotes, el stock que ya había queda en "SIN LOTE"
create or replace function public.trg_activar_lotes()
returns trigger language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if new.controla_lotes and not coalesce(old.controla_lotes, false) and coalesce(new.stock, 0) > 0
     and not exists (select 1 from public.lotes where producto_id = new.id) then
    v := public.lote_sin_lote(new.empresa_id, new.id);
    update public.lotes set cantidad = new.stock, cantidad_inicial = new.stock, costo_unitario = new.precio_costo where id = v;
  end if;
  return null;
end $$;
drop trigger if exists activar_lotes on public.productos;
create trigger activar_lotes after update of controla_lotes on public.productos for each row execute function public.trg_activar_lotes();

-- Entrada de mercadería con lote y vencimiento (usa el mismo stock_movimiento de siempre)
create or replace function public.lote_ingresar(p_producto uuid, p_cantidad numeric, p_lote text, p_vencimiento date,
  p_costo numeric default null, p_notas text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ctx record; v_lote uuid; v_cod text := coalesce(nullif(upper(trim(p_lote)), ''), 'SIN LOTE'); r jsonb;
begin
  select * into ctx from public.mi_contexto();
  if not exists (select 1 from public.productos where id = p_producto and empresa_id = ctx.empresa and controla_lotes) then
    raise exception 'El producto no controla lotes';
  end if;
  if coalesce(p_cantidad, 0) <= 0 then raise exception 'La cantidad debe ser mayor a 0'; end if;
  select id into v_lote from public.lotes
   where producto_id = p_producto and codigo = v_cod and vencimiento is not distinct from p_vencimiento;
  if v_lote is null then
    insert into public.lotes (empresa_id, producto_id, codigo, vencimiento, costo_unitario)
    values (ctx.empresa, p_producto, v_cod, p_vencimiento, p_costo) returning id into v_lote;
  end if;
  perform set_config('moxi.lote_id', v_lote::text, true);
  r := public.stock_movimiento(p_producto, 'ENTRADA', p_cantidad, p_costo,
         coalesce(nullif(trim(p_notas), ''), 'Lote ' || v_cod || coalesce(' · vence ' || to_char(p_vencimiento, 'DD/MM/YYYY'), '')));
  perform set_config('moxi.lote_id', '', true);
  return r;
end $$;

-- Compra con lote: misma compra de siempre, con el lote indicado para la entrada de stock
create or replace function public.compra_registrar_lote(p jsonb, p_lote text, p_vencimiento date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ctx record; v_prod uuid := nullif(p->'items'->0->>'producto_id', '')::uuid; v_lote uuid;
  v_cod text := coalesce(nullif(upper(trim(p_lote)), ''), 'SIN LOTE'); r jsonb;
begin
  select * into ctx from public.mi_contexto();
  if v_prod is not null and exists (select 1 from public.productos where id = v_prod and empresa_id = ctx.empresa and controla_lotes) then
    select id into v_lote from public.lotes where producto_id = v_prod and codigo = v_cod and vencimiento is not distinct from p_vencimiento;
    if v_lote is null then
      insert into public.lotes (empresa_id, producto_id, codigo, vencimiento) values (ctx.empresa, v_prod, v_cod, p_vencimiento) returning id into v_lote;
    end if;
    perform set_config('moxi.lote_id', v_lote::text, true);
  end if;
  r := public.compra_registrar(p);
  perform set_config('moxi.lote_id', '', true);
  return r;
end $$;

revoke execute on function public.lote_sin_lote(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.lote_ingresar(uuid, numeric, text, date, numeric, text) from public, anon;
revoke execute on function public.compra_registrar_lote(jsonb, text, date) from public, anon;
grant execute on function public.lote_ingresar(uuid, numeric, text, date, numeric, text) to authenticated;
grant execute on function public.compra_registrar_lote(jsonb, text, date) to authenticated;

do $$ begin
  begin alter publication supabase_realtime add table public.lotes; exception when duplicate_object then null; end;
end $$;

-- Anular producción: ahora registra "stock antes → después" (el kardex lo mostraba con "?")
-- y así los lotes pueden devolver el insumo al lote del que salió.
create or replace function public.produccion_anular(p_orden_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ctx record; o record; x record; v_ant numeric; v_nombre text;
begin
  select * into ctx from public.mi_contexto();
  if not public.es_admin() then raise exception 'Solo un administrador puede anular producciones' using errcode = '42501'; end if;
  select * into o from public.ordenes_produccion where id = p_orden_id and empresa_id = ctx.empresa for update;
  if not found then raise exception 'Orden no encontrada'; end if;
  if o.anulada then raise exception 'La orden ya está anulada'; end if;
  for x in select * from (values (o.insumo_id, o.insumo_usado), (o.producto_id, -o.producido)) v(pid, delta) where v.pid is not null loop
    select coalesce(stock, 0), nombre into v_ant, v_nombre from public.productos where id = x.pid and empresa_id = ctx.empresa for update;
    if not found then continue; end if;
    update public.productos set stock = v_ant + x.delta where id = x.pid;
    insert into public.movimientos_inventario (empresa_id, producto_id, usuario_id, tipo, cantidad, stock_antes, stock_despues,
      referencia_tipo, referencia_id, notas, producto_nombre, usuario_nombre)
    values (ctx.empresa, x.pid, ctx.usuario, 'ANULACION', abs(x.delta), v_ant, v_ant + x.delta,
      'PRODUCCION', o.id, 'Anulación producción ' || o.formula_nombre, v_nombre, ctx.nombre);
  end loop;
  update public.ordenes_produccion set anulada = true where id = o.id;
  return (select to_jsonb(r) from public.ordenes_produccion r where r.id = o.id);
end $$;
