-- ════════════════════════════════════════════════════════════════════════════
-- 09 · Cobro de suscripciones: planes configurables, datos de cobro de la
--      plataforma y solicitudes de pago con comprobante (aprobación manual).
--
-- Seguridad:
--   * planes: lectura pública solo de los activos (la página /precios los muestra);
--     solo el superadmin crea/edita.
--   * solicitudes_pago: cada empresa ve solo las suyas; nadie escribe directo,
--     todo pasa por funciones que validan rol, plan, monto y comprobante.
--   * el monto lo calcula el servidor (no se puede pagar Bs 1 por un año).
--   * los datos bancarios no son visibles para visitantes anónimos.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Planes ──────────────────────────────────────────────────────────────────
create table if not exists public.planes (
  id              uuid primary key default gen_random_uuid(),
  codigo          text not null unique check (codigo ~ '^[a-z0-9_-]{2,30}$'),
  nombre          text not null check (length(trim(nombre)) between 2 and 60),
  descripcion     text,
  precio_mensual  numeric(10,2) not null check (precio_mensual >= 0),
  precio_anual    numeric(10,2) check (precio_anual is null or precio_anual >= 0),
  max_usuarios    int check (max_usuarios is null or max_usuarios > 0),
  caracteristicas text[] not null default '{}',
  destacado       boolean not null default false,
  activo          boolean not null default false,
  orden           int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table public.planes enable row level security;
drop policy if exists planes_lectura on public.planes;
drop policy if exists planes_superadmin on public.planes;
create policy planes_lectura on public.planes for select to anon, authenticated
  using (activo or (select public.is_superadmin()));
create policy planes_superadmin on public.planes for all to authenticated
  using ((select public.is_superadmin())) with check ((select public.is_superadmin()));
revoke all on public.planes from anon, authenticated;
grant select on public.planes to anon, authenticated;
grant insert, update, delete on public.planes to authenticated;

-- Planes sugeridos, DESACTIVADOS: el dueño define precios y los activa en Super Admin.
insert into public.planes (codigo, nombre, descripcion, precio_mensual, precio_anual, max_usuarios, caracteristicas, destacado, activo, orden) values
  ('basico', 'Básico', 'Para emprendedores que venden solos', 99, 990, 1,
    array['1 usuario','Punto de venta y nota de venta','Inventario y kardex','Clientes y deudas','Caja por turnos','Soporte por WhatsApp'], false, false, 1),
  ('negocio', 'Negocio', 'Para tiendas con equipo de trabajo', 199, 1990, 5,
    array['Hasta 5 usuarios con roles','Todo lo del plan Básico','Compras y proveedores','Pedidos y cotizaciones','Análisis de rentabilidad','Exportar a Excel'], true, false, 2),
  ('pro', 'Pro', 'Para negocios que producen y crecen', 349, 3490, null,
    array['Usuarios ilimitados','Todo lo del plan Negocio','Producción y fórmulas','Registro de actividad del equipo','Soporte prioritario'], false, false, 3)
on conflict (codigo) do nothing;

-- ── Datos de cobro de la plataforma ─────────────────────────────────────────
alter table public.sistema_config
  add column if not exists pago_qr_url        text,
  add column if not exists pago_banco         text,
  add column if not exists pago_titular       text,
  add column if not exists pago_cuenta        text,
  add column if not exists pago_instrucciones text;
-- Visitantes anónimos solo ven el WhatsApp y los días de prueba (para /precios)
revoke select on public.sistema_config from anon;
grant select (id, whatsapp_soporte, trial_dias) on public.sistema_config to anon;
-- Nadie escribe directo salvo el superadmin (política sistema_config_write ya existente)
revoke insert, delete on public.sistema_config from anon, authenticated;

-- ── Solicitudes de pago ─────────────────────────────────────────────────────
create table if not exists public.solicitudes_pago (
  id                    uuid primary key default gen_random_uuid(),
  empresa_id            uuid not null references public.empresas(id) on delete cascade,
  nombre_empresa        text,
  plan_id               uuid references public.planes(id) on delete set null,
  plan_codigo           text not null,
  plan_nombre           text not null,
  meses                 int  not null check (meses between 1 and 24),
  monto                 numeric(10,2) not null check (monto >= 0),
  comprobante_path      text not null,
  referencia            text,
  estado                text not null default 'PENDIENTE' check (estado in ('PENDIENTE','APROBADO','RECHAZADO')),
  solicitado_por        uuid references public.usuarios(id) on delete set null,
  solicitado_por_nombre text,
  created_at            timestamptz not null default now(),
  revisado_por          uuid references public.usuarios(id) on delete set null,
  revisado_at           timestamptz,
  motivo_rechazo        text,
  vence_anterior        date,
  vence_nuevo           date
);
create index if not exists idx_solicitudes_pago_empresa on public.solicitudes_pago (empresa_id, created_at desc);
create index if not exists idx_solicitudes_pago_estado on public.solicitudes_pago (estado, created_at);
-- Una sola solicitud pendiente por empresa (evita spam y pagos duplicados)
create unique index if not exists uq_solicitud_pendiente on public.solicitudes_pago (empresa_id) where estado = 'PENDIENTE';

alter table public.solicitudes_pago enable row level security;
drop policy if exists solicitudes_pago_select on public.solicitudes_pago;
create policy solicitudes_pago_select on public.solicitudes_pago for select to authenticated
  using (empresa_id = (select public.get_empresa_id()) or (select public.is_superadmin()));
revoke all on public.solicitudes_pago from anon, authenticated;
grant select on public.solicitudes_pago to authenticated;

-- ── Funciones ───────────────────────────────────────────────────────────────
-- Monto que corresponde a un plan y cantidad de meses (12 meses usa el precio anual si existe)
create or replace function public.plan_monto(p_plan public.planes, p_meses int)
returns numeric language sql immutable as $$
  select case when p_meses = 12 and p_plan.precio_anual is not null then p_plan.precio_anual
              else p_plan.precio_mensual * p_meses end;
$$;

-- El administrador de la empresa informa un pago con su comprobante
create or replace function public.suscripcion_solicitar_pago(p_plan uuid, p_meses int, p_comprobante text, p_referencia text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_emp uuid; v_uid uuid; v_nombre text; v_activo boolean;
  v_plan public.planes; v_row public.solicitudes_pago;
begin
  select u.empresa_id, u.id, u.nombre, coalesce(u.activo, true) into v_emp, v_uid, v_nombre, v_activo
    from public.usuarios u where u.id = auth.uid();
  if v_emp is null then raise exception 'Tu usuario no tiene una empresa asignada' using errcode = '42501'; end if;
  if not v_activo or not public.es_admin() then
    raise exception 'Solo el administrador de la empresa puede pagar la suscripción' using errcode = '42501';
  end if;
  if p_meses is null or p_meses not in (1, 3, 6, 12) then raise exception 'Elige 1, 3, 6 o 12 meses'; end if;

  select * into v_plan from public.planes where id = p_plan and activo;
  if not found then raise exception 'El plan elegido no está disponible'; end if;

  -- El comprobante debe estar en la carpeta de la propia empresa y existir de verdad
  if p_comprobante is null or p_comprobante not like v_emp::text || '/suscripcion/%' or p_comprobante like '%..%' then
    raise exception 'Comprobante no válido';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'comprobantes' and name = p_comprobante) then
    raise exception 'No se encontró el comprobante subido. Vuelve a adjuntarlo.';
  end if;
  if exists (select 1 from public.solicitudes_pago where empresa_id = v_emp and estado = 'PENDIENTE') then
    raise exception 'Ya tienes un pago en revisión. Te avisaremos cuando sea aprobado.';
  end if;

  insert into public.solicitudes_pago (empresa_id, nombre_empresa, plan_id, plan_codigo, plan_nombre, meses, monto,
    comprobante_path, referencia, solicitado_por, solicitado_por_nombre, vence_anterior)
  values (v_emp, (select nombre from public.empresas where id = v_emp), v_plan.id, v_plan.codigo, v_plan.nombre, p_meses,
    public.plan_monto(v_plan, p_meses), p_comprobante, nullif(left(trim(coalesce(p_referencia, '')), 120), ''), v_uid, v_nombre,
    (select vence_el from public.suscripciones where empresa_id = v_emp))
  returning * into v_row;

  perform public.log_actividad(v_emp, v_uid, v_nombre, 'Informó pago de suscripción', 'solicitudes_pago', v_row.id,
    jsonb_build_object('plan', v_plan.nombre, 'meses', p_meses, 'monto', v_row.monto));
  return to_jsonb(v_row);
end $$;

-- El superadmin aprueba o rechaza un pago informado
create or replace function public.suscripcion_revisar_pago(p_id uuid, p_aprobar boolean, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_sol public.solicitudes_pago; v_sus public.suscripciones; v_base date; v_nuevo date; v_rev text;
begin
  if not public.is_superadmin() then raise exception 'Solo el superadmin puede revisar pagos' using errcode = '42501'; end if;
  select * into v_sol from public.solicitudes_pago where id = p_id for update;
  if not found then raise exception 'Solicitud no encontrada'; end if;
  if v_sol.estado <> 'PENDIENTE' then raise exception 'Esta solicitud ya fue revisada (%)', lower(v_sol.estado); end if;
  select nombre into v_rev from public.usuarios where id = auth.uid();

  if not p_aprobar then
    if coalesce(trim(p_motivo), '') = '' then raise exception 'Indica el motivo del rechazo para el cliente'; end if;
    update public.solicitudes_pago set estado = 'RECHAZADO', motivo_rechazo = left(trim(p_motivo), 300),
      revisado_por = auth.uid(), revisado_at = now() where id = p_id returning * into v_sol;
    return to_jsonb(v_sol);
  end if;

  select * into v_sus from public.suscripciones where empresa_id = v_sol.empresa_id for update;
  -- Si aún le quedaban días, los meses se suman al final; si ya venció, cuentan desde hoy.
  v_base := greatest(coalesce(v_sus.vence_el, current_date), current_date);
  v_nuevo := (v_base + make_interval(months => v_sol.meses))::date;

  if v_sus.id is null then
    insert into public.suscripciones (empresa_id, nombre_empresa, plan, vence_el, activa)
    values (v_sol.empresa_id, coalesce(v_sol.nombre_empresa, ''), v_sol.plan_codigo, v_nuevo, true);
  else
    update public.suscripciones set plan = v_sol.plan_codigo, vence_el = v_nuevo, activa = true, updated_at = now()
     where id = v_sus.id;
  end if;

  update public.solicitudes_pago set estado = 'APROBADO', revisado_por = auth.uid(), revisado_at = now(),
    vence_anterior = v_sus.vence_el, vence_nuevo = v_nuevo where id = p_id returning * into v_sol;

  insert into public.pagos (empresa_id, nombre_empresa, monto, moneda, plan, dias, notas)
  values (v_sol.empresa_id, coalesce(v_sol.nombre_empresa, ''), v_sol.monto, 'BOB', v_sol.plan_codigo, v_nuevo - v_base,
    format('Pago por QR aprobado por %s · %s mes(es) de %s%s', coalesce(v_rev, 'superadmin'), v_sol.meses, v_sol.plan_nombre,
      coalesce(' · Ref: ' || v_sol.referencia, '')));
  return to_jsonb(v_sol);
end $$;

revoke execute on function public.plan_monto(public.planes, int) from public, anon;
revoke execute on function public.suscripcion_solicitar_pago(uuid, int, text, text) from public, anon;
revoke execute on function public.suscripcion_revisar_pago(uuid, boolean, text) from public, anon;
grant execute on function public.plan_monto(public.planes, int) to authenticated;
grant execute on function public.suscripcion_solicitar_pago(uuid, int, text, text) to authenticated;
grant execute on function public.suscripcion_revisar_pago(uuid, boolean, text) to authenticated;

-- Avisos en vivo al superadmin cuando llega un pago
do $$ begin
  begin alter publication supabase_realtime add table public.solicitudes_pago; exception when duplicate_object then null; end;
end $$;
