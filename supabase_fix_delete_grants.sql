-- ============================================================
-- MOXIS BUSINESS — FIX: "permission denied for table ventas" (403)
--
-- SÍNTOMA:
--   Al eliminar una venta → HTTP 403
--   ventasService.js: "fallback deleteVenta: permission denied for table ventas"
--
-- CAUSA:
--   El rol `authenticated` tiene GRANT de SELECT/INSERT/UPDATE sobre las
--   tablas del negocio, pero le FALTA el privilegio DELETE a nivel de tabla.
--   Esto es independiente de RLS: la política `ventas_all_same_empresa`
--   ya es FOR ALL (incluye DELETE), pero sin el GRANT de tabla PostgreSQL
--   rechaza la operación ANTES de evaluar RLS → "permission denied for table".
--
-- SOLUCIÓN:
--   Conceder DELETE (junto a SELECT/INSERT/UPDATE) al rol `authenticated`.
--   RLS sigue protegiendo: solo se podrán borrar filas de la propia empresa.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- Privilegios de tabla para el rol autenticado (RLS sigue filtrando por empresa)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ventas       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.productos    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventario   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clientes     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gastos       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.movimientos  TO authenticated;

-- Asegurar que futuras tablas creadas por el owner también concedan estos privilegios
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

-- ────────────────────────────────────────────────────────────
-- VERIFICACIÓN (opcional): ver privilegios actuales sobre `ventas`
-- ────────────────────────────────────────────────────────────
-- SELECT grantee, privilege_type
-- FROM information_schema.role_table_grants
-- WHERE table_schema = 'public' AND table_name = 'ventas'
-- ORDER BY grantee, privilege_type;

-- ============================================================
-- BONUS — rendimiento: "statement timeout" (code 57014) en
-- getTopProductos / analíticas. Índices que aceleran los rangos
-- por fecha que usa analyticsService (createdAt + empresa_id).
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_ventas_empresa_createdat
  ON public.ventas (empresa_id, "createdAt");
CREATE INDEX IF NOT EXISTS idx_gastos_empresa_createdat
  ON public.gastos (empresa_id, "createdAt");
