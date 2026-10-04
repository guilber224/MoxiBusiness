-- ════════════════════════════════════════════════════════════════════════════
-- 13 · Variantes de producto (talla, color, sabor…)
--   Cada variante es un producto normal enlazado a su "grupo" (padre_id), así
--   ventas, kardex, compras, anulaciones e importación funcionan sin cambios.
--   * El grupo no se vende ni mueve stock: su stock es la suma de sus variantes.
--   * Cambiar nombre, categoría o unidad del grupo se refleja en sus variantes.
--   * Dar de baja el grupo da de baja sus variantes.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.productos
  add column if not exists padre_id uuid references public.productos(id) on delete cascade,
  add column if not exists es_grupo boolean not null default false,
  add column if not exists variante_nombre text,
  add column if not exists atributos jsonb;   -- grupo: [{"nombre":"Talla","valores":["S","M"]}] · variante: {"Talla":"M","Color":"Rojo"}
create index if not exists idx_productos_padre on public.productos (padre_id) where padre_id is not null;

-- El grupo no se vende ni se mueve: hay que elegir la variante
create or replace function public.trg_bloquear_grupo()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_nombre text;
begin
  if new.producto_id is null then return new; end if;
  select nombre into v_nombre from public.productos where id = new.producto_id and es_grupo;
  if found then raise exception 'Elige la variante (talla, color…) de "%"', v_nombre using errcode = 'P0001'; end if;
  return new;
end $$;
drop trigger if exists bloquear_grupo on public.venta_detalles;
create trigger bloquear_grupo before insert on public.venta_detalles for each row execute function public.trg_bloquear_grupo();
drop trigger if exists bloquear_grupo on public.movimientos_inventario;
create trigger bloquear_grupo before insert on public.movimientos_inventario for each row execute function public.trg_bloquear_grupo();
drop trigger if exists bloquear_grupo on public.compra_detalles;
create trigger bloquear_grupo before insert on public.compra_detalles for each row execute function public.trg_bloquear_grupo();

-- Stock del grupo = suma de sus variantes activas
create or replace function public.trg_stock_grupo()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_padre uuid;
begin
  for v_padre in select distinct x from unnest(array[case when tg_op <> 'INSERT' then old.padre_id end,
                                                     case when tg_op <> 'DELETE' then new.padre_id end]) x where x is not null loop
    update public.productos g set stock = coalesce((select sum(c.stock) from public.productos c where c.padre_id = v_padre and c.activo), 0)
     where g.id = v_padre and g.es_grupo;
  end loop;
  return null;
end $$;
drop trigger if exists stock_grupo on public.productos;
create trigger stock_grupo after insert or delete or update of stock, activo, padre_id on public.productos
  for each row when (pg_trigger_depth() < 2) execute function public.trg_stock_grupo();

-- Cambios del grupo que deben verse en sus variantes
create or replace function public.trg_grupo_a_variantes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not new.es_grupo then return null; end if;
  if new.activo is distinct from old.activo and not new.activo then
    update public.productos set activo = false where padre_id = new.id;
  end if;
  if new.nombre is distinct from old.nombre or new.categoria_id is distinct from old.categoria_id or new.unidad is distinct from old.unidad then
    update public.productos set nombre = left(new.nombre || ' - ' || coalesce(variante_nombre, ''), 200),
      categoria_id = new.categoria_id, unidad = new.unidad
     where padre_id = new.id;
  end if;
  return null;
end $$;
drop trigger if exists grupo_a_variantes on public.productos;
create trigger grupo_a_variantes after update of nombre, categoria_id, unidad, activo on public.productos
  for each row when (pg_trigger_depth() < 2) execute function public.trg_grupo_a_variantes();

-- Guardar las variantes de un producto (crear, actualizar y quitar en una sola transacción)
-- p_atributos: [{"nombre":"Talla","valores":["S","M"]},{"nombre":"Color","valores":["Rojo"]}]
--   (lista ordenada: un objeto jsonb reordena sus claves y el nombre saldría "Rojo / M")
-- p_variantes: [{ id?, atributos:{"Talla":"S","Color":"Rojo"}, precio?, costo?, codigo?, stock? (solo nuevas), activo? }]
create or replace function public.producto_variantes_guardar(p_padre uuid, p_atributos jsonb, p_variantes jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  ctx record; g public.productos; v jsonb; v_id uuid; v_nom text; v_claves text[]; v_attrs jsonb;
  v_ids uuid[] := '{}'; v_stock numeric; v_quitar record; n_nuevas int := 0; n_act int := 0; n_quitadas int := 0;
begin
  select * into ctx from public.mi_contexto();
  select * into g from public.productos where id = p_padre and empresa_id = ctx.empresa for update;
  if not found then raise exception 'Producto no encontrado'; end if;
  if g.padre_id is not null then raise exception 'Una variante no puede tener variantes'; end if;
  if jsonb_typeof(coalesce(p_variantes, '[]')) <> 'array' then raise exception 'Formato inválido'; end if;
  if jsonb_array_length(p_variantes) > 300 then raise exception 'Máximo 300 variantes por producto'; end if;
  v_claves := case when jsonb_typeof(p_atributos) = 'array'
    then array(select x->>'nombre' from jsonb_array_elements(p_atributos) with ordinality t(x, i) order by i)
    else array(select jsonb_object_keys(coalesce(p_atributos, '{}'))) end;

  if jsonb_array_length(p_variantes) > 0 and not g.es_grupo then
    if coalesce(g.stock, 0) <> 0 then
      raise exception 'Para crear variantes, primero deja el stock de "%" en 0 con un ajuste de inventario (tiene %).', g.nombre, g.stock;
    end if;
    update public.productos set es_grupo = true where id = g.id;
  end if;
  update public.productos set atributos = p_atributos where id = g.id;

  for v in select * from jsonb_array_elements(p_variantes) loop
    v_attrs := coalesce(v->'atributos', '{}');
    v_nom := array_to_string(array(select nullif(trim(v_attrs->>k), '') from unnest(v_claves) k), ' / ');
    if coalesce(v_nom, '') = '' then raise exception 'Cada variante necesita al menos un valor (talla, color…)'; end if;
    v_id := nullif(v->>'id', '')::uuid;
    if v_id is not null then
      update public.productos set
        nombre = left(g.nombre || ' - ' || v_nom, 200), variante_nombre = v_nom, atributos = v_attrs,
        precio_venta = coalesce(nullif(v->>'precio', '')::numeric, precio_venta),
        precio_costo = coalesce(nullif(v->>'costo', '')::numeric, precio_costo),
        codigo = nullif(trim(coalesce(v->>'codigo', '')), ''),
        activo = coalesce((v->>'activo')::boolean, true), updated_at = now()
       where id = v_id and padre_id = g.id;
      if not found then raise exception 'Variante no encontrada'; end if;
      n_act := n_act + 1;
    else
      if exists (select 1 from public.productos where padre_id = g.id and activo and atributos = v_attrs) then
        raise exception 'La variante "%" está repetida', v_nom;
      end if;
      insert into public.productos (empresa_id, padre_id, nombre, variante_nombre, atributos, precio_venta, precio_costo,
        stock, stock_minimo, unidad, categoria_id, codigo, descripcion)
      values (ctx.empresa, g.id, left(g.nombre || ' - ' || v_nom, 200), v_nom, v_attrs,
        coalesce(nullif(v->>'precio', '')::numeric, g.precio_venta), coalesce(nullif(v->>'costo', '')::numeric, g.precio_costo),
        0, coalesce(g.stock_minimo, 0), g.unidad, g.categoria_id, nullif(trim(coalesce(v->>'codigo', '')), ''), null)
      returning id into v_id;
      v_stock := coalesce(nullif(v->>'stock', '')::numeric, 0);
      if v_stock < 0 then raise exception 'El stock inicial no puede ser negativo'; end if;
      if v_stock > 0 then
        update public.productos set stock = v_stock where id = v_id;
        insert into public.movimientos_inventario (empresa_id, producto_id, usuario_id, tipo, cantidad, stock_antes, stock_despues,
          costo_unitario, referencia_tipo, notas, producto_nombre, usuario_nombre)
        values (ctx.empresa, v_id, ctx.usuario, 'ENTRADA', v_stock, 0, v_stock,
          nullif(coalesce(nullif(v->>'costo', '')::numeric, g.precio_costo), 0), 'MANUAL', 'Stock inicial de la variante',
          left(g.nombre || ' - ' || v_nom, 200), ctx.nombre);
      end if;
      n_nuevas := n_nuevas + 1;
    end if;
    v_ids := v_ids || v_id;
  end loop;

  -- Variantes que ya no están en la lista: se dan de baja (solo si no tienen stock)
  for v_quitar in select id, variante_nombre, stock from public.productos where padre_id = g.id and activo and not (id = any(v_ids)) loop
    if coalesce(v_quitar.stock, 0) <> 0 then
      raise exception 'No puedes quitar la variante "%" porque tiene stock (%). Ajusta su stock a 0 primero.', v_quitar.variante_nombre, v_quitar.stock;
    end if;
    update public.productos set activo = false where id = v_quitar.id;
    n_quitadas := n_quitadas + 1;
  end loop;

  -- Sin variantes activas, vuelve a ser un producto normal
  if not exists (select 1 from public.productos where padre_id = g.id and activo) then
    update public.productos set es_grupo = false, atributos = null, stock = 0 where id = g.id;
  else
    update public.productos set stock = (select coalesce(sum(stock), 0) from public.productos where padre_id = g.id and activo) where id = g.id;
  end if;

  return jsonb_build_object('nuevas', n_nuevas, 'actualizadas', n_act, 'quitadas', n_quitadas);
exception when unique_violation then
  raise exception 'Hay un código de barras repetido: cada variante necesita un código distinto';
end $$;

revoke execute on function public.producto_variantes_guardar(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.producto_variantes_guardar(uuid, jsonb, jsonb) to authenticated;
