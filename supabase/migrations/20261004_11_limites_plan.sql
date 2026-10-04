-- ════════════════════════════════════════════════════════════════════════════
-- 11 · Límites por plan, aplicados en el servidor
--   * planes.modulos: secciones incluidas (null = todas). Panel y Ajustes siempre.
--   * planes.max_usuarios: usuarios activos permitidos (null = ilimitado).
--   * Suscripción vencida o desactivada: no se pueden registrar datos nuevos.
--   * Prueba gratuita ('trial') y planes que no están en la tabla (p. ej. 'activo'
--     de clientes antiguos) no tienen límites.
--   * El superadmin y los procesos internos (sin usuario) no se limitan.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.planes add column if not exists modulos text[];
update public.planes set modulos = array['clientes','ventas','deudas','productos','inventario','caja','gastos']
 where codigo = 'basico' and modulos is null;
update public.planes set modulos = array['clientes','ventas','deudas','productos','inventario','caja','gastos',
                                         'pedidos','proveedores','analisis','exportar','actividad']
 where codigo = 'negocio' and modulos is null;
-- 'pro' queda en null = todos los módulos

-- Estado del plan de una empresa (uso interno y para la app)
create or replace function public.plan_estado(p_emp uuid)
returns jsonb language plpgsql stable security definer set search_path = public set timezone = 'America/La_Paz' as $$
declare s public.suscripciones; p public.planes;
begin
  select * into s from public.suscripciones where empresa_id = p_emp;
  if s.id is not null then select * into p from public.planes where codigo = s.plan; end if;
  return jsonb_build_object(
    'plan', s.plan,
    'plan_nombre', coalesce(p.nombre, case when s.plan = 'trial' then 'Prueba gratuita' else s.plan end),
    'vigente', s.id is null or (s.activa and s.vence_el >= current_date),
    'vence_el', s.vence_el,
    'modulos', to_jsonb(p.modulos),                 -- null = sin restricción
    'max_usuarios', p.max_usuarios,                 -- null = ilimitado
    'usuarios_activos', (select count(*) from public.usuarios u where u.empresa_id = p_emp and coalesce(u.activo, true))
  );
end $$;

-- Lo que la app necesita saber de mi propio plan
create or replace function public.mi_plan()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.get_empresa_id() is null then null else public.plan_estado(public.get_empresa_id()) end;
$$;

-- Disparador genérico: exige suscripción vigente y (opcional) que el plan incluya el módulo
create or replace function public.trg_control_plan()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_est jsonb; v_mod text := nullif(tg_argv[0], '');
begin
  if auth.uid() is null or public.is_superadmin() then return new; end if;
  v_est := public.plan_estado(new.empresa_id);
  if not (v_est->>'vigente')::boolean then
    raise exception 'Tu suscripción venció. Renuévala en Ajustes → Suscripción para seguir registrando datos.' using errcode = 'P0001';
  end if;
  if v_mod is not null and v_est->'modulos' is not null and jsonb_typeof(v_est->'modulos') = 'array'
     and not (v_est->'modulos') ? v_mod then
    raise exception 'Tu plan % no incluye esta función. Mejora tu plan en Ajustes → Suscripción.', v_est->>'plan_nombre' using errcode = 'P0001';
  end if;
  return new;
end $$;

do $$
declare t record;
begin
  for t in select * from (values
      ('ventas',''), ('productos',''), ('clientes',''), ('gastos',''), ('categorias',''),
      ('movimientos_inventario',''), ('caja_turnos',''),
      ('pedidos','pedidos'), ('proveedores','proveedores'), ('compras','proveedores'),
      ('formulas_produccion','produccion'), ('ordenes_produccion','produccion')) as x(tabla, modulo) loop
    execute format('drop trigger if exists control_plan on public.%I', t.tabla);
    execute format('create trigger control_plan before insert on public.%I for each row execute function public.trg_control_plan(%L)', t.tabla, t.modulo);
  end loop;
end $$;

-- Límite de usuarios: al crear, mover o reactivar un usuario en una empresa
create or replace function public.trg_limite_usuarios()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_est jsonb; v_max int; v_act int;
begin
  if auth.uid() is null or public.is_superadmin() or new.empresa_id is null or not coalesce(new.activo, true) then return new; end if;
  if tg_op = 'UPDATE' and old.empresa_id is not distinct from new.empresa_id and coalesce(old.activo, true) then return new; end if;
  v_est := public.plan_estado(new.empresa_id);
  v_max := (v_est->>'max_usuarios')::int;
  if v_max is null then return new; end if;
  select count(*) into v_act from public.usuarios u
   where u.empresa_id = new.empresa_id and coalesce(u.activo, true) and u.id <> new.id;
  if v_act + 1 > v_max then
    raise exception 'Tu plan % permite % usuario(s) activo(s). Mejora tu plan o desactiva a otro usuario.', v_est->>'plan_nombre', v_max using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists limite_usuarios on public.usuarios;
create trigger limite_usuarios before insert or update of activo, empresa_id on public.usuarios
  for each row execute function public.trg_limite_usuarios();

revoke execute on function public.plan_estado(uuid) from public, anon, authenticated;
revoke execute on function public.mi_plan() from public, anon;
grant execute on function public.mi_plan() to authenticated;
