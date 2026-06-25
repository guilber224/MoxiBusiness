-- ============================================================
-- MOXIS — FIX CRÍTICO DEFINITIVO
-- Ejecutar en: Supabase Dashboard → SQL Editor → Run
-- ============================================================
-- Este script resuelve el error:
--   "infinite recursion detected in policy for relation usuarios"
-- que impide el login (HTTP 500 en getProfile).
--
-- ESTRATEGIA:
--   1. get_my_profile() SECURITY DEFINER: el frontend la llama
--      en lugar de hacer SELECT directo → bypasea RLS totalmente.
--   2. get_empresa_id() y get_my_role() SECURITY DEFINER:
--      usadas por otras tables (ventas, productos, etc.).
--   3. usuarios SELECT: SOLO id = auth.uid() — sin funciones,
--      sin recursión posible.
-- ============================================================

-- ── Funciones helper ─────────────────────────────────────────

-- Devuelve el perfil completo del usuario autenticado.
-- SECURITY DEFINER + search_path = bypasea toda RLS.
-- El frontend usa esta función en lugar de SELECT directo.
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS TABLE(id uuid, email text, nombre text, role text, empresa_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.email, u.nombre, u.role, u.empresa_id
  FROM public.usuarios u
  WHERE u.id = auth.uid()
  LIMIT 1;
$$;

-- Devuelve empresa_id del usuario autenticado (usada por otras tablas).
-- Segura porque la SELECT policy de usuarios es solo id = auth.uid().
CREATE OR REPLACE FUNCTION public.get_empresa_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT empresa_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1;
$$;

-- Devuelve el role del usuario autenticado.
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.usuarios WHERE id = auth.uid() LIMIT 1;
$$;

-- ── Tabla usuarios: eliminar TODAS las policies y recrear ────

ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usuarios_select_same_empresa"   ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_select_own"             ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_select_empresa"         ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_insert_system"          ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_insert_admin"           ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_update_own_or_admin"    ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_delete_admin"           ON public.usuarios;

-- SELECT: ÚNICA policy. Sin funciones. Sin recursión.
-- Nota: el frontend usa get_my_profile() vía RPC, no SELECT directo.
-- Esta policy solo es el fallback para queries directas al schema.
CREATE POLICY "usuarios_select_own"
  ON public.usuarios FOR SELECT
  USING (id = auth.uid());

-- INSERT: admins crean usuarios de su empresa
-- get_empresa_id/get_my_role son seguros porque SELECT = id = auth.uid()
CREATE POLICY "usuarios_insert_admin"
  ON public.usuarios FOR INSERT
  WITH CHECK (
    empresa_id = public.get_empresa_id()
    AND public.get_my_role() = 'admin'
  );

-- UPDATE: propio perfil O admin edita su empresa
CREATE POLICY "usuarios_update_own_or_admin"
  ON public.usuarios FOR UPDATE
  USING (
    id = auth.uid()
    OR (
      empresa_id = public.get_empresa_id()
      AND public.get_my_role() = 'admin'
    )
  );

-- DELETE: admin elimina usuarios de su empresa (no a sí mismo)
CREATE POLICY "usuarios_delete_admin"
  ON public.usuarios FOR DELETE
  USING (
    empresa_id = public.get_empresa_id()
    AND id != auth.uid()
    AND public.get_my_role() = 'admin'
  );

-- ── Otras tablas: asegurar que existen y usan get_empresa_id ─

ALTER TABLE public.empresas   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ventas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gastos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimientos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ventas_all_same_empresa"      ON public.ventas;
DROP POLICY IF EXISTS "productos_all_same_empresa"   ON public.productos;
DROP POLICY IF EXISTS "inventario_all_same_empresa"  ON public.inventario;
DROP POLICY IF EXISTS "clientes_all_same_empresa"    ON public.clientes;
DROP POLICY IF EXISTS "gastos_all_same_empresa"      ON public.gastos;
DROP POLICY IF EXISTS "movimientos_all_same_empresa" ON public.movimientos;
DROP POLICY IF EXISTS "empresas_select_own"          ON public.empresas;
DROP POLICY IF EXISTS "empresas_insert_system"       ON public.empresas;
DROP POLICY IF EXISTS "empresas_update_admin"        ON public.empresas;

CREATE POLICY "ventas_all_same_empresa"      ON public.ventas      FOR ALL USING (empresa_id = public.get_empresa_id()) WITH CHECK (empresa_id = public.get_empresa_id());
CREATE POLICY "productos_all_same_empresa"   ON public.productos   FOR ALL USING (empresa_id = public.get_empresa_id()) WITH CHECK (empresa_id = public.get_empresa_id());
CREATE POLICY "inventario_all_same_empresa"  ON public.inventario  FOR ALL USING (empresa_id = public.get_empresa_id()) WITH CHECK (empresa_id = public.get_empresa_id());
CREATE POLICY "clientes_all_same_empresa"    ON public.clientes    FOR ALL USING (empresa_id = public.get_empresa_id()) WITH CHECK (empresa_id = public.get_empresa_id());
CREATE POLICY "gastos_all_same_empresa"      ON public.gastos      FOR ALL USING (empresa_id = public.get_empresa_id()) WITH CHECK (empresa_id = public.get_empresa_id());
CREATE POLICY "movimientos_all_same_empresa" ON public.movimientos FOR ALL USING (empresa_id = public.get_empresa_id()) WITH CHECK (empresa_id = public.get_empresa_id());
CREATE POLICY "empresas_select_own"          ON public.empresas    FOR SELECT USING (id = public.get_empresa_id());
CREATE POLICY "empresas_insert_system"       ON public.empresas    FOR INSERT WITH CHECK (false);
CREATE POLICY "empresas_update_admin"        ON public.empresas    FOR UPDATE USING (id = public.get_empresa_id()) WITH CHECK (id = public.get_empresa_id());
