export const LAST_EMPRESA_KEY = "moxi_last_empresa_id";

export function getScopedStorageKey(baseKey, empresaId) {
  if (!empresaId) return null;
  return `moxi_${empresaId}_${baseKey}`;
}

export function getEmpresaScope(empresaId) {
  return empresaId ? `moxi_${empresaId}` : null;
}

export function saveLastEmpresaId(empresaId) {
  if (!empresaId) return;
  try { localStorage.setItem(LAST_EMPRESA_KEY, empresaId); } catch {}
}

export function getLastEmpresaId() {
  try { return localStorage.getItem(LAST_EMPRESA_KEY) || null; } catch { return null; }
}

const GLOBAL_STORAGE_KEYS = {
  customers:    "moxi_customers",
  products:     "moxi_products",
  inventory:    "moxi_inventory",
  sales:        "moxi_sales",
  suppliers:    "moxi_suppliers",
  purchases:    "moxi_purchases",
  formulas:     "moxi_formulas",
  orders:       "moxi_orders",
  expenses:     "moxi_expenses",
  movements:    "moxi_movements",
  categories:   "moxi_categories",
  users:        "moxi_users",
  config:       "moxi_config",
  activityLogs: "moxi_activity_logs",
};

// One-time migration: copies moxi_* global keys into moxi_<empresaId>_* scoped keys.
// Idempotent — skips if already migrated.
// IMPORTANT: Never run for Supabase UUID empresa IDs — those accounts start empty.
// Migration only applies to legacy local-mode installations upgrading key schema.
export const isSupabaseUUID = (id) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export function migrateLegacyStorageIfNeeded(empresaId) {
  if (!empresaId) return;
  // Supabase empresa IDs are UUIDs. Never copy legacy global data into a Supabase
  // account scope — that is the primary source of cross-company data contamination.
  if (isSupabaseUUID(empresaId)) return;
  try {
    const migrationKey = `moxi_migrated_${empresaId}`;
    if (localStorage.getItem(migrationKey)) return;
    Object.entries(GLOBAL_STORAGE_KEYS).forEach(([key, globalKey]) => {
      const scopedKey = `moxi_${empresaId}_${key}`;
      if (localStorage.getItem(scopedKey) === null) {
        const globalValue = localStorage.getItem(globalKey);
        if (globalValue !== null) localStorage.setItem(scopedKey, globalValue);
      }
    });
    localStorage.setItem(migrationKey, "1");
  } catch {}
}
