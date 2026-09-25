-- ============================================================
-- MOXIS BUSINESS — OPTIMIZACIONES DE RENDIMIENTO
-- Ejecutar en: Supabase Dashboard → SQL Editor → Run
-- Es seguro correr múltiples veces (IF NOT EXISTS / OR REPLACE)
-- ============================================================

-- ── 1. ÍNDICE FALTANTE: inventario (empresa_id + productId)
--    Acelera los upsertStock que buscan por empresa_id Y productId
--    Sin este índice, cada ajuste de inventario hace un full scan.
CREATE INDEX IF NOT EXISTS idx_inventario_empresa_producto
  ON public.inventario (empresa_id, "productId");

-- ── 2. ÍNDICE FALTANTE: clientes (empresa_id + nombre)
--    Acelera búsquedas de clientes por nombre dentro de la empresa
CREATE INDEX IF NOT EXISTS idx_clientes_empresa_nombre
  ON public.clientes (empresa_id, nombre);

-- ── 3. ÍNDICE FALTANTE: movimientos (empresa_id + createdAt)
--    Acelera la carga del historial de movimientos ordenado por fecha
CREATE INDEX IF NOT EXISTS idx_movimientos_empresa_createdat
  ON public.movimientos (empresa_id, "createdAt");

-- ── 4. CONFIRMAR que los índices críticos ya existen
--    (estos deberían estar del supabase_rls.sql anterior)
CREATE INDEX IF NOT EXISTS idx_ventas_empresa
  ON public.ventas (empresa_id);
CREATE INDEX IF NOT EXISTS idx_ventas_empresa_createdat
  ON public.ventas (empresa_id, "createdAt");
CREATE INDEX IF NOT EXISTS idx_gastos_empresa_createdat
  ON public.gastos (empresa_id, "createdAt");

-- ── 5. FUNCIÓN get_empresa_id — versión con caché en sesión
--    STABLE permite que PostgreSQL la evalúe UNA sola vez por query
--    en lugar de una vez por fila (especialmente importante en RLS)
CREATE OR REPLACE FUNCTION public.get_empresa_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT empresa_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1;
$$;

-- ── 6. VACUUM de las tablas más usadas para actualizar estadísticas
--    Ayuda al query planner a elegir los índices correctos
ANALYZE public.ventas;
ANALYZE public.gastos;
ANALYZE public.inventario;
ANALYZE public.clientes;
ANALYZE public.productos;

-- ── VERIFICACIÓN: ver índices existentes en las tablas principales
-- SELECT schemaname, tablename, indexname, indexdef
-- FROM pg_indexes
-- WHERE schemaname = 'public'
--   AND tablename IN ('ventas','gastos','inventario','clientes','productos','movimientos')
-- ORDER BY tablename, indexname;
