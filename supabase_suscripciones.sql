-- ================================================================
-- MOXIS BUSINESS — Sistema de Suscripciones v1
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ================================================================

-- 1. Tabla principal de suscripciones por empresa
CREATE TABLE IF NOT EXISTS suscripciones (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     uuid        NOT NULL UNIQUE,
  nombre_empresa text        NOT NULL DEFAULT '',
  activa         boolean     NOT NULL DEFAULT true,
  plan           text        NOT NULL DEFAULT 'trial',
  vence_el       date        NOT NULL,
  notas          text        DEFAULT '',
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

ALTER TABLE suscripciones ENABLE ROW LEVEL SECURITY;

-- Cada empresa lee solo su propia suscripción
CREATE POLICY "sus_select_own" ON suscripciones
  FOR SELECT TO authenticated
  USING (empresa_id = get_empresa_id());

-- Cada empresa puede crear su propio trial (INSERT)
CREATE POLICY "sus_insert_own" ON suscripciones
  FOR INSERT TO authenticated
  WITH CHECK (empresa_id = get_empresa_id());

-- Superadmin puede hacer cualquier operación en todas las suscripciones
CREATE POLICY "sus_superadmin_all" ON suscripciones
  FOR ALL TO authenticated
  USING (
    (SELECT role FROM usuarios WHERE id = auth.uid()) = 'superadmin'
  )
  WITH CHECK (
    (SELECT role FROM usuarios WHERE id = auth.uid()) = 'superadmin'
  );

-- ================================================================
-- 2. Configuración global del sistema (WhatsApp de soporte, etc.)
-- ================================================================
CREATE TABLE IF NOT EXISTS sistema_config (
  id                int         PRIMARY KEY DEFAULT 1,
  whatsapp_soporte  text        NOT NULL DEFAULT '+59163506018',
  updated_at        timestamptz DEFAULT now()
);

INSERT INTO sistema_config (id, whatsapp_soporte)
VALUES (1, '+59163506018')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE sistema_config ENABLE ROW LEVEL SECURITY;

-- Todos los usuarios autenticados pueden leer (necesitan el número en pantalla vencida)
CREATE POLICY "syscfg_read_all" ON sistema_config
  FOR SELECT TO authenticated USING (true);

-- Solo superadmin puede actualizar
CREATE POLICY "syscfg_superadmin_update" ON sistema_config
  FOR UPDATE TO authenticated
  USING (
    (SELECT role FROM usuarios WHERE id = auth.uid()) = 'superadmin'
  )
  WITH CHECK (
    (SELECT role FROM usuarios WHERE id = auth.uid()) = 'superadmin'
  );

-- ================================================================
-- 3. Asignar tu cuenta como superadmin (ejecutar UNA VEZ)
-- ================================================================
-- En Supabase Dashboard → Table Editor → tabla "usuarios"
-- Busca tu fila y cambia el campo "role" a: superadmin
--
-- O ejecuta esta query (reemplaza el UUID con el tuyo desde auth.users):
--   UPDATE usuarios SET role = 'superadmin' WHERE id = 'TU_UUID_AQUI';
