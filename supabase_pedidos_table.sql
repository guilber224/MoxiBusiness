-- ============================================================
-- MOXIS BUSINESS — TABLA: pedidos (Cotizaciones y Pedidos)
--
-- Una sola tabla para ambos tipos de documento comercial:
--   tipo = 'cotizacion' | 'pedido'
--
-- El módulo Pedidos funciona SIN esta tabla (cae a localStorage),
-- pero ejecútala para sincronizar cotizaciones/pedidos con la nube
-- y entre dispositivos. Sigue el mismo patrón RLS multiempresa.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor → Run
-- (Requiere que get_empresa_id() ya exista — ver supabase_rls.sql)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pedidos (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            uuid NOT NULL,
  usuario_id            uuid,
  numero                integer,
  codigo                text,
  tipo                  text NOT NULL DEFAULT 'cotizacion',   -- 'cotizacion' | 'pedido'
  estado                text NOT NULL DEFAULT 'borrador',
  "customerId"          text,
  "customerName"        text,
  "customerMarket"      text,
  "customerPhone"       text,
  date                  text,
  "validUntil"          text,
  "deliveryDate"        text,
  items                 jsonb DEFAULT '[]'::jsonb,
  subtotal              numeric(12,2) DEFAULT 0,
  discount              numeric(12,2) DEFAULT 0,
  "discountType"        text DEFAULT 'pct',
  tax                   numeric(6,2)  DEFAULT 0,
  "taxAmount"           numeric(12,2) DEFAULT 0,
  total                 numeric(12,2) DEFAULT 0,
  notes                 text,
  "paymentTerms"        text,
  "convertedToSaleId"   text,
  "convertedFromQuoteId" text,
  "createdAt"           timestamptz DEFAULT now(),
  "updatedAt"           timestamptz DEFAULT now()
);

-- ── RLS multiempresa ──
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pedidos_all_same_empresa" ON public.pedidos;
CREATE POLICY "pedidos_all_same_empresa"
  ON public.pedidos FOR ALL
  USING (empresa_id = public.get_empresa_id())
  WITH CHECK (empresa_id = public.get_empresa_id());

-- ── GRANTs de tabla (incluye DELETE — ver supabase_fix_delete_grants.sql) ──
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pedidos TO authenticated;

-- ── Índices ──
CREATE INDEX IF NOT EXISTS idx_pedidos_empresa       ON public.pedidos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_empresa_tipo  ON public.pedidos(empresa_id, tipo);

-- ── Realtime (opcional) ──
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.pedidos;
