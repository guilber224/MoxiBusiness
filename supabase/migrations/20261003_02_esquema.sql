-- Moxi Business — Migración 02: esquema canónico.
-- Aditiva: solo agrega columnas/tablas/índices. La app anterior sigue funcionando
-- con sus columnas en inglés hasta el cambio de versión (migración 05 limpia).

-- ── Utilidades ─────────────────────────────────────────────────────────────
create or replace function public.get_empresa_id()
returns uuid language sql stable security definer set search_path = public as $$
  select empresa_id from public.usuarios where id = auth.uid() limit 1;
$$;

create or replace function public.get_my_role()
returns text language sql stable security definer set search_path = public as $$
  select lower(role::text) from public.usuarios where id = auth.uid() limit 1;
$$;

create or replace function public.is_superadmin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select lower(role::text) = 'superadmin' from public.usuarios where id = auth.uid() limit 1), false);
$$;

create or replace function public.es_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select lower(role::text) in ('admin','superadmin') from public.usuarios where id = auth.uid() limit 1), false);
$$;

-- Aplica la política estándar "solo filas de mi empresa" a una tabla.
create or replace function pg_temp.politica_empresa(t text) returns void language plpgsql as $$
declare r record;
begin
  execute format('alter table public.%I enable row level security', t);
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
    execute format('drop policy if exists %I on public.%I', r.policyname, t);
  end loop;
  execute format($p$create policy %I on public.%I for all to authenticated
    using (empresa_id = (select public.get_empresa_id()))
    with check (empresa_id = (select public.get_empresa_id()))$p$, t || '_misma_empresa', t);
  execute format('revoke all on public.%I from anon', t);
  execute format('grant select, insert, update, delete on public.%I to authenticated', t);
end $$;

-- ── Empresa: configuración en el servidor (antes solo en el navegador) ──────
alter table public.empresas
  add column if not exists qr_url text,
  add column if not exists email text,
  add column if not exists rubro text;
alter table public.empresas alter column timezone set default 'America/La_Paz';
alter table public.empresas alter column moneda set default 'BOB';

alter table public.configuracion_empresa
  alter column permite_stock_negativo set default true,
  alter column permite_venta_credito set default true;

-- ── Productos ──────────────────────────────────────────────────────────────
-- Canónicas: nombre, precio_venta, precio_costo, stock_minimo, unidad, descripcion,
-- imagen_url (URL de Storage, nunca base64), categoria_id, codigo (barras), stock.
alter table public.productos alter column stock set default 0;
update public.productos set stock = 0 where stock is null;
create index if not exists idx_productos_empresa_nombre on public.productos (empresa_id, nombre);

-- ── Clientes ───────────────────────────────────────────────────────────────
alter table public.clientes add column if not exists mercado text;

-- ── Ventas: cabecera + venta_detalles + pagos_venta ─────────────────────────
alter table public.ventas
  add column if not exists cliente_nombre text,
  add column if not exists cliente_mercado text,
  add column if not exists fecha timestamptz,
  add column if not exists descuento_tipo text default 'monto',
  add column if not exists turno_id uuid,
  add column if not exists pedido_id uuid,
  add column if not exists legacy_migrado_at timestamptz;
alter table public.ventas alter column fecha set default now();
create index if not exists idx_ventas_empresa_fecha on public.ventas (empresa_id, fecha desc);
create index if not exists idx_ventas_cliente on public.ventas (cliente_id) where cliente_id is not null;

alter table public.venta_detalles
  add column if not exists unidad text,
  add column if not exists created_at timestamptz default now();
create index if not exists idx_venta_detalles_venta on public.venta_detalles (venta_id);
create index if not exists idx_venta_detalles_producto on public.venta_detalles (empresa_id, producto_id);

alter table public.pagos_venta
  add column if not exists turno_id uuid,
  add column if not exists anulado boolean not null default false,
  add column if not exists fecha timestamptz default now();
create index if not exists idx_pagos_venta_venta on public.pagos_venta (venta_id);
create index if not exists idx_pagos_venta_turno on public.pagos_venta (turno_id) where turno_id is not null;

-- ── Caja por turnos ────────────────────────────────────────────────────────
create table if not exists public.caja_turnos (
  id                  uuid primary key default gen_random_uuid(),
  empresa_id          uuid not null references public.empresas(id) on delete cascade,
  estado              text not null default 'ABIERTO' check (estado in ('ABIERTO','CERRADO')),
  abierto_por         uuid references public.usuarios(id) on delete set null,
  abierto_por_nombre  text,
  abierto_at          timestamptz not null default now(),
  fondo_inicial       numeric(12,2) not null default 0 check (fondo_inicial >= 0),
  notas_apertura      text,
  cerrado_por         uuid references public.usuarios(id) on delete set null,
  cerrado_por_nombre  text,
  cerrado_at          timestamptz,
  esperado            numeric(12,2),
  arqueo              numeric(12,2),
  diferencia          numeric(12,2),
  notas_cierre        text,
  created_at          timestamptz not null default now()
);
create unique index if not exists uq_caja_turno_abierto on public.caja_turnos (empresa_id) where estado = 'ABIERTO';
create index if not exists idx_caja_turnos_empresa on public.caja_turnos (empresa_id, abierto_at desc);

-- ── Gastos / movimientos de caja (egresos e ingresos manuales) ──────────────
alter table public.gastos alter column categoria drop default;
alter table public.gastos alter column categoria type text using categoria::text;
alter table public.gastos alter column categoria set default 'OTROS';
alter table public.gastos
  add column if not exists tipo text not null default 'egreso',
  add column if not exists turno_id uuid,
  add column if not exists usuario_nombre text;
do $$ begin
  alter table public.gastos add constraint gastos_tipo_check check (tipo in ('egreso','ingreso'));
exception when duplicate_object then null; end $$;
alter table public.gastos alter column fecha set default current_date;
alter table public.gastos alter column usuario_id set default auth.uid();
create index if not exists idx_gastos_empresa_fecha on public.gastos (empresa_id, fecha desc);

-- ── Kardex de inventario ───────────────────────────────────────────────────
alter table public.movimientos_inventario alter column stock_antes drop not null;
alter table public.movimientos_inventario alter column stock_despues drop not null;
alter table public.movimientos_inventario
  add column if not exists producto_nombre text,
  add column if not exists usuario_nombre text,
  add column if not exists fecha timestamptz default now(),
  add column if not exists legacy_id uuid;
create index if not exists idx_mov_inv_empresa_fecha on public.movimientos_inventario (empresa_id, created_at desc);
create index if not exists idx_mov_inv_producto on public.movimientos_inventario (producto_id, created_at desc);

-- ── Proveedores y compras ──────────────────────────────────────────────────
alter table public.proveedores add column if not exists rubro text;
alter table public.compras
  add column if not exists fecha date default current_date,
  add column if not exists proveedor_nombre text,
  add column if not exists legacy_id text;
alter table public.compras alter column usuario_id set default auth.uid();

-- ── Producción ─────────────────────────────────────────────────────────────
create table if not exists public.formulas_produccion (
  id                 uuid primary key default gen_random_uuid(),
  empresa_id         uuid not null references public.empresas(id) on delete cascade,
  nombre             text not null check (char_length(nombre) between 1 and 150),
  insumo_id          uuid references public.productos(id) on delete set null,
  insumo_cantidad    numeric(12,3) not null check (insumo_cantidad > 0),
  insumo_unidad      text,
  producto_id        uuid references public.productos(id) on delete set null,
  producto_cantidad  numeric(12,3) not null check (producto_cantidad > 0),
  producto_unidad    text,
  costo_mano_obra    numeric(12,2) not null default 0,
  costo_energia      numeric(12,2) not null default 0,
  descripcion        text,
  activo             boolean not null default true,
  legacy_id          text,
  created_at         timestamptz not null default now()
);
create table if not exists public.ordenes_produccion (
  id                uuid primary key default gen_random_uuid(),
  empresa_id        uuid not null references public.empresas(id) on delete cascade,
  formula_id        uuid references public.formulas_produccion(id) on delete set null,
  formula_nombre    text,
  insumo_id         uuid references public.productos(id) on delete set null,
  producto_id       uuid references public.productos(id) on delete set null,
  lotes             numeric(12,3) not null check (lotes > 0),
  insumo_usado      numeric(12,3) not null,
  producido         numeric(12,3) not null,
  costo_total       numeric(12,2) not null default 0,
  costo_unitario    numeric(12,4) not null default 0,
  ingreso_estimado  numeric(12,2) not null default 0,
  margen            numeric(6,2)  not null default 0,
  fecha             date not null default current_date,
  notas             text,
  usuario_id        uuid references public.usuarios(id) on delete set null,
  anulada           boolean not null default false,
  legacy_id         text,
  created_at        timestamptz not null default now()
);
create index if not exists idx_ordenes_prod_empresa on public.ordenes_produccion (empresa_id, created_at desc);

-- ── Correlativos ───────────────────────────────────────────────────────────
alter table public.contadores_correlativo drop constraint if exists contadores_correlativo_tipo_check;
alter table public.contadores_correlativo add constraint contadores_correlativo_tipo_check
  check (tipo in ('VENTA','COMPRA','ORDEN','PRODUCCION','PEDIDO','COTIZACION'));

create or replace function public.siguiente_numero(p_empresa_id uuid, p_tipo text)
returns bigint language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  insert into public.contadores_correlativo (empresa_id, tipo, ultimo_numero)
  values (p_empresa_id, p_tipo, 1)
  on conflict (empresa_id, tipo) do update set ultimo_numero = contadores_correlativo.ultimo_numero + 1
  returning ultimo_numero into v;
  return v;
end $$;
revoke execute on function public.siguiente_numero(uuid, text) from anon, authenticated;

-- ── Seguridad por empresa en todas las tablas del ERP ───────────────────────
select pg_temp.politica_empresa(t) from unnest(array[
  'clientes','productos','ventas','venta_detalles','pagos_venta','gastos','inventario','movimientos',
  'movimientos_inventario','pedidos','categorias','proveedores','compras','compra_detalles',
  'caja_turnos','formulas_produccion','ordenes_produccion','activity_logs','configuracion_empresa',
  'contadores_correlativo','ordenes_trabajo'
]) t;

-- empresas: cada usuario ve la suya; solo admin la edita; superadmin ve todas
alter table public.empresas enable row level security;
do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname='public' and tablename='empresas' loop
    execute format('drop policy if exists %I on public.empresas', r.policyname);
  end loop;
end $$;
create policy empresas_select on public.empresas for select to authenticated
  using (id = (select public.get_empresa_id()) or (select public.is_superadmin()));
create policy empresas_update on public.empresas for update to authenticated
  using ((id = (select public.get_empresa_id()) and (select public.es_admin())) or (select public.is_superadmin()))
  with check ((id = (select public.get_empresa_id()) and (select public.es_admin())) or (select public.is_superadmin()));
revoke all on public.empresas from anon;
grant select, update on public.empresas to authenticated;
