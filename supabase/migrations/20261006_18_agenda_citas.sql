-- ════════════════════════════════════════════════════════════════════════════
-- 18 · Agenda y citas (peluquerías, barberías, consultorios, veterinarias, spas…)
--   Cita → confirmada → atendida y cobrada (o no asistió / cancelada).
--   * Cruce de horarios: un mismo profesional no puede tener dos citas a la vez,
--     salvo que se pida explícitamente ("forzar", para sobrecupos).
--   * Anticipo: igual que en órdenes de servicio, entra a la caja al agendar y al cobrar
--     se descuenta como pago "ANTICIPO" de la venta.
--   * Servicios y productos del catálogo en items (los productos descuentan stock al cobrar).
--   * Escrituras solo por funciones; lectura por empresa.
--   * empresas.agenda: horario de atención, intervalo y profesionales (lo edita el administrador).
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.citas (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references public.empresas(id) on delete cascade,
  cliente_id       uuid references public.clientes(id) on delete set null,
  cliente_nombre   text not null,
  cliente_telefono text,
  inicio           timestamptz not null,
  fin              timestamptz not null,
  profesional      text,
  servicio         text,                          -- resumen visible en la agenda ("Corte + barba")
  items            jsonb not null default '[]',   -- [{producto_id?, nombre, cantidad, precio}]
  estado           text not null default 'PENDIENTE'
                   check (estado in ('PENDIENTE','CONFIRMADA','ATENDIDA','NO_ASISTIO','CANCELADA')),
  anticipo         numeric(12,2) not null default 0 check (anticipo >= 0),
  anticipo_metodo  text,
  notas            text,
  motivo_cancelacion text,
  recordada_at     timestamptz,                   -- cuándo se envió el recordatorio por WhatsApp
  venta_id         uuid references public.ventas(id) on delete set null,
  usuario_id       uuid, usuario_nombre text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (fin > inicio and fin - inicio <= interval '24 hours')
);
create index if not exists idx_citas_empresa_inicio on public.citas (empresa_id, inicio);

alter table public.citas enable row level security;
drop policy if exists citas_select on public.citas;
create policy citas_select on public.citas for select to authenticated using (empresa_id = (select public.get_empresa_id()));
revoke all on public.citas from anon, authenticated;
grant select on public.citas to authenticated;

-- Límites del plan: el módulo "agenda"
drop trigger if exists control_plan on public.citas;
create trigger control_plan before insert on public.citas for each row execute function public.trg_control_plan('agenda');
update public.planes set modulos = modulos || array['agenda'] where codigo in ('basico', 'negocio') and modulos is not null and not ('agenda' = any(modulos));

do $$ begin
  begin alter publication supabase_realtime add table public.citas; exception when duplicate_object then null; end;
end $$;

-- Configuración de la agenda por empresa: {inicio:"08:00", fin:"20:00", intervalo:30, profesionales:["Ana","Luis"]}
alter table public.empresas add column if not exists agenda jsonb;
grant update (agenda) on public.empresas to authenticated;

-- Crear o editar una cita. p.id vacío = nueva. p.forzar = true permite el cruce de horario.
create or replace function public.cita_guardar(p jsonb)
returns jsonb language plpgsql security definer set search_path = public set timezone = 'America/La_Paz' as $$
declare ctx record; c public.citas; v_id uuid := nullif(p->>'id', '')::uuid; v_cli uuid := nullif(p->>'cliente_id', '')::uuid;
  v_nom text; v_tel text; v_ini timestamptz; v_fin timestamptz; v_prof text := nullif(trim(p->>'profesional'), '');
  v_items jsonb := public.os_items_validos(p->'items'); v_serv text; v_ant numeric := coalesce(nullif(p->>'anticipo', '')::numeric, 0);
  v_cruce public.citas;
begin
  select * into ctx from public.mi_contexto();
  v_ini := nullif(p->>'inicio', '')::timestamptz;
  v_fin := nullif(p->>'fin', '')::timestamptz;
  if v_ini is null or v_fin is null then raise exception 'Indica la fecha y la hora de la cita'; end if;
  if v_fin <= v_ini then raise exception 'La hora de fin debe ser posterior a la de inicio'; end if;
  if v_fin - v_ini > interval '24 hours' then raise exception 'Una cita no puede durar más de 24 horas'; end if;
  if v_ant < 0 then raise exception 'El anticipo no puede ser negativo'; end if;
  if v_prof is not null then v_prof := left(v_prof, 80); end if;

  if v_cli is not null then
    select nombre, telefono into v_nom, v_tel from public.clientes where id = v_cli and empresa_id = ctx.empresa;
    if not found then raise exception 'Cliente no encontrado'; end if;
  end if;
  v_nom := coalesce(nullif(trim(p->>'cliente_nombre'), ''), v_nom);
  if coalesce(v_nom, '') = '' then raise exception 'Indica el nombre del cliente'; end if;
  v_serv := coalesce(nullif(trim(p->>'servicio'), ''), (select string_agg(x->>'nombre', ' + ') from jsonb_array_elements(v_items) x));

  if v_id is not null then
    select * into c from public.citas where id = v_id and empresa_id = ctx.empresa for update;
    if not found then raise exception 'Cita no encontrada'; end if;
    if c.estado not in ('PENDIENTE', 'CONFIRMADA') then raise exception 'La cita ya está cerrada'; end if;
  end if;

  -- Cruce de horario del mismo profesional
  if v_prof is not null and not coalesce((p->>'forzar')::boolean, false) then
    select * into v_cruce from public.citas
     where empresa_id = ctx.empresa and lower(profesional) = lower(v_prof) and estado in ('PENDIENTE', 'CONFIRMADA', 'ATENDIDA')
       and id is distinct from v_id and inicio < v_fin and fin > v_ini
     order by inicio limit 1;
    if found then
      raise exception 'CRUCE: % ya tiene una cita de % a % con %', v_prof,
        to_char(v_cruce.inicio, 'HH24:MI'), to_char(v_cruce.fin, 'HH24:MI'), v_cruce.cliente_nombre;
    end if;
  end if;

  if v_id is null then
    insert into public.citas (empresa_id, cliente_id, cliente_nombre, cliente_telefono, inicio, fin, profesional, servicio, items,
      estado, anticipo, anticipo_metodo, notas, usuario_id, usuario_nombre)
    values (ctx.empresa, v_cli, left(v_nom, 150), coalesce(nullif(trim(p->>'cliente_telefono'), ''), v_tel), v_ini, v_fin, v_prof,
      left(v_serv, 200), v_items, case when upper(p->>'estado') = 'CONFIRMADA' then 'CONFIRMADA' else 'PENDIENTE' end,
      v_ant, case when v_ant > 0 then lower(coalesce(nullif(p->>'anticipo_metodo', ''), 'efectivo')) end,
      nullif(trim(p->>'notas'), ''), ctx.usuario, ctx.nombre)
    returning * into c;
    if v_ant > 0 then
      insert into public.gastos (empresa_id, tipo, categoria, descripcion, monto, metodo_pago, fecha)
      values (ctx.empresa, 'ingreso', 'Anticipo de cita', 'Anticipo cita ' || to_char(v_ini, 'DD/MM HH24:MI') || ' · ' || c.cliente_nombre, v_ant,
        public.metodo_pago_normalizar(c.anticipo_metodo), current_date);
    end if;
    perform public.log_actividad(ctx.empresa, ctx.usuario, ctx.nombre,
      'Agendó cita ' || to_char(v_ini, 'DD/MM/YYYY HH24:MI') || ' · ' || c.cliente_nombre, 'citas', c.id);
  else
    -- El anticipo no se edita (ya entró a caja); el cliente sí se puede corregir
    update public.citas set cliente_id = v_cli, cliente_nombre = left(v_nom, 150),
      cliente_telefono = coalesce(nullif(trim(p->>'cliente_telefono'), ''), v_tel),
      inicio = v_ini, fin = v_fin, profesional = v_prof, servicio = left(v_serv, 200), items = v_items,
      notas = nullif(trim(p->>'notas'), ''),
      recordada_at = case when inicio <> v_ini then null else recordada_at end,   -- reprogramada: hay que recordar de nuevo
      updated_at = now()
    where id = v_id returning * into c;
  end if;
  return to_jsonb(c);
end $$;

-- Confirmar / volver a pendiente / marcar que no asistió
create or replace function public.cita_estado(p_id uuid, p_estado text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ctx record; c public.citas; v text := upper(trim(p_estado));
begin
  select * into ctx from public.mi_contexto();
  if v not in ('PENDIENTE', 'CONFIRMADA', 'NO_ASISTIO') then raise exception 'Estado no válido'; end if;
  select * into c from public.citas where id = p_id and empresa_id = ctx.empresa for update;
  if not found then raise exception 'Cita no encontrada'; end if;
  if c.estado not in ('PENDIENTE', 'CONFIRMADA') then raise exception 'La cita ya está cerrada'; end if;
  update public.citas set estado = v, updated_at = now() where id = p_id returning * into c;
  return to_jsonb(c);
end $$;

-- Registrar que se envió el recordatorio
create or replace function public.cita_recordada(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ctx record; c public.citas;
begin
  select * into ctx from public.mi_contexto();
  update public.citas set recordada_at = now(), updated_at = now()
   where id = p_id and empresa_id = ctx.empresa and estado in ('PENDIENTE', 'CONFIRMADA') returning * into c;
  if not found then raise exception 'Cita no encontrada o cerrada'; end if;
  return to_jsonb(c);
end $$;

-- Atender y cobrar: crea la venta con los servicios/productos y aplica el anticipo como pago
-- p_pagos: [{monto, metodo}] lo que se cobra ahora (sin el anticipo)
create or replace function public.cita_atender(p_id uuid, p_pagos jsonb default '[]')
returns jsonb language plpgsql security definer set search_path = public as $$
declare ctx record; c public.citas; v jsonb; v_total numeric; v_pagos jsonb;
begin
  select * into ctx from public.mi_contexto();
  select * into c from public.citas where id = p_id and empresa_id = ctx.empresa for update;
  if not found then raise exception 'Cita no encontrada'; end if;
  if c.estado not in ('PENDIENTE', 'CONFIRMADA') then raise exception 'La cita ya está cerrada'; end if;
  v_total := coalesce((select sum((x->>'cantidad')::numeric * (x->>'precio')::numeric) from jsonb_array_elements(c.items) x), 0);
  if c.anticipo > v_total + 0.005 then
    raise exception 'El anticipo (%) es mayor que el total de la cita (%). Agrega los servicios antes de cobrar.', c.anticipo, v_total;
  end if;
  if v_total > 0 then
    v_pagos := coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(p_pagos, '[]')) x where coalesce((x->>'monto')::numeric, 0) > 0), '[]');
    if c.anticipo > 0 then v_pagos := v_pagos || jsonb_build_array(jsonb_build_object('monto', c.anticipo, 'metodo', 'anticipo')); end if;
    v := public.venta_registrar(jsonb_build_object(
      'cliente_id', c.cliente_id, 'cliente_nombre', c.cliente_nombre,
      'notas', 'Cita ' || to_char(c.inicio at time zone 'America/La_Paz', 'DD/MM HH24:MI') || coalesce(' · ' || c.profesional, ''),
      'items', (select jsonb_agg(jsonb_build_object('producto_id', x->>'producto_id', 'nombre', x->>'nombre',
                 'unidad', case when nullif(x->>'producto_id', '') is null then 'servicio' end,
                 'cantidad', (x->>'cantidad')::numeric, 'precio_unitario', (x->>'precio')::numeric)) from jsonb_array_elements(c.items) x),
      'pagos', v_pagos));
  end if;
  update public.citas set estado = 'ATENDIDA', venta_id = (v->>'id')::uuid, updated_at = now() where id = p_id returning * into c;
  return to_jsonb(c) || jsonb_build_object('venta', v);
end $$;

-- Cancelar (opcional: devolver el anticipo, sale como egreso de caja)
create or replace function public.cita_cancelar(p_id uuid, p_motivo text, p_devolver_anticipo boolean default false)
returns jsonb language plpgsql security definer set search_path = public set timezone = 'America/La_Paz' as $$
declare ctx record; c public.citas;
begin
  select * into ctx from public.mi_contexto();
  select * into c from public.citas where id = p_id and empresa_id = ctx.empresa for update;
  if not found then raise exception 'Cita no encontrada'; end if;
  if c.estado not in ('PENDIENTE', 'CONFIRMADA', 'NO_ASISTIO') then raise exception 'La cita ya está cerrada'; end if;
  update public.citas set estado = 'CANCELADA', motivo_cancelacion = nullif(trim(p_motivo), ''), updated_at = now()
   where id = p_id returning * into c;
  if p_devolver_anticipo and c.anticipo > 0 then
    insert into public.gastos (empresa_id, tipo, categoria, descripcion, monto, metodo_pago, fecha)
    values (ctx.empresa, 'egreso', 'Devolución de anticipo', 'Devolución anticipo cita ' || to_char(c.inicio, 'DD/MM HH24:MI') || ' · ' || c.cliente_nombre,
      c.anticipo, public.metodo_pago_normalizar(c.anticipo_metodo), current_date);
  end if;
  perform public.log_actividad(ctx.empresa, ctx.usuario, ctx.nombre,
    'Canceló cita ' || to_char(c.inicio, 'DD/MM/YYYY HH24:MI') || ' · ' || c.cliente_nombre, 'citas', c.id);
  return to_jsonb(c);
end $$;

revoke execute on function public.cita_guardar(jsonb) from public, anon;
revoke execute on function public.cita_estado(uuid, text) from public, anon;
revoke execute on function public.cita_recordada(uuid) from public, anon;
revoke execute on function public.cita_atender(uuid, jsonb) from public, anon;
revoke execute on function public.cita_cancelar(uuid, text, boolean) from public, anon;
grant execute on function public.cita_guardar(jsonb) to authenticated;
grant execute on function public.cita_estado(uuid, text) to authenticated;
grant execute on function public.cita_recordada(uuid) to authenticated;
grant execute on function public.cita_atender(uuid, jsonb) to authenticated;
grant execute on function public.cita_cancelar(uuid, text, boolean) to authenticated;

-- "Empezar de cero": ahora también puede borrar órdenes de servicio y la agenda
do $$
declare d text := pg_get_functiondef('public.empresa_reiniciar(text[], text)'::regprocedure);
  a1 text := $a$'produccion','actividad'];$a$;
  b1 text := $b$'produccion','actividad','servicios','agenda'];$b$;
  a2 text := $a$  if 'actividad' = any(p_modulos) then$a$;
  b2 text := $b$  if 'servicios' = any(p_modulos) then
    delete from public.ordenes_servicio where empresa_id = ctx.empresa;   -- eventos en cascada
    get diagnostics n = row_count; r := r || jsonb_build_object('servicios', n);
  end if;
  if 'agenda' = any(p_modulos) then
    delete from public.citas where empresa_id = ctx.empresa;
    get diagnostics n = row_count; r := r || jsonb_build_object('agenda', n);
  end if;
  if 'actividad' = any(p_modulos) then$b$;
begin
  if position(b1 in d) > 0 then return; end if;   -- ya aplicado
  if (length(d) - length(replace(d, a1, ''))) / length(a1) <> 1 then raise exception 'parche reiniciar: a1'; end if;
  if (length(d) - length(replace(d, a2, ''))) / length(a2) <> 1 then raise exception 'parche reiniciar: a2'; end if;
  execute replace(replace(d, a1, b1), a2, b2);
end $$;
