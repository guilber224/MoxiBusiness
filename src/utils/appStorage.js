import { uid } from "./businessLogic.js";
import { getCurrentEmpresaId, isSupabaseScope } from "../empresaScope.js";
import { getScopedStorageKey } from "./storageScope.js";

const storageApi = {
  async get(key) {
    const value = window.localStorage.getItem(key);
    return value == null ? null : { value };
  },
  async set(key, value) {
    window.localStorage.setItem(key, value);
  },
};
const DB = {
  async get(k, fb) { try { const r = await storageApi.get(k); return r ? JSON.parse(r.value) : fb; } catch { return fb; } },
  async set(k, v) { try { await storageApi.set(k, JSON.stringify(v)); } catch {} },
};

// Persistencia Moxi: migra a nuevas claves sin perder datos históricos guardados localmente.
export const STORAGE_KEYS = {
  customers: "moxi_customers",
  products: "moxi_products",
  inventory: "moxi_inventory",
  sales: "moxi_sales",
  suppliers: "moxi_suppliers",
  purchases: "moxi_purchases",
  formulas: "moxi_formulas",
  orders: "moxi_orders",
  pedidos: "moxi_pedidos",
  expenses: "moxi_expenses",
  movements: "moxi_movements",
  categories: "moxi_categories",
  users: "moxi_users",
  config: "moxi_config",
  activityLogs: "moxi_activity_logs",
};
const LEGACY_STORAGE_KEYS = {
  customers: "ah_customers",
  products: "ah_products3",
  inventory: "ah_inventory3",
  sales: "ah_sales",
  suppliers: "ah_suppliers",
  purchases: "ah_purchases",
  formulas: "ah_formulas",
  orders: "ah_orders",
  expenses: "ah_expenses",
  movements: "ah_movements",
  categories: "ah_categories",
  users: "ah_users",
};
export const DEFAULT_CONFIG = { businessName: "", currency: "BOB", createdAt: null, updatedAt: null };
export const DEFAULT_ACTIVITY_LOGS = [];

// Claves de datos de negocio con backing en Supabase — NUNCA persistir en localStorage para cuentas Supabase.
// Supabase es la única fuente de verdad para estas entidades.
const SUPABASE_DATA_KEYS = new Set(["customers","products","inventory","sales","expenses","movements"]);

export const loadStoredValue = async (key, fallback) => {
  if (getCurrentEmpresaId()) {
    // Supabase UUID: business data proviene de Supabase, no localStorage.
    // Leer localStorage aquí causaría datos fantasma y contaminación cruzada.
    if (isSupabaseScope() && SUPABASE_DATA_KEYS.has(key)) return fallback;
    // Supabase/multiempresa: SOLO clave scoped — nunca caer a global ni legacy.
    const scoped = await DB.get(getScopedStorageKey(key, getCurrentEmpresaId()), undefined);
    return scoped !== undefined ? scoped : fallback;
  }
  // Modo local/legacy: global moxi_* → ah_* → fallback
  const primary = await DB.get(STORAGE_KEYS[key], undefined);
  if (primary !== undefined) return primary;
  const legacyKey = LEGACY_STORAGE_KEYS[key];
  if (legacyKey) {
    const legacy = await DB.get(legacyKey, undefined);
    if (legacy !== undefined) return legacy;
  }
  return fallback;
};

export const persistValue = (key, value) => {
  if (getCurrentEmpresaId()) {
    // Supabase UUID: business data se persiste en Supabase (vía syncDiff/services).
    // Escribir en localStorage generaría datos rancios y contaminación entre dispositivos.
    if (isSupabaseScope() && SUPABASE_DATA_KEYS.has(key)) return;
    // Supabase mode: SOLO clave scoped — nunca escribir en global.
    DB.set(getScopedStorageKey(key, getCurrentEmpresaId()), value);
    return;
  }
  // Modo local: clave global moxi_*
  DB.set(STORAGE_KEYS[key] || key, value);
};

export const buildActivityEntry = (user, action, meta = {}) => ({
  id: "log" + uid(),
  userId: user?.id || "system",
  userName: user?.name || "Sistema",
  role: user?.role || "system",
  action,
  date: new Date().toISOString(),
  meta,
});
