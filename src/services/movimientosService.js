import { supabase } from "../lib/supabaseClient";
import { getScopedStorageKey, isSupabaseUUID } from "../utils/storageScope";
import { withRetry } from "../utils/retry";

const _key = (empresaId) => getScopedStorageKey("movements", empresaId) || "moxi_movements";
const getLocal = (empresaId) => { try { return JSON.parse(localStorage.getItem(_key(empresaId))) || []; } catch { return []; } };
const setLocal = (v, empresaId) => localStorage.setItem(_key(empresaId), JSON.stringify(v));

export const movimientosService = {
  async getMovimientos(empresaId) {
    try {
      if (!empresaId) throw new Error("empresaId requerido");
      const { data, error } = await supabase
        .from("movimientos")
        .select("*")
        .eq("empresa_id", empresaId);
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.warn("fallback getMovimientos:", e.message);
      if (isSupabaseUUID(empresaId)) return [];
      return getLocal(empresaId);
    }
  },

  async createMovimiento(movimiento, empresaId) {
    try {
      if (!empresaId) throw new Error("empresaId requerido");
      const data = await withRetry(async () => {
        const { data, error } = await supabase
          .from("movimientos")
          .insert([{ ...movimiento, empresa_id: empresaId }])
          .select();
        if (error) {
          console.error("[movimientosService] INSERT error:", error.message, "| code:", error.code);
          throw error;
        }
        return data;
      });
      return data[0];
    } catch (e) {
      console.error("[movimientosService] createMovimiento FALLBACK:", e.message);
      if (!isSupabaseUUID(empresaId)) setLocal([movimiento, ...getLocal(empresaId)], empresaId);
      return { ...movimiento, _localOnly: true };
    }
  },
};
