-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  MIGRACIONES NUEVAS COLUMNAS                                        ║
-- ║  Ejecutar en Supabase Dashboard → SQL Editor                        ║
-- ╚══════════════════════════════════════════════════════════════════════╝

-- 1. Costo de producto (para calcular margen de ganancia)
ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS cost numeric DEFAULT 0;

-- 2. Días de trial configurables por superadmin
ALTER TABLE public.sistema_config
  ADD COLUMN IF NOT EXISTS trial_dias integer DEFAULT 7;

-- Asegurarse de que la fila de config existe con los nuevos valores
INSERT INTO public.sistema_config (id, whatsapp_soporte, trial_dias)
VALUES (1, '+59163506018', 7)
ON CONFLICT (id) DO UPDATE
  SET trial_dias = COALESCE(sistema_config.trial_dias, 7);
