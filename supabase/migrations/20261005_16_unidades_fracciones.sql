-- ════════════════════════════════════════════════════════════════════════════
-- 16 · Unidades, fracciones y precio por mayor (ferreterías, abarrotes, distribuidoras)
--   * Presentaciones: vender "Caja x12" (factor 12) de un producto cuyo stock está en unidades.
--     La venta guarda la presentación; el stock y el kardex se mueven en la unidad base.
--   * Venta fraccionada: el producto acepta cantidades con decimales (kg, metros, litros).
--   * Precio por mayor: desde cierta cantidad aplica otro precio (lo calcula el punto de venta).
--   La venta y la anulación se ajustan con reemplazos exactos (si algo no coincide, no se aplica nada).
-- ════════════════════════════════════════════════════════════════════════════

alter table public.productos
  add column if not exists venta_fraccionada boolean not null default false,
  add column if not exists precio_mayor numeric(12,2) check (precio_mayor is null or precio_mayor >= 0),
  add column if not exists cantidad_mayor numeric(12,3) check (cantidad_mayor is null or cantidad_mayor > 0);

alter table public.venta_detalles
  add column if not exists presentacion text,
  add column if not exists factor numeric(12,4) not null default 1 check (factor > 0);

create table if not exists public.producto_presentaciones (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  producto_id uuid not null references public.productos(id) on delete cascade,
  nombre      text not null check (length(trim(nombre)) between 1 and 60),
  factor      numeric(12,4) not null check (factor > 0),
  precio      numeric(12,2) not null check (precio >= 0),
  codigo      text,
  activo      boolean not null default true,
  orden       int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists idx_presentaciones_producto on public.producto_presentaciones (producto_id) where activo;
create unique index if not exists uq_presentacion_codigo on public.producto_presentaciones (empresa_id, codigo) where codigo is not null and activo;
alter table public.producto_presentaciones enable row level security;
drop policy if exists presentaciones_misma_empresa on public.producto_presentaciones;
create policy presentaciones_misma_empresa on public.producto_presentaciones for all to authenticated
  using (empresa_id = (select public.get_empresa_id())) with check (empresa_id = (select public.get_empresa_id()));
revoke all on public.producto_presentaciones from anon;
grant select, insert, update, delete on public.producto_presentaciones to authenticated;
do $$ begin
  begin alter publication supabase_realtime add table public.producto_presentaciones; exception when duplicate_object then null; end;
end $$;

-- ── Venta y anulación con presentaciones (reemplazos exactos sobre la versión vigente) ──
do $parche$
declare d text; r record; n int;
begin
  d := pg_get_functiondef('public.venta_registrar(jsonb)'::regprocedure);
  for r in select * from (values
    ($a$  v_qty numeric; v_precio numeric; v_numero bigint;$a$,
     $b$  v_qty numeric; v_precio numeric; v_factor numeric; v_base numeric; v_numero bigint;$b$),
    ($a$    v_qty := (v_item->>'cantidad')::numeric;
$a$,
     $b$    v_qty := (v_item->>'cantidad')::numeric;
    v_factor := coalesce(nullif(v_item->>'factor', '')::numeric, 1);
    if v_factor <= 0 then raise exception 'Presentación inválida'; end if;
    v_base := v_qty * v_factor;   -- lo que se mueve del stock, en la unidad base
$b$),
    ($a$    insert into public.venta_detalles (venta_id, empresa_id, producto_id, nombre_producto, unidad, cantidad, precio_unitario, precio_costo, descuento)$a$,
     $b$    insert into public.venta_detalles (venta_id, empresa_id, producto_id, nombre_producto, unidad, cantidad, precio_unitario, precio_costo, descuento, presentacion, factor)$b$),
    ($a$      coalesce(v_punidad, v_item->>'unidad'), v_qty, v_precio, coalesce(v_pcosto, 0), 0);$a$,
     $b$      coalesce(nullif(v_item->>'presentacion', ''), v_punidad, v_item->>'unidad'), v_qty, v_precio, coalesce(v_pcosto, 0) * v_factor, 0,
      nullif(v_item->>'presentacion', ''), v_factor);$b$),
    ($a$v_pstock < v_qty then$a$, $b$v_pstock < v_base then$b$),
    ($a$set stock = coalesce(stock, 0) - v_qty where id = v_pid;$a$, $b$set stock = coalesce(stock, 0) - v_base where id = v_pid;$b$),
    ($a$'VENTA', v_qty, v_pstock, v_pstock - v_qty,$a$, $b$'VENTA', v_base, v_pstock, v_pstock - v_base,$b$)
  ) t(viejo, nuevo) loop
    n := (length(d) - length(replace(d, r.viejo, ''))) / length(r.viejo);
    if n <> 1 then raise exception 'venta_registrar: se esperaba 1 coincidencia de [%] y hay %', left(r.viejo, 60), n; end if;
    d := replace(d, r.viejo, r.nuevo);
  end loop;
  execute d;

  d := pg_get_functiondef('public.venta_anular(uuid,text)'::regprocedure);
  for r in select * from (values
    ($a$set stock = coalesce(stock, 0) + d.cantidad where id = d.producto_id$a$,
     $b$set stock = coalesce(stock, 0) + d.cantidad * coalesce(d.factor, 1) where id = d.producto_id$b$),
    ($a$'ANULACION', d.cantidad, v_stock - d.cantidad, v_stock,$a$,
     $b$'ANULACION', d.cantidad * coalesce(d.factor, 1), v_stock - d.cantidad * coalesce(d.factor, 1), v_stock,$b$)
  ) t(viejo, nuevo) loop
    n := (length(d) - length(replace(d, r.viejo, ''))) / length(r.viejo);
    if n <> 1 then raise exception 'venta_anular: se esperaba 1 coincidencia de [%] y hay %', left(r.viejo, 60), n; end if;
    d := replace(d, r.viejo, r.nuevo);
  end loop;
  execute d;
end $parche$;

-- Configuración de la balanza (formato de etiqueta) por empresa; el administrador la edita en Ajustes
alter table public.empresas add column if not exists balanza jsonb;
grant update (balanza) on public.empresas to authenticated;
