-- ════════════════════════════════════════════════════════════════════════════
-- 15 · Importación desde Excel con lotes/vencimientos y variantes (talla, color…)
--      + reinicio de datos por módulo (empezar de cero)
-- ════════════════════════════════════════════════════════════════════════════

-- p_filas: [{ nombre, precio, costo, stock, stock_minimo, unidad, categoria, codigo, descripcion,
--             lote?, vencimiento? (YYYY-MM-DD), variante?: [{nombre:"Talla", valor:"M"}, …] }]
create or replace function public.productos_importar(p_filas jsonb, p_actualizar boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  ctx record; f jsonb; i int := 0; x jsonb;
  v_nombre text; v_codigo text; v_cat text; v_cat_id uuid; v_unidad text;
  v_precio numeric; v_costo numeric; v_stock numeric; v_min numeric;
  v_venc date; v_lote_cod text; v_lote uuid; v_var jsonb; v_attrs jsonb; v_vnom text;
  v_prod public.productos; v_grupo public.productos; v_id uuid; v_atr jsonb; v_pos int; v_ant numeric; n_lotes int := 0;
  n_creados int := 0; n_actualizados int := 0; n_omitidos int := 0; n_categorias int := 0; n_variantes int := 0;
  v_errores jsonb := '[]';
begin
  select * into ctx from public.mi_contexto();
  if not public.es_admin() then raise exception 'Solo un administrador puede importar productos' using errcode = '42501'; end if;
  if jsonb_typeof(p_filas) <> 'array' then raise exception 'Formato inválido'; end if;
  if jsonb_array_length(p_filas) > 3000 then raise exception 'Máximo 3000 productos por archivo'; end if;

  for f in select * from jsonb_array_elements(p_filas) loop
    i := i + 1;
    begin
      perform set_config('moxi.lote_id', '', true);
      v_nombre := left(trim(coalesce(f->>'nombre', '')), 200);
      v_codigo := nullif(left(trim(coalesce(f->>'codigo', '')), 60), '');
      v_cat    := nullif(left(trim(coalesce(f->>'categoria', '')), 80), '');
      v_unidad := coalesce(nullif(left(trim(coalesce(f->>'unidad', '')), 30), ''), 'unidad');
      v_precio := nullif(trim(coalesce(f->>'precio', '')), '')::numeric;
      v_costo  := coalesce(nullif(trim(coalesce(f->>'costo', '')), '')::numeric, 0);
      v_stock  := nullif(trim(coalesce(f->>'stock', '')), '')::numeric;
      v_min    := coalesce(nullif(trim(coalesce(f->>'stock_minimo', '')), '')::numeric, 0);
      v_venc   := nullif(trim(coalesce(f->>'vencimiento', '')), '')::date;
      v_lote_cod := coalesce(nullif(upper(left(trim(coalesce(f->>'lote', '')), 60)), ''), case when v_venc is not null then 'SIN LOTE' end);
      v_var := case when jsonb_typeof(f->'variante') = 'array' then f->'variante' else '[]' end;
      v_var := coalesce((select jsonb_agg(e) from jsonb_array_elements(v_var) e where nullif(trim(e->>'nombre'), '') is not null and nullif(trim(e->>'valor'), '') is not null), '[]');
      if v_nombre = '' then raise exception 'Falta el nombre'; end if;
      if v_precio is null or v_precio < 0 then raise exception 'Precio de venta inválido'; end if;
      if v_costo < 0 or v_min < 0 or coalesce(v_stock, 0) < 0 then raise exception 'Costo, stock o stock mínimo negativo'; end if;

      v_cat_id := null;
      if v_cat is not null then
        select id into v_cat_id from public.categorias where empresa_id = ctx.empresa and tipo = 'PRODUCTO' and lower(nombre) = lower(v_cat);
        if v_cat_id is null then
          insert into public.categorias (empresa_id, nombre, tipo) values (ctx.empresa, v_cat, 'PRODUCTO') returning id into v_cat_id;
          n_categorias := n_categorias + 1;
        end if;
      end if;

      v_prod := null;
      if jsonb_array_length(v_var) > 0 then
        -- ── Variante: el "nombre" es el producto (grupo) y las columnas Talla/Color… definen la variante
        v_attrs := (select jsonb_object_agg(trim(e->>'nombre'), trim(e->>'valor')) from jsonb_array_elements(v_var) e);
        v_vnom := (select string_agg(trim(e->>'valor'), ' / ' order by o) from jsonb_array_elements(v_var) with ordinality t(e, o));
        select * into v_grupo from public.productos where empresa_id = ctx.empresa and activo and padre_id is null and lower(nombre) = lower(v_nombre)
         order by es_grupo desc, created_at limit 1 for update;
        if v_grupo.id is null then
          insert into public.productos (empresa_id, nombre, precio_venta, precio_costo, stock, stock_minimo, unidad, categoria_id, es_grupo, atributos, controla_lotes)
          values (ctx.empresa, v_nombre, v_precio, v_costo, 0, v_min, v_unidad, v_cat_id, true, '[]', v_lote_cod is not null)
          returning * into v_grupo;
          n_creados := n_creados + 1;
        elsif not v_grupo.es_grupo then
          if coalesce(v_grupo.stock, 0) <> 0 then raise exception '"%" ya existe con stock propio: déjalo en 0 antes de importar sus variantes', v_nombre; end if;
          update public.productos set es_grupo = true, atributos = '[]' where id = v_grupo.id returning * into v_grupo;
        end if;
        -- Agrega a la definición del grupo las características y valores nuevos (en orden)
        v_atr := case when jsonb_typeof(v_grupo.atributos) = 'array' then v_grupo.atributos else '[]' end;
        for x in select * from jsonb_array_elements(v_var) loop
          select o - 1 into v_pos from jsonb_array_elements(v_atr) with ordinality t(a, o) where a->>'nombre' = trim(x->>'nombre');
          if v_pos is null then
            v_atr := v_atr || jsonb_build_array(jsonb_build_object('nombre', trim(x->>'nombre'), 'valores', jsonb_build_array(trim(x->>'valor'))));
          elsif not (v_atr->v_pos->'valores') ? trim(x->>'valor') then
            v_atr := jsonb_set(v_atr, array[v_pos::text, 'valores'], (v_atr->v_pos->'valores') || to_jsonb(trim(x->>'valor')));
          end if;
          v_pos := null;
        end loop;
        update public.productos set atributos = v_atr, controla_lotes = controla_lotes or v_lote_cod is not null where id = v_grupo.id;

        select * into v_prod from public.productos where padre_id = v_grupo.id and activo and atributos = v_attrs for update;
        if v_prod.id is null and v_codigo is not null then
          select * into v_prod from public.productos where empresa_id = ctx.empresa and codigo = v_codigo for update;
          if v_prod.id is not null and v_prod.padre_id is distinct from v_grupo.id then raise exception 'El código % ya pertenece a otro producto', v_codigo; end if;
        end if;
        if v_prod.id is null then
          insert into public.productos (empresa_id, padre_id, nombre, variante_nombre, atributos, precio_venta, precio_costo, stock, stock_minimo,
            unidad, categoria_id, codigo, controla_lotes)
          values (ctx.empresa, v_grupo.id, left(v_grupo.nombre || ' - ' || v_vnom, 200), v_vnom, v_attrs, v_precio, v_costo, 0, v_min,
            v_grupo.unidad, v_grupo.categoria_id, v_codigo, v_lote_cod is not null)
          returning * into v_prod;
          n_variantes := n_variantes + 1;
          v_prod.stock := 0;
          -- "nueva": el stock se carga abajo como entrada inicial
        elsif not p_actualizar and v_lote_cod is null then
          n_omitidos := n_omitidos + 1; continue;
        elsif p_actualizar then
          update public.productos set precio_venta = v_precio, precio_costo = case when v_costo > 0 then v_costo else precio_costo end,
            stock_minimo = v_min, codigo = coalesce(v_codigo, codigo), controla_lotes = controla_lotes or v_lote_cod is not null, updated_at = now()
           where id = v_prod.id;
          n_actualizados := n_actualizados + 1;
        end if;
      else
        -- ── Producto simple: igual que antes (por código, luego por nombre)
        if v_codigo is not null then
          select * into v_prod from public.productos where empresa_id = ctx.empresa and codigo = v_codigo for update;
        end if;
        if v_prod.id is null then
          select * into v_prod from public.productos where empresa_id = ctx.empresa and activo and not es_grupo and lower(nombre) = lower(v_nombre)
           order by created_at limit 1 for update;
        end if;
        if v_prod.id is not null then
          -- Con lote: aunque el producto exista, la fila agrega su lote (abajo)
          if not p_actualizar and v_prod.activo and v_lote_cod is null then n_omitidos := n_omitidos + 1; continue; end if;
          if p_actualizar or not v_prod.activo then
          update public.productos set nombre = case when padre_id is null then v_nombre else nombre end, precio_venta = v_precio,
            precio_costo = case when v_costo > 0 then v_costo else precio_costo end,
            stock_minimo = v_min, unidad = v_unidad, categoria_id = coalesce(v_cat_id, categoria_id),
            codigo = coalesce(v_codigo, codigo), descripcion = coalesce(nullif(trim(f->>'descripcion'), ''), descripcion),
            controla_lotes = controla_lotes or v_lote_cod is not null, activo = true, updated_at = now()
           where id = v_prod.id;
          n_actualizados := n_actualizados + 1;
          elsif v_lote_cod is not null and not v_prod.controla_lotes then
            update public.productos set controla_lotes = true where id = v_prod.id;
          end if;
        else
          insert into public.productos (empresa_id, nombre, precio_venta, precio_costo, stock, stock_minimo, unidad, categoria_id, codigo, descripcion, controla_lotes)
          values (ctx.empresa, v_nombre, v_precio, v_costo, 0, v_min, v_unidad, v_cat_id, v_codigo,
            nullif(trim(coalesce(f->>'descripcion', '')), ''), v_lote_cod is not null)
          returning * into v_prod;
          v_prod.stock := 0;
          n_creados := n_creados + 1;
        end if;
      end if;

      -- ── Stock: nueva = entrada inicial; existente con stock indicado = ajuste (ambos en el kardex y, si aplica, en su lote)
      -- ── Stock
      if v_lote_cod is not null then
        -- Fila con lote: la cantidad es la de ESE lote y se suma (un producto puede venir en varias filas, una por lote)
        if coalesce(v_stock, 0) > 0 then
          if exists (select 1 from public.lotes where producto_id = v_prod.id and codigo = v_lote_cod and vencimiento is not distinct from v_venc) then
            n_omitidos := n_omitidos + 1; continue;   -- ese lote ya se importó antes
          end if;
          insert into public.lotes (empresa_id, producto_id, codigo, vencimiento, costo_unitario)
          values (ctx.empresa, v_prod.id, v_lote_cod, v_venc, nullif(v_costo, 0)) returning id into v_lote;
          perform set_config('moxi.lote_id', v_lote::text, true);
          select coalesce(stock, 0) into v_ant from public.productos where id = v_prod.id for update;
          update public.productos set stock = v_ant + v_stock where id = v_prod.id;
          insert into public.movimientos_inventario (empresa_id, producto_id, usuario_id, tipo, cantidad, stock_antes, stock_despues,
            costo_unitario, referencia_tipo, notas, producto_nombre, usuario_nombre)
          values (ctx.empresa, v_prod.id, ctx.usuario, 'ENTRADA', v_stock, v_ant, v_ant + v_stock, nullif(v_costo, 0), 'MANUAL',
            'Importación desde Excel · lote ' || v_lote_cod || coalesce(' · vence ' || to_char(v_venc, 'DD/MM/YYYY'), ''),
            (select nombre from public.productos where id = v_prod.id), ctx.nombre);
          perform set_config('moxi.lote_id', '', true);
          v_lote := null; n_lotes := n_lotes + 1;
        end if;
      elsif v_stock is not null and v_stock <> coalesce(v_prod.stock, 0) then
        -- Sin lote: el stock indicado es el total (nuevo = entrada inicial, existente = ajuste)
        update public.productos set stock = v_stock where id = v_prod.id;
        insert into public.movimientos_inventario (empresa_id, producto_id, usuario_id, tipo, cantidad, stock_antes, stock_despues,
          costo_unitario, referencia_tipo, notas, producto_nombre, usuario_nombre)
        values (ctx.empresa, v_prod.id, ctx.usuario, (case when coalesce(v_prod.stock, 0) = 0 then 'ENTRADA' else 'AJUSTE' end)::erp.movimiento_tipo,
          v_stock - coalesce(v_prod.stock, 0), coalesce(v_prod.stock, 0), v_stock, nullif(v_costo, 0), 'MANUAL',
          case when coalesce(v_prod.stock, 0) = 0 then 'Inventario inicial (importación desde Excel)' else 'Ajuste por importación desde Excel' end,
          (select nombre from public.productos where id = v_prod.id), ctx.nombre);
      end if;
    exception
      when raise_exception then
        if sqlerrm like 'Tu plan%' or sqlerrm like 'Tu suscripción%' then raise; end if;
        v_errores := v_errores || jsonb_build_object('fila', i, 'nombre', v_nombre, 'error', sqlerrm);
      when others then
        v_errores := v_errores || jsonb_build_object('fila', i, 'nombre', v_nombre, 'error',
          case when sqlstate in ('22P02', '22007', '22008') then 'Número o fecha inválida' when sqlstate = '23505' then 'Código repetido' else sqlerrm end);
    end;
    v_prod := null; v_grupo := null;
  end loop;
  perform set_config('moxi.lote_id', '', true);

  perform public.log_actividad(ctx.empresa, ctx.usuario, ctx.nombre, 'Importó productos desde Excel', 'productos', null,
    jsonb_build_object('creados', n_creados, 'variantes', n_variantes, 'actualizados', n_actualizados, 'omitidos', n_omitidos, 'errores', jsonb_array_length(v_errores)));
  return jsonb_build_object('creados', n_creados, 'variantes', n_variantes, 'lotes', n_lotes, 'actualizados', n_actualizados, 'omitidos', n_omitidos,
    'categorias_nuevas', n_categorias, 'errores', v_errores);
end $$;

-- ── Empezar de cero: borra los módulos que el administrador elija ──────────────
-- p_modulos ⊆ {ventas, caja, productos, clientes, proveedores, pedidos, produccion, actividad}
-- p_confirmacion: el nombre exacto de la empresa (evita borrados por error)
create or replace function public.empresa_reiniciar(p_modulos text[], p_confirmacion text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ctx record; v_nombre text; r jsonb := '{}'; n int; v_validos text[] := array['ventas','caja','productos','clientes','proveedores','pedidos','produccion','actividad'];
begin
  select * into ctx from public.mi_contexto();
  if not public.es_admin() then raise exception 'Solo el administrador puede borrar datos' using errcode = '42501'; end if;
  if p_modulos is null or cardinality(p_modulos) = 0 then raise exception 'Elige al menos un módulo'; end if;
  if exists (select 1 from unnest(p_modulos) m where not m = any(v_validos)) then raise exception 'Módulo no válido'; end if;
  select nombre into v_nombre from public.empresas where id = ctx.empresa;
  if lower(trim(coalesce(p_confirmacion, ''))) <> lower(trim(v_nombre)) then
    raise exception 'Escribe exactamente el nombre de tu empresa para confirmar';
  end if;

  if 'ventas' = any(p_modulos) then
    delete from public.lote_consumos where empresa_id = ctx.empresa and referencia_id in (select id from public.ventas where empresa_id = ctx.empresa);
    delete from public.movimientos_inventario where empresa_id = ctx.empresa and referencia_tipo = 'VENTA';
    delete from public.ventas where empresa_id = ctx.empresa;      -- detalles y pagos en cascada
    get diagnostics n = row_count; r := r || jsonb_build_object('ventas', n);
    update public.contadores_correlativo set ultimo_numero = 0 where empresa_id = ctx.empresa and tipo = 'VENTA';
  end if;
  if 'caja' = any(p_modulos) then
    update public.ventas set turno_id = null where empresa_id = ctx.empresa and turno_id is not null;
    update public.pagos_venta set turno_id = null where empresa_id = ctx.empresa and turno_id is not null;
    delete from public.gastos where empresa_id = ctx.empresa;
    get diagnostics n = row_count; r := r || jsonb_build_object('gastos', n);
    delete from public.caja_turnos where empresa_id = ctx.empresa;
  end if;
  if 'pedidos' = any(p_modulos) then
    delete from public.pedidos where empresa_id = ctx.empresa;
    get diagnostics n = row_count; r := r || jsonb_build_object('pedidos', n);
  end if;
  if 'produccion' = any(p_modulos) then
    delete from public.ordenes_produccion where empresa_id = ctx.empresa;
    delete from public.formulas_produccion where empresa_id = ctx.empresa;
    get diagnostics n = row_count; r := r || jsonb_build_object('formulas', n);
  end if;
  if 'proveedores' = any(p_modulos) then
    delete from public.compras where empresa_id = ctx.empresa;     -- detalles en cascada
    delete from public.proveedores where empresa_id = ctx.empresa;
    get diagnostics n = row_count; r := r || jsonb_build_object('proveedores', n);
    update public.contadores_correlativo set ultimo_numero = 0 where empresa_id = ctx.empresa and tipo = 'COMPRA';
  end if;
  if 'productos' = any(p_modulos) then
    -- Las ventas que se conserven guardan el nombre del producto en su detalle
    delete from public.productos where empresa_id = ctx.empresa;   -- kardex, lotes y variantes en cascada
    get diagnostics n = row_count; r := r || jsonb_build_object('productos', n);
    delete from public.categorias where empresa_id = ctx.empresa and tipo = 'PRODUCTO';
  end if;
  if 'clientes' = any(p_modulos) then
    delete from public.clientes where empresa_id = ctx.empresa;    -- las ventas conservan el nombre del cliente
    get diagnostics n = row_count; r := r || jsonb_build_object('clientes', n);
  end if;
  if 'actividad' = any(p_modulos) then
    delete from public.activity_logs where empresa_id = ctx.empresa;
  end if;

  perform public.log_actividad(ctx.empresa, ctx.usuario, ctx.nombre, 'Borró datos para empezar de cero: ' || array_to_string(p_modulos, ', '), 'empresas', ctx.empresa, r);
  return r;
end $$;

revoke execute on function public.empresa_reiniciar(text[], text) from public, anon;
grant execute on function public.empresa_reiniciar(text[], text) to authenticated;
