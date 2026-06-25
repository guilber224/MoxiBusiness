import { supabase } from "../lib/supabaseClient";
import { getScopedStorageKey, isSupabaseUUID } from "../utils/storageScope";
import { withRetry } from "../utils/retry";

const _key = (empresaId) => getScopedStorageKey("inventory", empresaId) || "moxi_inventory";
const getLocal = (empresaId) => { try { return JSON.parse(localStorage.getItem(_key(empresaId))) || []; } catch { return []; } };
const setLocal = (v, empresaId) => localStorage.setItem(_key(empresaId), JSON.stringify(v));

export const inventarioService = {
  async getInventario(empresaId) {
    try {
      if (!empresaId) throw new Error("empresaId requerido");
      const { data, error } = await supabase
        .from("inventario")
        .select("*")
        .eq("empresa_id", empresaId);
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.warn("fallback getInventario:", e.message);
      if (isSupabaseUUID(empresaId)) return [];
      return getLocal(empresaId);
    }
  },

  async upsertStock(item, empresaId) {
    try {
      if (!empresaId) throw new Error("empresaId requerido");
      const result = await withRetry(async () => {
        // Try update first
        const { data: updated, error: upErr } = await supabase
          .from("inventario")
          .update({ stock: item.stock })
          .eq("productId", item.productId)
          .eq("empresa_id", empresaId)
          .select();
        if (upErr) throw upErr;
        if (updated && updated.length > 0) return updated[0];
        // No existing row — insert
        const { data: inserted, error: inErr } = await supabase
          .from("inventario")
          .insert([{ ...item, empresa_id: empresaId }])
          .select();
        if (inErr) {
          console.error("[inventarioService] INSERT error:", inErr.message, "| code:", inErr.code);
          throw inErr;
        }
        return inserted?.[0];
      });
      return result;
    } catch (e) {
      console.error("[inventarioService] upsertStock FALLBACK:", e.message);
      if (!isSupabaseUUID(empresaId)) {
        const local = getLocal(empresaId);
        const idx = local.findIndex(i => i.productId === item.productId);
        const next = idx >= 0 ? local.map((i, j) => j === idx ? item : i) : [...local, item];
        setLocal(next, empresaId);
      }
      return { ...item, _localOnly: true };
    }
  },
};
