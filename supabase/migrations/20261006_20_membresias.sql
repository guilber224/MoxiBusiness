-- ════════════════════════════════════════════════════════════════════════════
-- 20 · Membresías (gimnasios, academias, escuelas de fútbol, clubes, coworking…)
--   Planes (mensual, trimestral, 12 clases…) → venta de la membresía (venta normal) →
--   control de ingreso (asistencias) → vencimiento, congelamiento y renovación.
--   * La renovación empieza el día siguiente al vencimiento de la membresía vigente.
--   * Congelar pausa la membresía; al reactivar se corre la fecha de fin los días pausados.
--   * Planes por sesiones: cada ingreso descuenta una; por tiempo: ilimitado dentro del período.
--   * Escrituras solo por funciones; lectura por empresa.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.membresia_planes (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references public.empresas(id) on delete cascade,
  nombre          text not null check (length(trim(nombre)) between 1 and 80),
  precio          numeric(12,2) not null check (precio >= 0),
  duracion_valor  int not null check (duracion_valor between 1 and 3650),
  duracion_unidad text not null check (duracion_unidad in ('DIA','SEMANA','MES','ANIO')),
  sesiones        int check (sesiones is null or sesiones between 1 and 10000),   -- null = ilimitado
  ingresos_por_dia int not null default 1 check (ingresos_por_dia between 1 and 20),
  descripcion     text,
  activo          boolean not null default true,
  orden           int not null default 0,
  created_at      timestamptz not null default now()
);

create table if not exists public.membresias (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references public.empresas(id) on delete cascade,
  cliente_id       uuid not null references public.clientes(id) on delete cascade,
  cliente_nombre   text not null,
  plan_id          uuid references public.membresia_planes(id) on delete set null,
  plan_nombre      text not null,
  inicio           date not null,
  fin              date not null check (fin >= inicio),
  sesiones_total   int,
  sesiones_usadas  int not null default 0 check (sesiones_usadas >= 0),
  ingresos_por_dia int not null default 1,
  precio           numeric(12,2) not null default 0,
  estado           text not null default 'ACTIVA' check (estado in ('ACTIVA','CONGELADA','CANCELADA')),
  congelada_desde  date,
  dias_congelados  int not null default 0,
  motivo_cancelacion text,
  notas            text,
  venta_id         uuid references public.ventas(id) on delete set null,
  usuario_nombre   text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_membresias_empresa on public.membresias (empresa_id, fin desc);
create index if not exists idx_membresias_cliente on public.membresias (cliente_id, fin desc);

create table if not exists public.membresia_asistencias (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas(id) on delete cascade,
  membresia_id   uuid not null references public.membresias(id) on delete cascade,
  cliente_id     uuid not null references public.clientes(id) on delete cascade,
  cliente_nombre text,
  plan_nombre    text,
  fecha          timestamptz not null default now(),
  usuario_nombre text
);
create index if not exists idx_asistencias_empresa on public.membresia_asistencias (empresa_id, fecha desc);
create index if not exists idx_asistencias_membresia on public.membresia_asistencias (membresia_id, fecha desc);

alter table public.membresia_planes enable row level security;
alter table public.membresias enable row level security;
alter table public.membresia_asistencias enable row level security;
drop policy if exists mplanes_select on public.membresia_planes;
drop policy if exists membresias_select on public.membresias;
drop policy if exists masist_select on public.membresia_asistencias;
create policy mplanes_select on public.membresia_planes for select to authenticated using (empresa_id = (select public.get_empresa_id()));
create policy membresias_select on public.membresias for select to authenticated using (empresa_id = (select public.get_empresa_id()));
create policy masist_select on public.membresia_asistencias for select to authenticated using (empresa_id = (select public.get_empresa_id()));
revoke all on public.membresia_planes, public.membresias, public.membresia_asistencias from anon, authenticated;
grant select on public.membresia_planes, public.membresias, public.membresia_asistencias to authenticated;

-- Límites del plan: el módulo "membresias"
drop trigger if exists control_plan on public.membresias;
create trigger control_plan before insert on public.membresias for each row execute function public.trg_control_plan('membresias');
update public.planes set modulos = modulos || array['membresias'] where codigo in ('basico', 'negocio') and modulos is not null and not ('membresias' = any(modulos));

do $$ begin
  begin alter publication supabase_realtime add table public.membresia_planes; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.membresias; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.membresia_asistencias; exception when duplicate_object then null; end;
end $$;

-- Fecha de fin de un período: inicio + duración − 1 día (un mes desde el 5 vence el 4 del mes siguiente)
create or replace function public.membresia_fin(p_inicio date, p_valor int, p_unidad text)
returns date language plpgsql immutable as $$
declare d date;
begin
  if p_unidad in ('DIA', 'SEMANA') then
    return p_inicio + p_valor * case when p_unidad = 'SEMANA' then 7 else 1 end - 1;
  end if;
  d := (p_inicio + case when p_unidad = 'MES' then make_interval(months => p_valor) else make_interval(years => p_valor) end)::date;
  -- Si el mes destino es más corto (31 ene → 28 feb), vence ese último día; si no, el día anterior (5 oct → 4 nov)
  return case when extract(day from d) < extract(day from p_inicio) then d else d - 1 end;
end $$;

-- ── Planes (configuración, solo administrador) ─────────────────────────────
create or replace function public.membresia_plan_guardar(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ctx record; r public.membresia_planes; v_id uuid := nullif(p->>'id', '')::uuid; v_unidad text := upper(coalesce(p->>'duracion_unidad', 'MES'));
begin
  select * into ctx from public.mi_contexto();
  if not public.es_admin() then raise exception 'Solo el administrador configura los planes' using errcode = '42501'; end if;
  if coalesce(trim(p->>'nombre'), '') = '' then raise exception 'Indica el nombre del plan'; end if;
  if coalesce(nullif(p->>'precio', '')::numeric, -1) < 0 then raise exception 'Indica el precio'; end if;
  if coalesce(nullif(p->>'duracion_valor', '')::int, 0) < 1 then raise exception 'Indica la duración'; end if;
  if v_unidad not in ('DIA', 'SEMANA', 'MES', 'ANIO') then raise exception 'Unidad de duración no válida'; end if;
  if v_id is null then
    insert into public.membresia_planes (empresa_id, nombre, precio, duracion_valor, duracion_unidad, sesiones, ingresos_por_dia, descripcion, orden)
    values (ctx.empresa, left(trim(p->>'nombre'), 80), (p->>'precio')::numeric, (p->>'duracion_valor')::int, v_unidad,
      nullif(p->>'sesiones', '')::int, coalesce(nullif(p->>'ingresos_por_dia', '')::int, 1), nullif(trim(p->>'descripcion'), ''),
      (select coalesce(max(orden), 0) + 1 from public.membresia_planes where empresa_id = ctx.empresa))
    returning * into r;
  else
    update public.membresia_planes set nombre = left(trim(p->>'nombre'), 80), precio = (p->>'precio')::numeric,
      duracion_valor = (p->>'duracion_valor')::int, duracion_unidad = v_unidad, sesiones = nullif(p->>'sesiones', '')::int,
      ingresos_por_dia = coalesce(nullif(p->>'ingresos_por_dia', '')::int, 1), descripcion = nullif(trim(p->>'descripcion'), '')
    where id = v_id and empresa_id = ctx.empresa and activo returning * into r;
    if not found then raise exception 'Plan no encontrado'; end if;
  end if;
  return to_jsonb(r);
end $$;

create or replace function public.membresia_plan_eliminar(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare ctx record;
begin
  select * into ctx from public.mi_contexto();
  if not public.es_admin() then raise exception 'Solo el administrador configura los planes' using errcode = '42501'; end if;
  update public.membresia_planes set activo = false where id = p_id and empresa_id = ctx.empresa;   -- las membresías vendidas se conservan
end $$;

-- ── Vender / renovar ───────────────────────────────────────────────────────
-- p: {cliente_id, plan_id, inicio?, precio?, descuento?, pagos:[{monto, metodo}], notas?}
create or replace function public.membresia_vender(p jsonb)
returns jsonb language plpgsql security definer set search_path = public set timezone = 'America/La_Paz' as $$
declare ctx record; pl public.membresia_planes; cli record; m public.membresias; v jsonb;
  v_inicio date := nullif(p->>'inicio', '')::date; v_fin date; v_precio numeric; v_ultimo date;
begin
  select * into ctx from public.mi_contexto();
  select id, nombre into cli from public.clientes where id = nullif(p->>'cliente_id', '')::uuid and empresa_id = ctx.empresa;
  if not found then raise exception 'Elige un cliente registrado'; end if;
  select * into pl from public.membresia_planes where id = nullif(p->>'plan_id', '')::uuid and empresa_id = ctx.empresa and activo;
  if not found then raise exception 'Plan no encontrado'; end if;
  v_precio := coalesce(nullif(p->>'precio', '')::numeric, pl.precio);
  if v_precio < 0 then raise exception 'Precio inválido'; end if;
  -- Renovación: si tiene una membresía vigente, la nueva empieza al día siguiente de su fin
  if v_inicio is null then
    select max(fin) into v_ultimo from public.membresias
     where cliente_id = cli.id and empresa_id = ctx.empresa and estado in ('ACTIVA', 'CONGELADA') and fin >= current_date;
    v_inicio := coalesce(v_ultimo + 1, current_date);
  end if;
  if v_inicio < current_date - 31 then raise exception 'La fecha de inicio es demasiado antigua'; end if;
  v_fin := public.membresia_fin(v_inicio, pl.duracion_valor, pl.duracion_unidad);
  insert into public.membresias (empresa_id, cliente_id, cliente_nombre, plan_id, plan_nombre, inicio, fin, sesiones_total, ingresos_por_dia,
    precio, notas, usuario_nombre)
  values (ctx.empresa, cli.id, cli.nombre, pl.id, pl.nombre, v_inicio, v_fin, pl.sesiones, pl.ingresos_por_dia, v_precio,
    nullif(trim(p->>'notas'), ''), ctx.nombre)
  returning * into m;
  if v_precio > 0 then
    v := public.venta_registrar(jsonb_build_object(
      'cliente_id', cli.id, 'cliente_nombre', cli.nombre,
      'notas', 'Membresía ' || pl.nombre || ' · ' || to_char(v_inicio, 'DD/MM/YYYY') || ' al ' || to_char(v_fin, 'DD/MM/YYYY'),
      'descuento', coalesce(nullif(p->>'descuento', '')::numeric, 0), 'descuento_tipo', 'monto',
      'items', jsonb_build_array(jsonb_build_object('producto_id', null, 'unidad', 'servicio', 'cantidad', 1, 'precio_unitario', v_precio,
                 'nombre', 'Membresía ' || pl.nombre || ' (' || to_char(v_inicio, 'DD/MM') || '–' || to_char(v_fin, 'DD/MM/YY') || ')')),
      'pagos', case when jsonb_typeof(p->'pagos') = 'array' then p->'pagos' else '[]' end));
    update public.membresias set venta_id = (v->>'id')::uuid where id = m.id returning * into m;
  end if;
  perform public.log_actividad(ctx.empresa, ctx.usuario, ctx.nombre,
    'Membresía ' || pl.nombre || ' para ' || cli.nombre || ' (' || to_char(v_inicio, 'DD/MM/YYYY') || ' al ' || to_char(v_fin, 'DD/MM/YYYY') || ')', 'membresias', m.id);
  return to_jsonb(m) || jsonb_build_object('venta', v);
end $$;

-- ── Control de ingreso ─────────────────────────────────────────────────────
create or replace function public.membresia_asistencia(p_id uuid, p_forzar boolean default false)
returns jsonb language plpgsql security definer set search_path = public set timezone = 'America/La_Paz' as $$
declare ctx record; m public.membresias; v_hoy int;
begin
  select * into ctx from public.mi_contexto();
  select * into m from public.membresias where id = p_id and empresa_id = ctx.empresa for update;
  if not found then raise exception 'Membresía no encontrada'; end if;
  if m.estado = 'CANCELADA' then raise exception 'La membresía está cancelada'; end if;
  if m.estado = 'CONGELADA' then raise exception 'La membresía está congelada desde el %', to_char(m.congelada_desde, 'DD/MM/YYYY'); end if;
  if m.inicio > current_date then raise exception 'La membresía empieza el %', to_char(m.inicio, 'DD/MM/YYYY'); end if;
  if m.fin < current_date then raise exception 'La membresía venció el %', to_char(m.fin, 'DD/MM/YYYY'); end if;
  if m.sesiones_total is not null and m.sesiones_usadas >= m.sesiones_total then raise exception 'Ya usó las % sesiones del plan', m.sesiones_total; end if;
  select count(*) into v_hoy from public.membresia_asistencias where membresia_id = p_id and fecha >= current_date::timestamptz;
  if v_hoy >= m.ingresos_por_dia and not coalesce(p_forzar, false) then
    raise exception 'REPETIDO: ya registró % ingreso(s) hoy', v_hoy;
  end if;
  insert into public.membresia_asistencias (empresa_id, membresia_id, cliente_id, cliente_nombre, plan_nombre, usuario_nombre)
  values (ctx.empresa, m.id, m.cliente_id, m.cliente_nombre, m.plan_nombre, ctx.nombre);
  update public.membresias set sesiones_usadas = sesiones_usadas + case when sesiones_total is not null then 1 else 0 end, updated_at = now()
   where id = p_id returning * into m;
  return to_jsonb(m) || jsonb_build_object('dias_restantes', m.fin - current_date);
end $$;

-- ── Congelar / reactivar / cancelar / ajustar ──────────────────────────────
create or replace function public.membresia_congelar(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public set timezone = 'America/La_Paz' as $$
declare ctx record; m public.membresias;
begin
  select * into ctx from public.mi_contexto();
  update public.membresias set estado = 'CONGELADA', congelada_desde = greatest(current_date, inicio), updated_at = now()
   where id = p_id and empresa_id = ctx.empresa and estado = 'ACTIVA' and fin >= current_date returning * into m;
  if not found then raise exception 'Solo se puede congelar una membresía activa y vigente'; end if;
  perform public.log_actividad(ctx.empresa, ctx.usuario, ctx.nombre, 'Congeló la membresía de ' || m.cliente_nombre, 'membresias', m.id);
  return to_jsonb(m);
end $$;

create or replace function public.membresia_reactivar(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public set timezone = 'America/La_Paz' as $$
declare ctx record; m public.membresias; v_dias int; v_fin_original date;
begin
  select * into ctx from public.mi_contexto();
  select * into m from public.membresias where id = p_id and empresa_id = ctx.empresa and estado = 'CONGELADA' for update;
  if not found then raise exception 'La membresía no está congelada'; end if;
  v_dias := greatest(0, current_date - m.congelada_desde);
  v_fin_original := m.fin;
  update public.membresias set estado = 'ACTIVA', fin = fin + v_dias, dias_congelados = dias_congelados + v_dias, congelada_desde = null, updated_at = now()
   where id = p_id returning * into m;
  -- Las renovaciones ya pagadas que venían después se corren los mismos días (no se solapan)
  if v_dias > 0 then
    update public.membresias set inicio = inicio + v_dias, fin = fin + v_dias, updated_at = now()
     where cliente_id = m.cliente_id and empresa_id = ctx.empresa and id <> p_id and estado <> 'CANCELADA' and inicio > v_fin_original;
  end if;
  return to_jsonb(m) || jsonb_build_object('dias_extendidos', v_dias);
end $$;

create or replace function public.membresia_cancelar(p_id uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ctx record; m public.membresias;
begin
  select * into ctx from public.mi_contexto();
  update public.membresias set estado = 'CANCELADA', motivo_cancelacion = nullif(trim(p_motivo), ''), updated_at = now()
   where id = p_id and empresa_id = ctx.empresa and estado <> 'CANCELADA' returning * into m;
  if not found then raise exception 'Membresía no encontrada o ya cancelada'; end if;
  perform public.log_actividad(ctx.empresa, ctx.usuario, ctx.nombre,
    'Canceló la membresía de ' || m.cliente_nombre || coalesce(': ' || nullif(trim(p_motivo), ''), ''), 'membresias', m.id);
  return to_jsonb(m);
end $$;

-- Ajuste manual (solo administrador): fechas, sesiones y notas
create or replace function public.membresia_ajustar(p_id uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ctx record; m public.membresias; a public.membresias;
begin
  select * into ctx from public.mi_contexto();
  if not public.es_admin() then raise exception 'Solo el administrador puede ajustar membresías' using errcode = '42501'; end if;
  select * into a from public.membresias where id = p_id and empresa_id = ctx.empresa for update;
  if not found then raise exception 'Membresía no encontrada'; end if;
  update public.membresias set
    inicio = coalesce(nullif(p->>'inicio', '')::date, inicio),
    fin = coalesce(nullif(p->>'fin', '')::date, fin),
    sesiones_total = case when p ? 'sesiones_total' then nullif(p->>'sesiones_total', '')::int else sesiones_total end,
    sesiones_usadas = coalesce(nullif(p->>'sesiones_usadas', '')::int, sesiones_usadas),
    notas = case when p ? 'notas' then nullif(trim(p->>'notas'), '') else notas end,
    updated_at = now()
  where id = p_id returning * into m;
  if m.fin < m.inicio then raise exception 'La fecha de fin no puede ser anterior al inicio'; end if;
  if a.fin <> m.fin or a.inicio <> m.inicio then
    perform public.log_actividad(ctx.empresa, ctx.usuario, ctx.nombre,
      'Ajustó la membresía de ' || m.cliente_nombre || ': ' || to_char(a.inicio, 'DD/MM') || '–' || to_char(a.fin, 'DD/MM/YY') || ' → ' ||
      to_char(m.inicio, 'DD/MM') || '–' || to_char(m.fin, 'DD/MM/YY'), 'membresias', m.id);
  end if;
  return to_jsonb(m);
end $$;

revoke execute on function public.membresia_fin(date, int, text) from public, anon;
do $$
declare f text;
begin
  foreach f in array array['membresia_plan_guardar(jsonb)', 'membresia_plan_eliminar(uuid)', 'membresia_vender(jsonb)', 'membresia_asistencia(uuid, boolean)',
    'membresia_congelar(uuid)', 'membresia_reactivar(uuid)', 'membresia_cancelar(uuid, text)', 'membresia_ajustar(uuid, jsonb)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- "Empezar de cero": también puede borrar las membresías y asistencias (los planes se conservan)
do $$
declare d text := pg_get_functiondef('public.empresa_reiniciar(text[], text)'::regprocedure);
  a1 text := $a$'agenda','mesas'];$a$;
  b1 text := $b$'agenda','mesas','membresias'];$b$;
  a2 text := $a$  if 'actividad' = any(p_modulos) then$a$;
  b2 text := $b$  if 'membresias' = any(p_modulos) then
    delete from public.membresias where empresa_id = ctx.empresa;   -- asistencias en cascada
    get diagnostics n = row_count; r := r || jsonb_build_object('membresias', n);
  end if;
  if 'actividad' = any(p_modulos) then$b$;
begin
  if position(b1 in d) > 0 then return; end if;
  if (length(d) - length(replace(d, a1, ''))) / length(a1) <> 1 then raise exception 'parche reiniciar: a1'; end if;
  if (length(d) - length(replace(d, a2, ''))) / length(a2) <> 1 then raise exception 'parche reiniciar: a2'; end if;
  execute replace(replace(d, a1, b1), a2, b2);
end $$;
