-- ════════════════════════════════════════════════════════════════════════════
-- 21 · Hato ganadero (bovinos y otras especies) para estancias y productores
--   Registro de animales (caravana/arete), genealogía, potreros, pesajes, sanidad,
--   reproducción (servicio, palpación, parto → cría), traslados, ventas y bajas.
--   * Cada animal guarda datos derivados (peso actual/anterior, preñez, parto estimado)
--     para que los reportes no recorran todo el historial.
--   * Eventos con "próxima fecha" (refuerzo de vacuna, desparasitación…) generan pendientes;
--     el siguiente evento del mismo tipo los marca como cumplidos.
--   * La venta de animales es una venta normal (caja, deudas, ticket).
--   * Escrituras solo por funciones; lectura por empresa.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.animales (
  id                uuid primary key default gen_random_uuid(),
  empresa_id        uuid not null references public.empresas(id) on delete cascade,
  codigo            text not null check (length(trim(codigo)) between 1 and 40),   -- caravana / arete / número
  nombre            text,
  especie           text not null default 'BOVINO' check (especie in ('BOVINO','OVINO','CAPRINO','PORCINO','EQUINO','BUFALINO','OTRO')),
  sexo              text not null check (sexo in ('M','H')),
  castrado          boolean not null default false,
  raza              text,
  color             text,
  marca             text,                                  -- hierro / señal
  categoria         text,                                  -- manual (si es null se calcula por edad y sexo)
  fecha_nacimiento  date,
  origen            text not null default 'NACIDO' check (origen in ('NACIDO','COMPRADO')),
  fecha_ingreso     date not null default current_date,
  precio_compra     numeric(12,2),
  madre_id          uuid references public.animales(id) on delete set null,
  padre_id          uuid references public.animales(id) on delete set null,
  padre_texto       text,                                  -- toro de otro dueño / pajuela
  potrero           text,
  peso_actual       numeric(8,2),
  fecha_peso        date,
  peso_anterior     numeric(8,2),
  fecha_peso_anterior date,
  prenada           boolean not null default false,
  fecha_parto_est   date,
  ultimo_parto      date,
  partos            int not null default 0,
  estado            text not null default 'ACTIVO' check (estado in ('ACTIVO','VENDIDO','MUERTO','CONSUMO','PERDIDO')),
  fecha_baja        date,
  motivo_baja       text,
  precio_venta      numeric(12,2),
  venta_id          uuid references public.ventas(id) on delete set null,
  notas             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index if not exists ux_animales_codigo on public.animales (empresa_id, lower(codigo)) where estado = 'ACTIVO';
create index if not exists idx_animales_empresa on public.animales (empresa_id, estado);
create index if not exists idx_animales_madre on public.animales (madre_id);

create table if not exists public.animal_eventos (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas(id) on delete cascade,
  animal_id      uuid not null references public.animales(id) on delete cascade,
  tipo           text not null check (tipo in ('PESAJE','VACUNA','DESPARASITACION','TRATAMIENTO','SERVICIO','PALPACION','PARTO','DESTETE','TRASLADO','NOTA')),
  fecha          date not null,
  valor          numeric(10,2),         -- kg en pesaje, meses de preñez en palpación
  detalle        text,                  -- producto, dosis, diagnóstico, toro, potrero destino…
  resultado      text,                  -- palpación: PRENADA / VACIA; parto: VIVO / MUERTO
  proxima_fecha  date,                  -- refuerzo / próxima dosis
  proxima_cumplida boolean not null default false,
  cria_id        uuid references public.animales(id) on delete set null,
  lote_evento    uuid,                  -- agrupa los eventos registrados en una misma jornada masiva
  usuario_nombre text,
  created_at     timestamptz not null default now()
);
create index if not exists idx_animal_eventos_animal on public.animal_eventos (animal_id, fecha desc);
create index if not exists idx_animal_eventos_pendientes on public.animal_eventos (empresa_id, proxima_fecha) where proxima_fecha is not null and not proxima_cumplida;

alter table public.animales enable row level security;
alter table public.animal_eventos enable row level security;
drop policy if exists animales_select on public.animales;
drop policy if exists animal_eventos_select on public.animal_eventos;
create policy animales_select on public.animales for select to authenticated using (empresa_id = (select public.get_empresa_id()));
create policy animal_eventos_select on public.animal_eventos for select to authenticated using (empresa_id = (select public.get_empresa_id()));
revoke all on public.animales, public.animal_eventos from anon, authenticated;
grant select on public.animales, public.animal_eventos to authenticated;

-- Límites del plan: el módulo "hato"
drop trigger if exists control_plan on public.animales;
create trigger control_plan before insert on public.animales for each row execute function public.trg_control_plan('hato');
update public.planes set modulos = modulos || array['hato'] where codigo in ('basico', 'negocio') and modulos is not null and not ('hato' = any(modulos));

do $$ begin
  begin alter publication supabase_realtime add table public.animales; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.animal_eventos; exception when duplicate_object then null; end;
end $$;

-- Días de gestación por especie (para el parto estimado)
create or replace function public.gestacion_dias(p_especie text)
returns int language sql immutable as $$
  select case p_especie when 'BOVINO' then 283 when 'BUFALINO' then 310 when 'OVINO' then 150 when 'CAPRINO' then 150
                        when 'PORCINO' then 114 when 'EQUINO' then 340 else 283 end;
$$;

-- ── Registrar / editar un animal ───────────────────────────────────────────
create or replace function public.animal_guardar(p jsonb)
returns jsonb language plpgsql security definer set search_path = public set timezone = 'America/La_Paz' as $$
declare ctx record; a public.animales; v_id uuid := nullif(p->>'id', '')::uuid; v_cod text := trim(coalesce(p->>'codigo', ''));
  v_madre uuid := nullif(p->>'madre_id', '')::uuid; v_padre uuid := nullif(p->>'padre_id', '')::uuid;
begin
  select * into ctx from public.mi_contexto();
  if v_cod = '' then raise exception 'Indica la caravana o número del animal'; end if;
  if coalesce(p->>'sexo', '') not in ('M', 'H') then raise exception 'Indica si es macho o hembra'; end if;
  if exists (select 1 from public.animales where empresa_id = ctx.empresa and estado = 'ACTIVO' and lower(codigo) = lower(v_cod) and id is distinct from v_id) then
    raise exception 'Ya hay un animal activo con la caravana "%"', v_cod;
  end if;
  if v_madre is not null and not exists (select 1 from public.animales where id = v_madre and empresa_id = ctx.empresa and sexo = 'H') then raise exception 'La madre no es válida'; end if;
  if v_padre is not null and not exists (select 1 from public.animales where id = v_padre and empresa_id = ctx.empresa and sexo = 'M') then raise exception 'El padre no es válido'; end if;
  if v_id is not null and (v_madre = v_id or v_padre = v_id) then raise exception 'Un animal no puede ser su propia madre o padre'; end if;
  if nullif(p->>'fecha_nacimiento', '')::date > current_date then raise exception 'La fecha de nacimiento no puede ser futura'; end if;

  if v_id is null then
    insert into public.animales (empresa_id, codigo, nombre, especie, sexo, castrado, raza, color, marca, categoria, fecha_nacimiento, origen,
      fecha_ingreso, precio_compra, madre_id, padre_id, padre_texto, potrero, peso_actual, fecha_peso, notas)
    values (ctx.empresa, left(v_cod, 40), nullif(trim(p->>'nombre'), ''), coalesce(nullif(p->>'especie', ''), 'BOVINO'), p->>'sexo',
      coalesce((p->>'castrado')::boolean, false), nullif(trim(p->>'raza'), ''), nullif(trim(p->>'color'), ''), nullif(trim(p->>'marca'), ''),
      nullif(trim(p->>'categoria'), ''), nullif(p->>'fecha_nacimiento', '')::date, coalesce(nullif(p->>'origen', ''), 'NACIDO'),
      coalesce(nullif(p->>'fecha_ingreso', '')::date, current_date), nullif(p->>'precio_compra', '')::numeric, v_madre, v_padre,
      nullif(trim(p->>'padre_texto'), ''), nullif(trim(p->>'potrero'), ''), nullif(p->>'peso', '')::numeric,
      case when nullif(p->>'peso', '') is not null then coalesce(nullif(p->>'fecha_ingreso', '')::date, current_date) end, nullif(trim(p->>'notas'), ''))
    returning * into a;
    if a.peso_actual is not null then
      insert into public.animal_eventos (empresa_id, animal_id, tipo, fecha, valor, detalle, usuario_nombre)
      values (ctx.empresa, a.id, 'PESAJE', a.fecha_peso, a.peso_actual, 'Peso de ingreso', ctx.nombre);
    end if;
    -- Compra pagada: sale como egreso de caja
    if a.origen = 'COMPRADO' and coalesce(a.precio_compra, 0) > 0 and coalesce((p->>'registrar_gasto')::boolean, false) then
      insert into public.gastos (empresa_id, tipo, categoria, descripcion, monto, metodo_pago, fecha)
      values (ctx.empresa, 'egreso', 'Compra de ganado', 'Compra animal ' || a.codigo || coalesce(' · ' || a.raza, ''), a.precio_compra,
        public.metodo_pago_normalizar(p->>'metodo_pago'), a.fecha_ingreso);
    end if;
  else
    update public.animales set codigo = left(v_cod, 40), nombre = nullif(trim(p->>'nombre'), ''), especie = coalesce(nullif(p->>'especie', ''), especie),
      sexo = p->>'sexo', castrado = coalesce((p->>'castrado')::boolean, castrado), raza = nullif(trim(p->>'raza'), ''), color = nullif(trim(p->>'color'), ''),
      marca = nullif(trim(p->>'marca'), ''), categoria = nullif(trim(p->>'categoria'), ''), fecha_nacimiento = nullif(p->>'fecha_nacimiento', '')::date,
      madre_id = v_madre, padre_id = v_padre, padre_texto = nullif(trim(p->>'padre_texto'), ''), potrero = nullif(trim(p->>'potrero'), ''),
      notas = nullif(trim(p->>'notas'), ''), updated_at = now()
    where id = v_id and empresa_id = ctx.empresa returning * into a;
    if not found then raise exception 'Animal no encontrado'; end if;
  end if;
  return to_jsonb(a);
end $$;

-- ── Eventos ────────────────────────────────────────────────────────────────
-- Núcleo: registra un evento en un animal y actualiza sus datos derivados. Uso interno.
create or replace function public.animal_evento_aplicar(ctx_empresa uuid, ctx_nombre text, p_animal uuid, p jsonb, p_lote uuid default null)
returns uuid language plpgsql security definer set search_path = public set timezone = 'America/La_Paz' as $$
declare a public.animales; v_tipo text := upper(coalesce(p->>'tipo', '')); v_fecha date := coalesce(nullif(p->>'fecha', '')::date, current_date);
  v_valor numeric := nullif(p->>'valor', '')::numeric; v_res text := upper(nullif(trim(p->>'resultado'), '')); v_ev uuid; v_cria uuid;
begin
  select * into a from public.animales where id = p_animal and empresa_id = ctx_empresa for update;
  if not found then raise exception 'Animal no encontrado'; end if;
  if a.estado <> 'ACTIVO' then raise exception 'El animal % ya no está en el hato', a.codigo; end if;
  if v_fecha > current_date then raise exception 'La fecha del evento no puede ser futura'; end if;
  if v_tipo = 'PESAJE' and (v_valor is null or v_valor <= 0 or v_valor > 3000) then raise exception 'Peso inválido para %', a.codigo; end if;
  if v_tipo in ('SERVICIO', 'PALPACION', 'PARTO') and a.sexo <> 'H' then raise exception '% es macho: no aplica %', a.codigo, lower(v_tipo); end if;
  if v_tipo = 'TRASLADO' and coalesce(trim(p->>'detalle'), '') = '' then raise exception 'Indica el potrero de destino'; end if;
  if v_tipo = 'PALPACION' and coalesce(v_res, '') not in ('PRENADA', 'VACIA') then raise exception 'Indica si está preñada o vacía'; end if;

  -- Parto: crea la cría (si se indicó caravana) y la vincula
  if v_tipo = 'PARTO' and coalesce(v_res, 'VIVO') = 'VIVO' and p->'cria' is not null and coalesce(trim(p->'cria'->>'codigo'), '') <> '' then
    v_cria := (public.animal_guardar(jsonb_build_object('codigo', p->'cria'->>'codigo', 'nombre', p->'cria'->>'nombre', 'sexo', p->'cria'->>'sexo',
      'especie', a.especie, 'raza', coalesce(nullif(p->'cria'->>'raza', ''), a.raza), 'color', p->'cria'->>'color', 'fecha_nacimiento', v_fecha,
      'fecha_ingreso', v_fecha, 'origen', 'NACIDO', 'madre_id', a.id, 'padre_id', p->'cria'->>'padre_id', 'padre_texto', p->'cria'->>'padre_texto',
      'potrero', a.potrero, 'peso', p->'cria'->>'peso'))->>'id')::uuid;
  end if;

  insert into public.animal_eventos (empresa_id, animal_id, tipo, fecha, valor, detalle, resultado, proxima_fecha, cria_id, lote_evento, usuario_nombre)
  values (ctx_empresa, a.id, v_tipo, v_fecha, v_valor, nullif(left(trim(p->>'detalle'), 300), ''), v_res, nullif(p->>'proxima_fecha', '')::date,
    v_cria, p_lote, ctx_nombre)
  returning id into v_ev;

  -- El nuevo evento cumple los pendientes anteriores del mismo tipo
  update public.animal_eventos set proxima_cumplida = true
   where animal_id = a.id and tipo = v_tipo and id <> v_ev and proxima_fecha is not null and not proxima_cumplida;

  -- Datos derivados del animal
  if v_tipo = 'PESAJE' and (a.fecha_peso is null or v_fecha >= a.fecha_peso) then
    update public.animales set peso_anterior = peso_actual, fecha_peso_anterior = fecha_peso, peso_actual = v_valor, fecha_peso = v_fecha, updated_at = now() where id = a.id;
  elsif v_tipo = 'TRASLADO' then
    update public.animales set potrero = left(trim(p->>'detalle'), 80), updated_at = now() where id = a.id;
  elsif v_tipo = 'SERVICIO' then
    update public.animales set prenada = false, fecha_parto_est = v_fecha + public.gestacion_dias(a.especie), updated_at = now() where id = a.id;
  elsif v_tipo = 'PALPACION' then
    update public.animales set prenada = (v_res = 'PRENADA'),
      fecha_parto_est = case when v_res = 'PRENADA' then coalesce(
        case when v_valor > 0 then v_fecha + (public.gestacion_dias(a.especie) - round(v_valor * 30.4))::int end, fecha_parto_est) end,
      updated_at = now() where id = a.id;
  elsif v_tipo = 'PARTO' then
    update public.animales set prenada = false, fecha_parto_est = null, ultimo_parto = v_fecha, partos = partos + 1, updated_at = now() where id = a.id;
  elsif v_tipo = 'DESTETE' and v_valor > 0 then
    update public.animales set peso_anterior = peso_actual, fecha_peso_anterior = fecha_peso, peso_actual = v_valor, fecha_peso = v_fecha, updated_at = now() where id = a.id;
  end if;
  return v_ev;
end $$;

create or replace function public.animal_evento(p_animal uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ctx record; v_ev uuid;
begin
  select * into ctx from public.mi_contexto();
  v_ev := public.animal_evento_aplicar(ctx.empresa, ctx.nombre, p_animal, p);
  return (select to_jsonb(e) from public.animal_eventos e where e.id = v_ev);
end $$;

-- Jornada masiva: el mismo evento (vacuna, desparasitación, traslado, pesaje con peso por animal…) a varios animales
-- p_items: [{animal_id, valor?}] (valor por animal, p. ej. el peso de cada uno)
create or replace function public.animal_evento_masivo(p_items jsonb, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ctx record; x jsonb; v_lote uuid := gen_random_uuid(); n int := 0;
begin
  select * into ctx from public.mi_contexto();
  if upper(coalesce(p->>'tipo', '')) = 'PARTO' then raise exception 'Los partos se registran de a uno'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Elige al menos un animal'; end if;
  if jsonb_array_length(p_items) > 2000 then raise exception 'Máximo 2000 animales por jornada'; end if;
  for x in select * from jsonb_array_elements(p_items) loop
    perform public.animal_evento_aplicar(ctx.empresa, ctx.nombre, (x->>'animal_id')::uuid,
      case when x ? 'valor' and nullif(x->>'valor', '') is not null then p || jsonb_build_object('valor', x->'valor') else p end, v_lote);
    n := n + 1;
  end loop;
  perform public.log_actividad(ctx.empresa, ctx.usuario, ctx.nombre,
    initcap(lower(p->>'tipo')) || ' a ' || n || ' animal(es)' || coalesce(': ' || nullif(trim(p->>'detalle'), ''), ''), 'animales', null);
  return jsonb_build_object('registrados', n, 'lote', v_lote);
end $$;

-- Borrar un evento cargado por error (solo administrador); el peso se recalcula con el último pesaje que quede
create or replace function public.animal_evento_eliminar(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare ctx record; e public.animal_eventos; ult record; ant record;
begin
  select * into ctx from public.mi_contexto();
  if not public.es_admin() then raise exception 'Solo el administrador puede borrar eventos' using errcode = '42501'; end if;
  select * into e from public.animal_eventos where id = p_id and empresa_id = ctx.empresa;
  if not found then raise exception 'Evento no encontrado'; end if;
  if e.tipo = 'PARTO' and e.cria_id is not null then raise exception 'Este parto creó una cría: dala de baja o corrígela antes'; end if;
  delete from public.animal_eventos where id = p_id;
  if e.tipo in ('PESAJE', 'DESTETE') then
    select valor, fecha into ult from public.animal_eventos where animal_id = e.animal_id and tipo in ('PESAJE', 'DESTETE') and valor > 0 order by fecha desc, created_at desc limit 1;
    select valor, fecha into ant from public.animal_eventos where animal_id = e.animal_id and tipo in ('PESAJE', 'DESTETE') and valor > 0 order by fecha desc, created_at desc offset 1 limit 1;
    update public.animales set peso_actual = ult.valor, fecha_peso = ult.fecha, peso_anterior = ant.valor, fecha_peso_anterior = ant.fecha, updated_at = now() where id = e.animal_id;
  elsif e.tipo = 'PARTO' then
    update public.animales set partos = greatest(partos - 1, 0), updated_at = now() where id = e.animal_id;
  end if;
  perform public.log_actividad(ctx.empresa, ctx.usuario, ctx.nombre, 'Borró un evento ' || lower(e.tipo) || ' del ' || to_char(e.fecha, 'DD/MM/YYYY'), 'animales', e.animal_id);
end $$;

-- ── Venta y bajas ──────────────────────────────────────────────────────────
-- p: {items: [{animal_id, precio}], cliente_id?, cliente_nombre?, pagos: [{monto, metodo}], notas?}
create or replace function public.animal_vender(p jsonb)
returns jsonb language plpgsql security definer set search_path = public set timezone = 'America/La_Paz' as $$
declare ctx record; x jsonb; a public.animales; v_items jsonb := '[]'; v jsonb; v_ids uuid[] := '{}'; n int := 0;
begin
  select * into ctx from public.mi_contexto();
  if jsonb_typeof(p->'items') <> 'array' or jsonb_array_length(p->'items') = 0 then raise exception 'Elige los animales a vender'; end if;
  for x in select * from jsonb_array_elements(p->'items') loop
    select * into a from public.animales where id = (x->>'animal_id')::uuid and empresa_id = ctx.empresa for update;
    if not found then raise exception 'Animal no encontrado'; end if;
    if a.estado <> 'ACTIVO' then raise exception 'El animal % ya no está en el hato', a.codigo; end if;
    if a.id = any(v_ids) then raise exception 'El animal % está repetido', a.codigo; end if;
    if coalesce(nullif(x->>'precio', '')::numeric, -1) < 0 then raise exception 'Precio inválido para %', a.codigo; end if;
    v_ids := v_ids || a.id;
    v_items := v_items || jsonb_build_array(jsonb_build_object('producto_id', null, 'unidad', 'cabeza', 'cantidad', 1, 'precio_unitario', (x->>'precio')::numeric,
      'nombre', initcap(lower(a.especie)) || ' ' || a.codigo || coalesce(' · ' || a.raza, '') || case when a.peso_actual is not null then ' (' || round(a.peso_actual) || ' kg)' else '' end));
    n := n + 1;
  end loop;
  v := public.venta_registrar(jsonb_build_object('cliente_id', nullif(p->>'cliente_id', ''), 'cliente_nombre', nullif(trim(p->>'cliente_nombre'), ''),
    'notas', coalesce(nullif(trim(p->>'notas'), ''), 'Venta de ' || n || ' animal(es)'), 'items', v_items,
    'pagos', case when jsonb_typeof(p->'pagos') = 'array' then p->'pagos' else '[]' end));
  update public.animales an set estado = 'VENDIDO', fecha_baja = current_date, venta_id = (v->>'id')::uuid, updated_at = now(),
    precio_venta = (select (it->>'precio')::numeric from jsonb_array_elements(p->'items') it where (it->>'animal_id')::uuid = an.id)
   where an.id = any(v_ids);
  return jsonb_build_object('vendidos', n, 'venta', v);
end $$;

-- Baja por muerte, consumo propio (faena) o pérdida/robo
create or replace function public.animal_baja(p_ids uuid[], p_tipo text, p_fecha date, p_motivo text)
returns int language plpgsql security definer set search_path = public set timezone = 'America/La_Paz' as $$
declare ctx record; v text := upper(trim(p_tipo)); n int;
begin
  select * into ctx from public.mi_contexto();
  if v not in ('MUERTO', 'CONSUMO', 'PERDIDO') then raise exception 'Tipo de baja no válido'; end if;
  if coalesce(p_fecha, current_date) > current_date then raise exception 'La fecha no puede ser futura'; end if;
  update public.animales set estado = v, fecha_baja = coalesce(p_fecha, current_date), motivo_baja = nullif(trim(p_motivo), ''), updated_at = now()
   where id = any(p_ids) and empresa_id = ctx.empresa and estado = 'ACTIVO';
  get diagnostics n = row_count;
  if n = 0 then raise exception 'No hay animales activos para dar de baja'; end if;
  perform public.log_actividad(ctx.empresa, ctx.usuario, ctx.nombre,
    'Baja (' || lower(v) || ') de ' || n || ' animal(es)' || coalesce(': ' || nullif(trim(p_motivo), ''), ''), 'animales', null);
  return n;
end $$;

-- Deshacer una baja cargada por error (solo administrador; las ventas se anulan en Ventas)
create or replace function public.animal_reactivar(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ctx record; a public.animales;
begin
  select * into ctx from public.mi_contexto();
  if not public.es_admin() then raise exception 'Solo el administrador puede reactivar animales' using errcode = '42501'; end if;
  select * into a from public.animales where id = p_id and empresa_id = ctx.empresa;
  if not found then raise exception 'Animal no encontrado'; end if;
  if a.estado = 'ACTIVO' then raise exception 'El animal ya está activo'; end if;
  if a.estado = 'VENDIDO' and a.venta_id is not null and exists (select 1 from public.ventas where id = a.venta_id and anulada_at is null) then
    raise exception 'Primero anula la venta en el módulo Ventas';
  end if;
  if exists (select 1 from public.animales where empresa_id = ctx.empresa and estado = 'ACTIVO' and lower(codigo) = lower(a.codigo)) then
    raise exception 'Ya hay otro animal activo con la caravana "%"', a.codigo;
  end if;
  update public.animales set estado = 'ACTIVO', fecha_baja = null, motivo_baja = null, venta_id = null, precio_venta = null, updated_at = now()
   where id = p_id returning * into a;
  perform public.log_actividad(ctx.empresa, ctx.usuario, ctx.nombre, 'Reactivó el animal ' || a.codigo, 'animales', a.id);
  return to_jsonb(a);
end $$;

revoke execute on function public.animal_evento_aplicar(uuid, text, uuid, jsonb, uuid) from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array['animal_guardar(jsonb)', 'animal_evento(uuid, jsonb)', 'animal_evento_masivo(jsonb, jsonb)', 'animal_evento_eliminar(uuid)',
    'animal_vender(jsonb)', 'animal_baja(uuid[], text, date, text)', 'animal_reactivar(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- "Empezar de cero": también puede borrar el hato (animales y su historial)
do $$
declare d text := pg_get_functiondef('public.empresa_reiniciar(text[], text)'::regprocedure);
  a1 text := $a$'mesas','membresias'];$a$;
  b1 text := $b$'mesas','membresias','hato'];$b$;
  a2 text := $a$  if 'actividad' = any(p_modulos) then$a$;
  b2 text := $b$  if 'hato' = any(p_modulos) then
    update public.animales set madre_id = null, padre_id = null where empresa_id = ctx.empresa;
    delete from public.animales where empresa_id = ctx.empresa;   -- eventos en cascada
    get diagnostics n = row_count; r := r || jsonb_build_object('hato', n);
  end if;
  if 'actividad' = any(p_modulos) then$b$;
begin
  if position(b1 in d) > 0 then return; end if;
  if (length(d) - length(replace(d, a1, ''))) / length(a1) <> 1 then raise exception 'parche reiniciar: a1'; end if;
  if (length(d) - length(replace(d, a2, ''))) / length(a2) <> 1 then raise exception 'parche reiniciar: a2'; end if;
  execute replace(replace(d, a1, b1), a2, b2);
end $$;
