-- Moxi Business — Migración 06: categorías de producto en el servidor.
-- Antes vivían solo en el navegador; cada producto guardaba un "slug" en productos.cat.
-- Se crean las categorías por empresa y se enlazan con productos.categoria_id. Re-ejecutable.

create or replace function public.migrar_categorias()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into categorias (empresa_id, nombre, tipo)
  select distinct p.empresa_id,
    case p.cat
      when 'vaina' then 'Ají en Vaina' when 'rojo_dulce' then 'Polvo Rojo Dulce'
      when 'rojo_picante' then 'Polvo Rojo Picante' when 'amarillo' then 'Polvo Amarillo'
      when 'granel' then 'Granel'
      else initcap(replace(p.cat, '_', ' ')) end,
    'PRODUCTO'
  from productos p
  where p.cat is not null and p.cat <> '' and p.cat <> 'sin_categoria' and p.categoria_id is null
  on conflict (empresa_id, nombre, tipo) do nothing;

  update productos p set categoria_id = c.id
  from categorias c
  where c.empresa_id = p.empresa_id and c.tipo = 'PRODUCTO' and p.categoria_id is null
    and c.nombre = case p.cat
      when 'vaina' then 'Ají en Vaina' when 'rojo_dulce' then 'Polvo Rojo Dulce'
      when 'rojo_picante' then 'Polvo Rojo Picante' when 'amarillo' then 'Polvo Amarillo'
      when 'granel' then 'Granel'
      else initcap(replace(p.cat, '_', ' ')) end;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.migrar_categorias() from public, anon, authenticated;
