-- ════════════════════════════════════════════════════════════════════════════
-- 12 · Importación masiva (productos y clientes desde Excel) y asistente de inicio
--   * Todo en una transacción: o se importa el archivo completo o nada.
--   * Las filas con datos inválidos se omiten y se informan (fila y motivo).
--   * Productos con stock inicial generan su entrada en el kardex.
--   * Los límites del plan y la vigencia se siguen aplicando (disparadores de la 11).
-- ════════════════════════════════════════════════════════════════════════════

alter table public.empresas add column if not exists onboarding_completado_at timestamptz;

-- p_filas: [{ nombre, precio, costo, stock, stock_minimo, unidad, categoria, codigo, descripcion }]
-- p_actualizar: si el producto ya existe (mismo código o mismo nombre), actualiza precio/costo/etc.
create or replace function public.productos_importar(p_filas jsonb, p_actualizar boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  ctx record; f jsonb; i int := 0;
  v_nombre text; v_codigo text; v_cat text; v_cat_id uuid; v_unidad text;
  v_precio numeric; v_costo numeric; v_stock numeric; v_min numeric;
  v_prod public.productos; v_id uuid;
  n_creados int := 0; n_actualizados int := 0; n_omitidos int := 0; n_categorias int := 0;
  v_errores jsonb := '[]';
begin
  select * into ctx from public.mi_contexto();
  if not public.es_admin() then raise exception 'Solo un administrador puede importar productos' using errcode = '42501'; end if;
  if jsonb_typeof(p_filas) <> 'array' then raise exception 'Formato inválido'; end if;
  if jsonb_array_length(p_filas) > 3000 then raise exception 'Máximo 3000 productos por archivo'; end if;

  for f in select * from jsonb_array_elements(p_filas) loop
    i := i + 1;
    begin
      v_nombre := left(trim(coalesce(f->>'nombre', '')), 200);
      v_codigo := nullif(left(trim(coalesce(f->>'codigo', '')), 60), '');
      v_cat    := nullif(left(trim(coalesce(f->>'categoria', '')), 80), '');
      v_unidad := coalesce(nullif(left(trim(coalesce(f->>'unidad', '')), 30), ''), 'unidad');
      v_precio := nullif(trim(coalesce(f->>'precio', '')), '')::numeric;
      v_costo  := coalesce(nullif(trim(coalesce(f->>'costo', '')), '')::numeric, 0);
      v_stock  := nullif(trim(coalesce(f->>'stock', '')), '')::numeric;
      v_min    := coalesce(nullif(trim(coalesce(f->>'stock_minimo', '')), '')::numeric, 0);
      if v_nombre = '' then raise exception 'Falta el nombre'; end if;
      if v_precio is null or v_precio < 0 then raise exception 'Precio de venta inválido'; end if;
      if v_costo < 0 or v_min < 0 or coalesce(v_stock, 0) < 0 then raise exception 'Costo, stock o stock mínimo negativo'; end if;

      -- Categoría: se crea si no existe
      v_cat_id := null;
      if v_cat is not null then
        select id into v_cat_id from public.categorias where empresa_id = ctx.empresa and tipo = 'PRODUCTO' and lower(nombre) = lower(v_cat);
        if v_cat_id is null then
          insert into public.categorias (empresa_id, nombre, tipo) values (ctx.empresa, v_cat, 'PRODUCTO') returning id into v_cat_id;
          n_categorias := n_categorias + 1;
        end if;
      end if;

      -- ¿Ya existe? Primero por código (incluye dados de baja), luego por nombre entre los activos
      v_prod := null;
      if v_codigo is not null then
        select * into v_prod from public.productos where empresa_id = ctx.empresa and codigo = v_codigo for update;
      end if;
      if v_prod.id is null then
        select * into v_prod from public.productos where empresa_id = ctx.empresa and activo and lower(nombre) = lower(v_nombre)
         order by created_at limit 1 for update;
      end if;

      if v_prod.id is not null then
        if not p_actualizar and v_prod.activo then n_omitidos := n_omitidos + 1; continue; end if;
        update public.productos set nombre = v_nombre, precio_venta = v_precio,
          precio_costo = case when v_costo > 0 then v_costo else precio_costo end,
          stock_minimo = v_min, unidad = v_unidad, categoria_id = coalesce(v_cat_id, categoria_id),
          codigo = coalesce(v_codigo, codigo), descripcion = coalesce(nullif(trim(f->>'descripcion'), ''), descripcion),
          activo = true, updated_at = now()
         where id = v_prod.id;
        -- Stock indicado: ajuste con su registro en el kardex
        if v_stock is not null and v_stock <> coalesce(v_prod.stock, 0) then
          update public.productos set stock = v_stock where id = v_prod.id;
          insert into public.movimientos_inventario (empresa_id, producto_id, usuario_id, tipo, cantidad, stock_antes, stock_despues,
            costo_unitario, referencia_tipo, notas, producto_nombre, usuario_nombre)
          values (ctx.empresa, v_prod.id, ctx.usuario, 'AJUSTE', v_stock - coalesce(v_prod.stock, 0), coalesce(v_prod.stock, 0), v_stock,
            nullif(v_costo, 0), 'MANUAL', 'Ajuste por importación desde Excel', v_nombre, ctx.nombre);
        end if;
        n_actualizados := n_actualizados + 1;
      else
        insert into public.productos (empresa_id, nombre, precio_venta, precio_costo, stock, stock_minimo, unidad, categoria_id, codigo, descripcion)
        values (ctx.empresa, v_nombre, v_precio, v_costo, coalesce(v_stock, 0), v_min, v_unidad, v_cat_id, v_codigo,
          nullif(trim(coalesce(f->>'descripcion', '')), ''))
        returning id into v_id;
        if coalesce(v_stock, 0) > 0 then
          insert into public.movimientos_inventario (empresa_id, producto_id, usuario_id, tipo, cantidad, stock_antes, stock_despues,
            costo_unitario, referencia_tipo, notas, producto_nombre, usuario_nombre)
          values (ctx.empresa, v_id, ctx.usuario, 'ENTRADA', v_stock, 0, v_stock, nullif(v_costo, 0), 'MANUAL',
            'Inventario inicial (importación desde Excel)', v_nombre, ctx.nombre);
        end if;
        n_creados := n_creados + 1;
      end if;
    exception
      -- Límites del plan o suscripción vencida: se aborta todo (no tiene sentido seguir)
      when raise_exception then
        if sqlerrm like 'Tu plan%' or sqlerrm like 'Tu suscripción%' then raise; end if;
        v_errores := v_errores || jsonb_build_object('fila', i, 'nombre', v_nombre, 'error', sqlerrm);
      when others then
        v_errores := v_errores || jsonb_build_object('fila', i, 'nombre', v_nombre, 'error',
          case when sqlstate = '22P02' then 'Número inválido' when sqlstate = '23505' then 'Código repetido' else sqlerrm end);
    end;
  end loop;

  perform public.log_actividad(ctx.empresa, ctx.usuario, ctx.nombre, 'Importó productos desde Excel', 'productos', null,
    jsonb_build_object('creados', n_creados, 'actualizados', n_actualizados, 'omitidos', n_omitidos, 'errores', jsonb_array_length(v_errores)));
  return jsonb_build_object('creados', n_creados, 'actualizados', n_actualizados, 'omitidos', n_omitidos,
    'categorias_nuevas', n_categorias, 'errores', v_errores);
end $$;

-- p_filas: [{ nombre, telefono, nit, direccion, mercado, notas }]
create or replace function public.clientes_importar(p_filas jsonb, p_actualizar boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  ctx record; f jsonb; i int := 0; v_nombre text; v_nit text; v_tel text; v_id uuid;
  n_creados int := 0; n_actualizados int := 0; n_omitidos int := 0; v_errores jsonb := '[]';
begin
  select * into ctx from public.mi_contexto();
  if not public.es_admin() then raise exception 'Solo un administrador puede importar clientes' using errcode = '42501'; end if;
  if jsonb_typeof(p_filas) <> 'array' then raise exception 'Formato inválido'; end if;
  if jsonb_array_length(p_filas) > 5000 then raise exception 'Máximo 5000 clientes por archivo'; end if;

  for f in select * from jsonb_array_elements(p_filas) loop
    i := i + 1;
    begin
      v_nombre := left(trim(coalesce(f->>'nombre', '')), 150);
      v_nit := nullif(left(trim(coalesce(f->>'nit', '')), 30), '');
      v_tel := nullif(left(trim(coalesce(f->>'telefono', '')), 30), '');
      if v_nombre = '' then raise exception 'Falta el nombre'; end if;
      v_id := null;
      if v_nit is not null then select id into v_id from public.clientes where empresa_id = ctx.empresa and activo and nit = v_nit limit 1; end if;
      if v_id is null then select id into v_id from public.clientes where empresa_id = ctx.empresa and activo and lower(nombre) = lower(v_nombre) limit 1; end if;
      if v_id is not null then
        if not p_actualizar then n_omitidos := n_omitidos + 1; continue; end if;
        update public.clientes set nombre = v_nombre, telefono = coalesce(v_tel, telefono), nit = coalesce(v_nit, nit),
          direccion = coalesce(nullif(trim(f->>'direccion'), ''), direccion), mercado = coalesce(nullif(trim(f->>'mercado'), ''), mercado),
          notas = coalesce(nullif(trim(f->>'notas'), ''), notas), updated_at = now()
         where id = v_id;
        n_actualizados := n_actualizados + 1;
      else
        insert into public.clientes (empresa_id, nombre, telefono, nit, direccion, mercado, notas)
        values (ctx.empresa, v_nombre, v_tel, v_nit, nullif(trim(coalesce(f->>'direccion', '')), ''),
          nullif(trim(coalesce(f->>'mercado', '')), ''), nullif(trim(coalesce(f->>'notas', '')), ''));
        n_creados := n_creados + 1;
      end if;
    exception
      when raise_exception then
        if sqlerrm like 'Tu plan%' or sqlerrm like 'Tu suscripción%' then raise; end if;
        v_errores := v_errores || jsonb_build_object('fila', i, 'nombre', v_nombre, 'error', sqlerrm);
      when others then
        v_errores := v_errores || jsonb_build_object('fila', i, 'nombre', v_nombre, 'error', sqlerrm);
    end;
  end loop;

  perform public.log_actividad(ctx.empresa, ctx.usuario, ctx.nombre, 'Importó clientes desde Excel', 'clientes', null,
    jsonb_build_object('creados', n_creados, 'actualizados', n_actualizados, 'omitidos', n_omitidos));
  return jsonb_build_object('creados', n_creados, 'actualizados', n_actualizados, 'omitidos', n_omitidos, 'errores', v_errores);
end $$;

-- Asistente de inicio: el administrador lo marca como terminado (o lo vuelve a abrir)
create or replace function public.empresa_onboarding(p_completado boolean default true)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.es_admin() then raise exception 'Solo el administrador' using errcode = '42501'; end if;
  update public.empresas set onboarding_completado_at = case when p_completado then now() else null end
   where id = public.get_empresa_id();
end $$;

-- Las empresas que ya trabajan con datos no ven el asistente
update public.empresas e set onboarding_completado_at = now()
 where onboarding_completado_at is null and exists (select 1 from public.productos p where p.empresa_id = e.id);

revoke execute on function public.productos_importar(jsonb, boolean) from public, anon;
revoke execute on function public.clientes_importar(jsonb, boolean) from public, anon;
revoke execute on function public.empresa_onboarding(boolean) from public, anon;
grant execute on function public.productos_importar(jsonb, boolean) to authenticated;
grant execute on function public.clientes_importar(jsonb, boolean) to authenticated;
grant execute on function public.empresa_onboarding(boolean) to authenticated;
