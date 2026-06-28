-- ================================================================
-- MOXIS BUSINESS — Historial de Pagos
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- Requiere: get_user_role() (del script supabase_usuarios_rls.sql)
-- ================================================================

CREATE TABLE IF NOT EXISTS pagos (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     uuid        NOT NULL,
  nombre_empresa text        NOT NULL DEFAULT '',
  monto          numeric(10,2),
  moneda         text        DEFAULT 'BOB',
  plan           text        DEFAULT 'activo',
  dias           int,
  notas          text        DEFAULT '',
  created_at     timestamptz DEFAULT now()
);

ALTER TABLE pagos ENABLE ROW LEVEL SECURITY;

-- Solo superadmin puede leer, insertar, actualizar y eliminar pagos
CREATE POLICY "pagos_superadmin_all" ON pagos
  FOR ALL TO authenticated
  USING (get_user_role() = 'superadmin')
  WITH CHECK (get_user_role() = 'superadmin');
