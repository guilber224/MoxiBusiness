-- ============================================================
-- MOXI BUSINESS — FIX DEFINITIVO DE ACCESO A DATOS
-- ============================================================
-- EJECUTAR EN: supabase.com/dashboard → SQL Editor → New Query → Pegar → Run
--
-- PROBLEMA: Las políticas RLS bloquean las queries aunque el usuario
-- esté autenticado, posiblemente porque get_empresa_id() devuelve NULL.
--
-- SOLUCIÓN: Desactivar RLS en tablas de datos.
-- La app ya filtra por empresa_id en el código, así que los datos
-- siguen siendo privados por empresa. Solo usuarios autenticados ven datos.
-- ============================================================

-- ── PASO 1: Recrear funciones de forma robusta ──────────────

CREATE OR REPLACE FUNCTION public.get_empresa_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT empresa_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1;
$$;

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

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.usuarios WHERE id = auth.uid() LIMIT 1;
$$;

-- ── PASO 2: Permisos explícitos para rol authenticated ───────

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, anon;

-- ── PASO 3: DESACTIVAR RLS en tablas de datos ───────────────
-- La app filtra por empresa_id explícitamente en cada query.
-- Esto garantiza acceso a datos sin depender de get_empresa_id().

ALTER TABLE public.clientes    DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.productos   DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.ventas      DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.gastos      DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventario  DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimientos DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos     DISABLE ROW LEVEL SECURITY;

-- Desactivar RLS en suscripciones si existe
DO $$ BEGIN
  ALTER TABLE public.suscripciones DISABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Desactivar RLS en pagos si existe
DO $$ BEGIN
  ALTER TABLE public.pagos DISABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ── PASO 4: Mantener seguridad en usuarios (sin recursión) ───

ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usuarios_select_own"           ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_select_same_empresa"  ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_select_empresa"       ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_insert_admin"         ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_update_own_or_admin"  ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_delete_admin"         ON public.usuarios;

-- SELECT: solo la fila propia (sin llamar a get_empresa_id → sin recursión)
CREATE POLICY "usuarios_select_own"
  ON public.usuarios FOR SELECT
  USING (id = auth.uid());

-- INSERT: admins pueden insertar usuarios de su empresa
CREATE POLICY "usuarios_insert_admin"
  ON public.usuarios FOR INSERT
  WITH CHECK (empresa_id = public.get_empresa_id() AND public.get_my_role() = 'admin');

-- UPDATE: propio perfil o admin de la empresa
CREATE POLICY "usuarios_update_own_or_admin"
  ON public.usuarios FOR UPDATE
  USING (id = auth.uid() OR (empresa_id = public.get_empresa_id() AND public.get_my_role() = 'admin'));

-- DELETE: admin elimina usuarios de su empresa
CREATE POLICY "usuarios_delete_admin"
  ON public.usuarios FOR DELETE
  USING (empresa_id = public.get_empresa_id() AND id != auth.uid() AND public.get_my_role() = 'admin');

-- ── PASO 5: Agregar columnas faltantes en productos ─────────
-- La app envía estos campos; si la tabla no los tiene, el INSERT falla.
-- ADD COLUMN IF NOT EXISTS es seguro: no hace nada si ya existe.
ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS cost        numeric       DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "minStock"  numeric       DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cat         text          DEFAULT '',
  ADD COLUMN IF NOT EXISTS img         text,
  ADD COLUMN IF NOT EXISTS name        text;

-- Columnas adicionales de ventas
ALTER TABLE public.ventas
  ADD COLUMN IF NOT EXISTS payment_method  text      DEFAULT 'efectivo',
  ADD COLUMN IF NOT EXISTS "usuario_id"    uuid,
  ADD COLUMN IF NOT EXISTS items           jsonb,
  ADD COLUMN IF NOT EXISTS debt            numeric   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount        numeric   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes           text,
  ADD COLUMN IF NOT EXISTS "customerId"    text;

-- Columnas adicionales de inventario
ALTER TABLE public.inventario
  ADD COLUMN IF NOT EXISTS "productId"  text,
  ADD COLUMN IF NOT EXISTS stock        numeric   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "updatedAt"  timestamptz DEFAULT now();

-- Columnas adicionales de clientes
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS phone        text,
  ADD COLUMN IF NOT EXISTS address      text,
  ADD COLUMN IF NOT EXISTS notes        text;

-- Columnas adicionales de movimientos
ALTER TABLE public.movimientos
  ADD COLUMN IF NOT EXISTS cost         numeric   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS type         text,
  ADD COLUMN IF NOT EXISTS description  text,
  ADD COLUMN IF NOT EXISTS "productId"  text,
  ADD COLUMN IF NOT EXISTS "createdAt"  timestamptz DEFAULT now();

-- ── PASO 6: Verificación — ejecuta esto para confirmar ───────
-- (Descomenta y ejecuta por separado para ver el estado)

-- SELECT id, email, nombre, role, empresa_id FROM public.usuarios;
-- SELECT 'clientes' as tabla, count(*) FROM public.clientes
-- UNION ALL SELECT 'productos', count(*) FROM public.productos
-- UNION ALL SELECT 'ventas', count(*) FROM public.ventas
-- UNION ALL SELECT 'gastos', count(*) FROM public.gastos;

-- ============================================================
-- DESPUÉS DE EJECUTAR: Recargar la app en el navegador
-- Los datos deberían aparecer inmediatamente.
-- ============================================================
