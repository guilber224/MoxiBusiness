import { clientesService } from "../services/clientesService.js";
import { productosService } from "../services/productosService.js";
import { inventarioService } from "../services/inventarioService.js";
import { gastosService } from "../services/gastosService.js";
import { movimientosService } from "../services/movimientosService.js";
import { DEFAULT_CATEGORIES } from "../categories.js";
import { DEFAULT_CONFIG, DEFAULT_ACTIVITY_LOGS } from "./appStorage.js";
import { DEFAULT_USERS } from "../seedData.js";

export const SYNC_KEYS = new Set(["customers", "products", "inventory", "expenses", "movements"]);

// Para productos, excluye img del diff (base64 puede ser enorme — evita stringify lento)
function itemKey(key, item) {
  if (key === "products") { const { img, ...rest } = item; return JSON.stringify(rest); }
  return JSON.stringify(item);
}

// Sincroniza a Supabase el diff entre el array anterior y el nuevo (fire-and-forget)
export async function syncDiff(key, prev, next, user) {
  if (!user?.empresa_id) return;
  const { empresa_id } = user;
  const prevArr = Array.isArray(prev) ? prev : [];
  const nextArr = Array.isArray(next) ? next : [];
  const prevMap = new Map(prevArr.map(item => [item.id, itemKey(key, item)]));
  const nextMap = new Map(nextArr.map(item => [item.id, item]));

  const _logSyncErr = (op, entity, e) => {
    const msg = e?.message ?? String(e);
    if (msg.includes("duplicate key") || msg.includes("already exists") || msg.includes("PGRST204")) return;
    console.error(`[syncDiff] ${op} ${entity} FAILED:`, msg);
  };

  for (const [id, item] of nextMap) {
    const prevJson = prevMap.get(id);
    if (!prevJson) {
      // Insert
      if (key === "customers")  clientesService.createCliente(item, empresa_id).catch(e => _logSyncErr("INSERT", "customers", e));
      if (key === "products")   productosService.upsertProducto({ ...item, empresa_id }).catch(e => _logSyncErr("INSERT", "products", e));
      if (key === "inventory")  inventarioService.upsertStock(item, empresa_id).catch(e => _logSyncErr("INSERT", "inventory", e));
      if (key === "expenses")   gastosService.createGasto(item, empresa_id).catch(e => _logSyncErr("INSERT", "expenses", e));
      if (key === "movements")  movimientosService.createMovimiento(item, empresa_id).catch(e => _logSyncErr("INSERT", "movements", e));
    } else if (prevJson !== itemKey(key, item)) {
      // Update (gastos y movimientos son inmutables — solo clientes/productos/inventario)
      if (key === "customers") clientesService.updateCliente(item, empresa_id).catch(e => _logSyncErr("UPDATE", "customers", e));
      if (key === "products")  productosService.upsertProducto({ ...item, empresa_id }).catch(e => _logSyncErr("UPDATE", "products", e));
      if (key === "inventory") inventarioService.upsertStock(item, empresa_id).catch(e => _logSyncErr("UPDATE", "inventory", e));
    }
  }

  for (const id of prevMap.keys()) {
    if (!nextMap.has(id)) {
      // Delete
      if (key === "customers") clientesService.deleteCliente(id, empresa_id).catch(e => _logSyncErr("DELETE", "customers", e));
      if (key === "products")  productosService.deleteProducto(id, empresa_id).catch(e => _logSyncErr("DELETE", "products", e));
      if (key === "expenses")  gastosService.deleteGasto(id, empresa_id).catch(e => _logSyncErr("DELETE", "expenses", e));
      // inventory y movements: no se eliminan
    }
  }
}

// Estado de aplicación completamente vacío — sin demo data, sin datos de empresa anterior.
// Usar en: logout, cambio de usuario, onboarding incompleto.
export function createEmptyAppState() {
  return {
    customers:    [],
    products:     [],
    inventory:    [],
    sales:        [],
    suppliers:    [],
    purchases:    [],
    formulas:     [],
    orders:       [],
    pedidos:      [],
    expenses:     [],
    movements:    [],
    categories:   DEFAULT_CATEGORIES,
    users:        DEFAULT_USERS,
    config:       DEFAULT_CONFIG,
    activityLogs: DEFAULT_ACTIVITY_LOGS,
  };
}
