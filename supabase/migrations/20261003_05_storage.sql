-- Moxi Business — Migración 05: Supabase Storage para imágenes.
-- Las fotos dejan de guardarse como base64 dentro de las filas (eran 40 MB en 13 productos).
-- Estructura de rutas: <bucket>/<empresa_id>/<archivo>. Cada empresa solo escribe en su carpeta.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('productos',    'productos',    true,  1048576, array['image/jpeg','image/png','image/webp']),
  ('empresa',      'empresa',      true,  1048576, array['image/jpeg','image/png','image/webp','image/svg+xml']),
  ('comprobantes', 'comprobantes', false, 5242880, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists moxi_escribir_propia_carpeta on storage.objects;
drop policy if exists moxi_actualizar_propia_carpeta on storage.objects;
drop policy if exists moxi_borrar_propia_carpeta on storage.objects;
drop policy if exists moxi_leer_comprobantes on storage.objects;

create policy moxi_escribir_propia_carpeta on storage.objects for insert to authenticated
  with check (bucket_id in ('productos','empresa','comprobantes')
    and ((storage.foldername(name))[1] = (select public.get_empresa_id())::text or (select public.is_superadmin())));
create policy moxi_actualizar_propia_carpeta on storage.objects for update to authenticated
  using (bucket_id in ('productos','empresa')
    and ((storage.foldername(name))[1] = (select public.get_empresa_id())::text or (select public.is_superadmin())));
create policy moxi_borrar_propia_carpeta on storage.objects for delete to authenticated
  using (bucket_id in ('productos','empresa')
    and ((storage.foldername(name))[1] = (select public.get_empresa_id())::text or (select public.is_superadmin())));
-- Comprobantes de pago (privados): la empresa ve los suyos; el superadmin, todos
create policy moxi_leer_comprobantes on storage.objects for select to authenticated
  using (bucket_id = 'comprobantes'
    and ((storage.foldername(name))[1] = (select public.get_empresa_id())::text or (select public.is_superadmin())));

-- ── Funciones temporales (solo superadmin) para convertir las fotos base64 existentes ──
create or replace function public.admin_productos_con_base64()
returns table (id uuid, empresa_id uuid, nombre text, kb int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_superadmin() then raise exception 'Solo superadmin' using errcode = '42501'; end if;
  return query select p.id, p.empresa_id, p.nombre, (length(p.img) / 1024)::int
    from public.productos p where p.img like 'data:%' and p.imagen_url is null order by length(p.img);
end $$;

create or replace function public.admin_imagen_base64(p_id uuid)
returns text language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_superadmin() then raise exception 'Solo superadmin' using errcode = '42501'; end if;
  return (select img from public.productos where id = p_id);
end $$;

create or replace function public.admin_set_imagen_url(p_id uuid, p_url text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_superadmin() then raise exception 'Solo superadmin' using errcode = '42501'; end if;
  if p_url !~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/productos/' then raise exception 'URL inválida'; end if;
  update public.productos set imagen_url = p_url where id = p_id;
end $$;

revoke execute on function public.admin_productos_con_base64() from public, anon;
revoke execute on function public.admin_imagen_base64(uuid) from public, anon;
revoke execute on function public.admin_set_imagen_url(uuid, text) from public, anon;
grant execute on function public.admin_productos_con_base64() to authenticated;
grant execute on function public.admin_imagen_base64(uuid) to authenticated;
grant execute on function public.admin_set_imagen_url(uuid, text) to authenticated;
