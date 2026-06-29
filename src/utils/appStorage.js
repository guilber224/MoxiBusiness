import { uid } from "./businessLogic.js";
import { getCurrentEmpresaId, isSupabaseScope } from "../empresaScope.js";
import { getScopedStorageKey, isSupabaseUUID } from "./storageScope.js";

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

export const loadStoredValue = async (key, fallback) => {
  if (getCurrentEmpresaId()) {
    // Supabase/multiempresa: preferir clave scoped (caché post-hidratación).
    const scoped = await DB.get(getScopedStorageKey(key, getCurrentEmpresaId()), undefined);
    if (scoped !== undefined) return scoped;
    // Fallback a clave global moxi_* — usuarios que migran de modo local a Supabase
    // tienen sus datos ahí hasta que se suban a Supabase por primera vez.
    if (STORAGE_KEYS[key]) {
      const global = await DB.get(STORAGE_KEYS[key], undefined);
      if (global !== undefined) return global;
    }
    return fallback;
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
    // Siempre escribir al localStorage scoped — sirve de caché local cuando Supabase
    // no está disponible o cuando hay errores de inserción (ej. columnas faltantes).
    // cacheSupabaseData() sobrescribirá con datos confirmados de Supabase al hidratar.
    DB.set(getScopedStorageKey(key, getCurrentEmpresaId()), value);
    return;
  }
  // Modo local: clave global moxi_*
  DB.set(STORAGE_KEYS[key] || key, value);
};

// Escribe datos de Supabase al localStorage scoped como caché.
// Solo para cuentas Supabase (UUID). Llamar después de cada hidratación exitosa.
// Permite mostrar datos cacheados instantáneamente en el próximo login.
export const cacheSupabaseData = (key, value, empresaId) => {
  if (!isSupabaseUUID(empresaId)) return;
  const scopedKey = getScopedStorageKey(key, empresaId);
  if (!scopedKey) return;
  try { localStorage.setItem(scopedKey, JSON.stringify(value)); } catch {}
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
