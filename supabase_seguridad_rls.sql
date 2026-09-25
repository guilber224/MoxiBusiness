-- ============================================================
-- MOXI BUSINESS — REACTIVAR SEGURIDAD (RLS) SIN PERDER VELOCIDAD
-- ============================================================
-- EJECUTAR EN: supabase.com/dashboard → SQL Editor → New Query → Pegar → Run
-- Es seguro correrlo varias veces.
--
-- PROBLEMA: supabase_fix_definitivo.sql desactivó RLS en las tablas de datos.
-- La clave "anon" va dentro de la app publicada (cualquiera puede verla en el
-- navegador), así que con RLS desactivado CUALQUIER persona puede leer, modificar
-- o borrar los clientes, ventas, gastos… de TODAS las empresas sin iniciar sesión.
--
-- SOLUCIÓN: cada usuario autenticado solo ve/escribe filas de su propia empresa.
-- El truco de rendimiento es envolver la función en (SELECT ...): PostgreSQL la
-- evalúa UNA vez por consulta en lugar de una vez por fila (recomendación oficial
-- de Supabase). Así las políticas no ralentizan la app.
-- ============================================================

-- ── PASO 0 (opcional): comprobar que todos los usuarios tienen empresa ──
-- Si algún usuario normal sale con empresa_id NULL, NO verá datos tras este script.
-- SELECT id, email, nombre, role, empresa_id FROM public.usuarios WHERE empresa_id IS NULL;

-- ── PASO 1: funciones auxiliares (SECURITY DEFINER → sin recursión en usuarios) ──
CREATE OR REPLACE FUNCTION public.get_empresa_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT empresa_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(lower(role) = 'superadmin', false) FROM public.usuarios WHERE id = auth.uid() LIMIT 1;
$$;

-- Helper temporal: borra todas las políticas existentes de una tabla (nombres de scripts anteriores)
CREATE OR REPLACE FUNCTION pg_temp.drop_policies(t text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
  END LOOP;
END $$;

-- ── PASO 2: tablas de datos del ERP → solo la propia empresa ──
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['clientes','productos','ventas','gastos','inventario','movimientos','pedidos'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    PERFORM pg_temp.drop_policies(t);
    EXECUTE format($p$
      CREATE POLICY %I ON public.%I FOR ALL TO authenticated
      USING      (empresa_id = (SELECT public.get_empresa_id()))
      WITH CHECK (empresa_id = (SELECT public.get_empresa_id()))
    $p$, t || '_misma_empresa', t);
    -- Nadie sin sesión puede tocar estas tablas
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  END LOOP;
END $$;

-- ── PASO 3: suscripciones → cada empresa ve la suya y puede crear su trial;
--            solo el superadmin puede extender, activar/desactivar o borrar ──
ALTER TABLE public.suscripciones ENABLE ROW LEVEL SECURITY;
SELECT pg_temp.drop_policies('suscripciones');
CREATE POLICY suscripciones_select ON public.suscripciones FOR SELECT TO authenticated
  USING (empresa_id = (SELECT public.get_empresa_id()) OR (SELECT public.is_superadmin()));
CREATE POLICY suscripciones_insert ON public.suscripciones FOR INSERT TO authenticated
  WITH CHECK (empresa_id = (SELECT public.get_empresa_id()) OR (SELECT public.is_superadmin()));
CREATE POLICY suscripciones_update ON public.suscripciones FOR UPDATE TO authenticated
  USING ((SELECT public.is_superadmin())) WITH CHECK ((SELECT public.is_superadmin()));
CREATE POLICY suscripciones_delete ON public.suscripciones FOR DELETE TO authenticated
  USING ((SELECT public.is_superadmin()));
REVOKE ALL ON public.suscripciones FROM anon;

-- ── PASO 4: pagos → solo superadmin ──
ALTER TABLE public.pagos ENABLE ROW LEVEL SECURITY;
SELECT pg_temp.drop_policies('pagos');
CREATE POLICY pagos_superadmin ON public.pagos FOR ALL TO authenticated
  USING ((SELECT public.is_superadmin())) WITH CHECK ((SELECT public.is_superadmin()));
REVOKE ALL ON public.pagos FROM anon;

-- ── PASO 5: sistema_config → todos los usuarios con sesión leen; solo superadmin edita ──
ALTER TABLE public.sistema_config ENABLE ROW LEVEL SECURITY;
SELECT pg_temp.drop_policies('sistema_config');
CREATE POLICY sistema_config_select ON public.sistema_config FOR SELECT TO authenticated USING (true);
CREATE POLICY sistema_config_write  ON public.sistema_config FOR UPDATE TO authenticated
  USING ((SELECT public.is_superadmin())) WITH CHECK ((SELECT public.is_superadmin()));
REVOKE ALL ON public.sistema_config FROM anon;

-- ── PASO 6: índices que usan las políticas y las consultas de la app ──
CREATE INDEX IF NOT EXISTS idx_usuarios_id_empresa     ON public.usuarios (id, empresa_id);
CREATE INDEX IF NOT EXISTS idx_clientes_empresa        ON public.clientes (empresa_id);
CREATE INDEX IF NOT EXISTS idx_productos_empresa       ON public.productos (empresa_id);
CREATE INDEX IF NOT EXISTS idx_gastos_empresa          ON public.gastos (empresa_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_empresa     ON public.movimientos (empresa_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_empresa         ON public.pedidos (empresa_id);
CREATE INDEX IF NOT EXISTS idx_ventas_empresa_createdat ON public.ventas (empresa_id, "createdAt");
CREATE INDEX IF NOT EXISTS idx_inventario_empresa_producto ON public.inventario (empresa_id, "productId");

-- ── VERIFICACIÓN ──
-- 1) Todas deben decir rowsecurity = true:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY 1;
-- 2) Políticas creadas:
-- SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname = 'public' ORDER BY 1, 2;
--
-- SI ALGO SALE MAL (la app deja de mostrar datos): vuelve a desactivar solo la tabla
-- afectada con  ALTER TABLE public.<tabla> DISABLE ROW LEVEL SECURITY;  y avísame.
-- ============================================================
