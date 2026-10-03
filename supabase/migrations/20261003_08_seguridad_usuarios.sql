-- Moxi Business — Migración 08: cierra agujeros de escalada de privilegios.
--
-- Antes de esta migración cualquier usuario autenticado podía:
--   * insertarse en usuarios con cualquier empresa y rol (política u_ins)
--   * cambiar su propio rol a superadmin o su empresa (u_upd sin WITH CHECK)
--   * llamar create_worker_profile con cualquier empresa/rol (sin validación)
--   * registrarse con metadata {empresa_id, role} y entrar a otra empresa (triggers en auth.users)
--   * crearse una suscripción con la fecha de vencimiento que quisiera
--   * cambiar el plan/estado de su empresa
-- Ahora: el perfil propio solo permite editar nombre y avatar; todo lo demás pasa por
-- funciones del servidor que validan rol y empresa.

-- ── Triggers que creaban perfiles a partir de datos enviados por el usuario ──
drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists trg_on_auth_user_created on auth.users;

-- ── Políticas de usuarios ──────────────────────────────────────────────────
do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'usuarios' loop
    execute format('drop policy if exists %I on public.usuarios', r.policyname);
  end loop;
end $$;
alter table public.usuarios enable row level security;
create policy usuarios_select on public.usuarios for select to authenticated
  using (id = auth.uid() or empresa_id = (select public.get_empresa_id()) or (select public.is_superadmin()));
create policy usuarios_update_propio on public.usuarios for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke insert, update, delete on public.usuarios from authenticated, anon;
grant select on public.usuarios to authenticated;
grant update (nombre, avatar_url) on public.usuarios to authenticated;

-- ── Alta de trabajadores (solo admin, en su propia empresa, sin rol superadmin) ──
create or replace function public.create_worker_profile(p_worker_id uuid, p_email text, p_nombre text, p_role text, p_empresa_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_emp uuid := public.get_empresa_id(); v_actual uuid; v_role text := lower(coalesce(p_role, 'vendedor'));
begin
  if not public.es_admin() then raise exception 'Solo un administrador puede crear usuarios' using errcode = '42501'; end if;
  if v_role not in ('admin', 'vendedor', 'operador') then raise exception 'Rol no permitido'; end if;
  if p_worker_id = auth.uid() then raise exception 'No puedes modificar tu propio perfil desde aquí'; end if;
  select empresa_id into v_actual from public.usuarios where id = p_worker_id;
  if v_actual is not null and v_actual <> v_emp then raise exception 'Ese usuario ya pertenece a otra empresa'; end if;
  if not exists (select 1 from auth.users where id = p_worker_id) then raise exception 'La cuenta del trabajador no existe'; end if;
  insert into public.usuarios (id, email, nombre, role, empresa_id)
  values (p_worker_id, coalesce(nullif(trim(p_email), ''), (select email from auth.users where id = p_worker_id)), trim(p_nombre), v_role::erp.user_role, v_emp)
  on conflict (id) do update set nombre = excluded.nombre, role = excluded.role, email = excluded.email, activo = true;
end $$;

create or replace function public.usuario_cambiar_rol(p_usuario uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare v_emp uuid := public.get_empresa_id(); v_role text := lower(p_role);
begin
  if not public.es_admin() then raise exception 'Solo un administrador puede cambiar roles' using errcode = '42501'; end if;
  if v_role not in ('admin', 'vendedor', 'operador') then raise exception 'Rol no permitido'; end if;
  if p_usuario = auth.uid() then raise exception 'No puedes cambiar tu propio rol'; end if;
  update public.usuarios set role = v_role::erp.user_role where id = p_usuario and empresa_id = v_emp;
  if not found then raise exception 'Usuario no encontrado en tu empresa'; end if;
end $$;

create or replace function public.usuario_desactivar(p_usuario uuid, p_activo boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v_emp uuid := public.get_empresa_id();
begin
  if not public.es_admin() then raise exception 'Solo un administrador puede desactivar usuarios' using errcode = '42501'; end if;
  if p_usuario = auth.uid() then raise exception 'No puedes desactivar tu propia cuenta'; end if;
  update public.usuarios set activo = p_activo where id = p_usuario and empresa_id = v_emp;
  if not found then raise exception 'Usuario no encontrado en tu empresa'; end if;
end $$;

-- Registro de empresa: no permite que alguien que ya pertenece a una empresa la abandone
create or replace function public.registrar_empresa(p_empresa_nombre text, p_admin_nombre text, p_email text)
returns json language plpgsql security definer set search_path = public as $$
declare v_empresa_id uuid; v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'No autenticado'; end if;
  if exists (select 1 from public.usuarios where id = v_user_id and empresa_id is not null) then
    raise exception 'Tu cuenta ya pertenece a una empresa';
  end if;
  if coalesce(trim(p_empresa_nombre), '') = '' then raise exception 'El nombre de la empresa es obligatorio'; end if;
  insert into public.empresas (nombre, email) values (trim(p_empresa_nombre), nullif(trim(p_email), '')) returning id into v_empresa_id;
  insert into public.usuarios (id, email, nombre, role, empresa_id)
  values (v_user_id, coalesce(nullif(trim(p_email), ''), (select email from auth.users where id = v_user_id)), trim(p_admin_nombre), 'admin', v_empresa_id)
  on conflict (id) do update set email = excluded.email, nombre = excluded.nombre, role = 'admin', empresa_id = v_empresa_id;
  insert into public.configuracion_empresa (empresa_id) values (v_empresa_id) on conflict do nothing;
  return json_build_object('empresa_id', v_empresa_id, 'user_id', v_user_id);
end $$;
create or replace function public.registrar_empresa(p_empresa_nombre text, p_admin_nombre text)
returns json language sql security definer set search_path = public as $$
  select public.registrar_empresa(p_empresa_nombre, p_admin_nombre, (select email from auth.users where id = auth.uid()));
$$;

-- ── Empresa: el admin edita sus datos, pero no el plan ni el estado ─────────
revoke update on public.empresas from authenticated;
grant update (nombre, logo_url, qr_url, telefono, direccion, nit, email, rubro, moneda, timezone) on public.empresas to authenticated;

-- ── Suscripción de prueba: la crea el servidor con los días configurados ────
create or replace function public.suscripcion_actual()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_emp uuid := public.get_empresa_id(); s record; v_dias int;
begin
  if v_emp is null then return null; end if;
  select * into s from public.suscripciones where empresa_id = v_emp;
  if not found then
    select coalesce(trial_dias, 7) into v_dias from public.sistema_config where id = 1;
    v_dias := case when coalesce(v_dias, 7) < 0 then 36500 else coalesce(v_dias, 7) end; -- -1 = sin límite
    insert into public.suscripciones (empresa_id, nombre_empresa, plan, vence_el, activa)
    values (v_emp, (select nombre from public.empresas where id = v_emp), 'trial', current_date + v_dias, true)
    on conflict (empresa_id) do nothing;
    select * into s from public.suscripciones where empresa_id = v_emp;
  end if;
  return to_jsonb(s);
end $$;
drop policy if exists suscripciones_insert on public.suscripciones;
revoke insert, update, delete on public.suscripciones from authenticated;
grant select on public.suscripciones to authenticated;
-- el superadmin sigue gestionando suscripciones desde su panel
create policy suscripciones_superadmin_escritura on public.suscripciones for all to authenticated
  using ((select public.is_superadmin())) with check ((select public.is_superadmin()));
grant insert, update, delete on public.suscripciones to authenticated;

-- Superadmin: eliminar el perfil de un usuario (y su suscripción si era el único de la empresa)
create or replace function public.admin_eliminar_usuario(p_usuario uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_emp uuid;
begin
  if not public.is_superadmin() then raise exception 'Solo superadmin' using errcode = '42501'; end if;
  if p_usuario = auth.uid() then raise exception 'No puedes eliminar tu propia cuenta'; end if;
  select empresa_id into v_emp from public.usuarios where id = p_usuario;
  delete from public.usuarios where id = p_usuario;
  if v_emp is not null and not exists (select 1 from public.usuarios where empresa_id = v_emp) then
    delete from public.suscripciones where empresa_id = v_emp;
  end if;
end $$;

do $$ declare f text; begin
  foreach f in array array['admin_eliminar_usuario(uuid)', 'create_worker_profile(uuid, text, text, text, uuid)', 'usuario_cambiar_rol(uuid, text)',
    'usuario_desactivar(uuid, boolean)', 'registrar_empresa(text, text, text)', 'registrar_empresa(text, text)', 'suscripcion_actual()'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
