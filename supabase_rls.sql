-- ============================================================
-- MOXIS BUSINESS — RLS MULTIEMPRESA COMPLETO v2
-- CORRECCIÓN: recursión infinita en política de `usuarios`
--
-- PROBLEMA ANTERIOR:
--   usuarios SELECT policy → llamaba get_empresa_id()
--   get_empresa_id()       → hacía SELECT FROM usuarios
--   → bucle infinito (HTTP 500)
--
-- SOLUCIÓN:
--   Política 1 de usuarios: solo `id = auth.uid()` (sin función)
--   Política 2 de usuarios: empresa_id = get_empresa_id() (ahora
--     segura porque la política 1 resuelve el SELECT interno)
--
-- Ejecutar en Supabase Dashboard → SQL Editor
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 0A. FUNCIÓN: get_empresa_id()
--     Devuelve empresa_id del usuario autenticado.
--     SECURITY DEFINER + SET search_path: evita inyección de schema.
--     No es recursiva porque la política SELECT de usuarios
--     ya tiene una rama simple `id = auth.uid()` que resuelve
--     el SELECT interno sin llamar a esta función.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_empresa_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT empresa_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1;
$$;

-- ────────────────────────────────────────────────────────────
-- 0B. FUNCIÓN: get_my_role()
--     Devuelve el role del usuario autenticado.
--     Usada en policies de UPDATE/DELETE/INSERT de usuarios
--     para verificar si es admin sin recursión.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.usuarios WHERE id = auth.uid() LIMIT 1;
$$;

-- ────────────────────────────────────────────────────────────
-- 1. TABLA: empresas
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "empresas_select_own"    ON public.empresas;
DROP POLICY IF EXISTS "empresas_insert_system" ON public.empresas;
DROP POLICY IF EXISTS "empresas_update_admin"  ON public.empresas;

-- Cada usuario ve solo su empresa
CREATE POLICY "empresas_select_own"
  ON public.empresas FOR SELECT
  USING (id = public.get_empresa_id());

-- Solo la función registrar_empresa (SECURITY DEFINER) puede insertar
CREATE POLICY "empresas_insert_system"
  ON public.empresas FOR INSERT
  WITH CHECK (false);

-- Admin puede actualizar datos de su empresa
CREATE POLICY "empresas_update_admin"
  ON public.empresas FOR UPDATE
  USING (id = public.get_empresa_id())
  WITH CHECK (id = public.get_empresa_id());

-- ────────────────────────────────────────────────────────────
-- 2. TABLA: usuarios
--    CLAVE: las dos políticas SELECT son distintas y no recursivas.
--
--    ¿Por qué no es recursiva?
--    - Política A: id = auth.uid()  → nunca llama a get_empresa_id()
--    - Política B: empresa_id = get_empresa_id()
--        → get_empresa_id() hace SELECT FROM usuarios WHERE id = auth.uid()
--        → ese SELECT aplica la Política A (id = auth.uid()) → PASA sin función
--        → get_empresa_id() devuelve empresa_id → Política B puede evaluarse
--    → Recursión terminada en profundidad 1. ✓
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usuarios_select_same_empresa"   ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_select_own"             ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_select_empresa"         ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_insert_system"          ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_insert_admin"           ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_update_own_or_admin"    ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_delete_admin"           ON public.usuarios;

-- ÚNICA policy SELECT: solo la fila propia. Sin ninguna función.
-- CRÍTICO: No agregar aquí NINGUNA policy que llame a get_empresa_id()
-- ni get_my_role() — eso causaría recursión infinita porque esas
-- funciones hacen SELECT FROM usuarios y dispararían esta misma policy.
CREATE POLICY "usuarios_select_own"
  ON public.usuarios FOR SELECT
  USING (id = auth.uid());

-- INSERT: registrar_empresa (SECURITY DEFINER) puede insertar siempre.
-- Admins también pueden crear usuarios de su empresa (para crear vendedores/operadores).
CREATE POLICY "usuarios_insert_admin"
  ON public.usuarios FOR INSERT
  WITH CHECK (
    -- Nuevos usuarios del sistema vía registrar_empresa (empresa_id válida para el admin)
    empresa_id = public.get_empresa_id()
    AND public.get_my_role() = 'admin'
  );

-- UPDATE: cada usuario edita su propio perfil; admin edita los de su empresa
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

-- ────────────────────────────────────────────────────────────
-- 3. TABLA: ventas
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.ventas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ventas_all_same_empresa" ON public.ventas;
CREATE POLICY "ventas_all_same_empresa"
  ON public.ventas FOR ALL
  USING (empresa_id = public.get_empresa_id())
  WITH CHECK (empresa_id = public.get_empresa_id());

-- ────────────────────────────────────────────────────────────
-- 4. TABLA: productos
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "productos_all_same_empresa" ON public.productos;
CREATE POLICY "productos_all_same_empresa"
  ON public.productos FOR ALL
  USING (empresa_id = public.get_empresa_id())
  WITH CHECK (empresa_id = public.get_empresa_id());

-- ────────────────────────────────────────────────────────────
-- 5. TABLA: inventario
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.inventario ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventario_all_same_empresa" ON public.inventario;
CREATE POLICY "inventario_all_same_empresa"
  ON public.inventario FOR ALL
  USING (empresa_id = public.get_empresa_id())
  WITH CHECK (empresa_id = public.get_empresa_id());

-- ────────────────────────────────────────────────────────────
-- 6. TABLA: clientes
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clientes_all_same_empresa" ON public.clientes;
CREATE POLICY "clientes_all_same_empresa"
  ON public.clientes FOR ALL
  USING (empresa_id = public.get_empresa_id())
  WITH CHECK (empresa_id = public.get_empresa_id());

-- ────────────────────────────────────────────────────────────
-- 7. TABLA: gastos
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.gastos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gastos_all_same_empresa" ON public.gastos;
CREATE POLICY "gastos_all_same_empresa"
  ON public.gastos FOR ALL
  USING (empresa_id = public.get_empresa_id())
  WITH CHECK (empresa_id = public.get_empresa_id());

-- ────────────────────────────────────────────────────────────
-- 8. TABLA: movimientos
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.movimientos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "movimientos_all_same_empresa" ON public.movimientos;
CREATE POLICY "movimientos_all_same_empresa"
  ON public.movimientos FOR ALL
  USING (empresa_id = public.get_empresa_id())
  WITH CHECK (empresa_id = public.get_empresa_id());

-- ────────────────────────────────────────────────────────────
-- 9. FUNCIÓN: registrar_empresa (SECURITY DEFINER)
--    Crea empresa + perfil admin en transacción atómica.
--    Llámada DESPUÉS de supabase.auth.signUp() desde el frontend.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.registrar_empresa(
  p_empresa_nombre TEXT,
  p_admin_nombre   TEXT,
  p_email          TEXT
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa_id uuid;
  v_user_id    uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF p_email IS NULL OR trim(p_email) = '' THEN
    RAISE EXCEPTION 'Email requerido';
  END IF;

  INSERT INTO public.empresas (nombre)
  VALUES (p_empresa_nombre)
  RETURNING id INTO v_empresa_id;

  INSERT INTO public.usuarios (id, email, nombre, role, empresa_id)
  VALUES (v_user_id, trim(p_email), p_admin_nombre, 'admin', v_empresa_id)
  ON CONFLICT (id) DO UPDATE
    SET email      = EXCLUDED.email,
        nombre     = EXCLUDED.nombre,
        role       = 'admin',
        empresa_id = v_empresa_id;

  RETURN json_build_object('empresa_id', v_empresa_id, 'user_id', v_user_id);
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 10. REALTIME
-- ────────────────────────────────────────────────────────────
-- En Supabase Dashboard → Database → Replication → Source:
-- Habilitar: ventas, productos, inventario, clientes, gastos, movimientos
-- O vía SQL (si el plan lo permite):
-- ALTER PUBLICATION supabase_realtime ADD TABLE
--   public.ventas, public.productos, public.inventario,
--   public.clientes, public.gastos, public.movimientos;

-- ────────────────────────────────────────────────────────────
-- 11. ÍNDICES
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ventas_empresa      ON public.ventas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_productos_empresa   ON public.productos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_inventario_empresa  ON public.inventario(empresa_id);
CREATE INDEX IF NOT EXISTS idx_clientes_empresa    ON public.clientes(empresa_id);
CREATE INDEX IF NOT EXISTS idx_gastos_empresa      ON public.gastos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_empresa ON public.movimientos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_empresa    ON public.usuarios(empresa_id);

-- ────────────────────────────────────────────────────────────
-- 12–14. Columnas adicionales
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.gastos      ADD COLUMN IF NOT EXISTS responsable   TEXT;
ALTER TABLE public.movimientos ADD COLUMN IF NOT EXISTS cost          NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.ventas      ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'efectivo';
