-- Moxi Business — Migración 07: equipo visible para el admin y tiempo real en tablas nuevas.

-- Usuarios: cada uno ve a los de su empresa (antes solo a sí mismo). get_empresa_id() es
-- SECURITY DEFINER, así que no hay recursión de políticas.
drop policy if exists usuarios_select_own on public.usuarios;
drop policy if exists usuarios_select_misma_empresa on public.usuarios;
create policy usuarios_select_misma_empresa on public.usuarios for select to authenticated
  using (id = auth.uid() or empresa_id = (select public.get_empresa_id()) or (select public.is_superadmin()));

-- Tiempo real para pedidos y caja (los demás ya estaban publicados)
do $$ begin
  begin alter publication supabase_realtime add table public.pedidos; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.caja_turnos; exception when duplicate_object then null; end;
end $$;
