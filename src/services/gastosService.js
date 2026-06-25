import { supabase } from "../lib/supabaseClient";
import { getScopedStorageKey, isSupabaseUUID } from "../utils/storageScope";
import { withRetry } from "../utils/retry";

const _key = (empresaId) => getScopedStorageKey("expenses", empresaId) || "moxi_expenses";
const getLocal = (empresaId) => { try { return JSON.parse(localStorage.getItem(_key(empresaId))) || []; } catch { return []; } };
const setLocal = (v, empresaId) => localStorage.setItem(_key(empresaId), JSON.stringify(v));

export const gastosService = {
  async getGastos(empresaId) {
    try {
      if (!empresaId) throw new Error("empresaId requerido");
      const { data, error } = await supabase
        .from("gastos")
        .select("*")
        .eq("empresa_id", empresaId);
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.warn("fallback getGastos:", e.message);
      if (isSupabaseUUID(empresaId)) return [];
      return getLocal(empresaId);
    }
  },

  async createGasto(gasto, empresaId) {
    try {
      if (!empresaId) throw new Error("empresaId requerido");
      const payload = {
        ...gasto,
        empresa_id: empresaId,
        descripcion: gasto.description || "",
        monto: gasto.amount ?? 0,
      };
      const data = await withRetry(async () => {
        const { data, error } = await supabase
          .from("gastos")
          .insert([payload])
          .select();
        if (error) {
          console.error("[gastosService] INSERT error:", error.message, "| code:", error.code);
          throw error;
        }
        return data;
      });
      return data[0];
    } catch (e) {
      console.error("[gastosService] createGasto FALLBACK:", e.message);
      if (!isSupabaseUUID(empresaId)) setLocal([...getLocal(empresaId), gasto], empresaId);
      return { ...gasto, _localOnly: true };
    }
  },

  async deleteGasto(id, empresaId) {
    try {
      if (!empresaId) throw new Error("empresaId requerido");
      await withRetry(async () => {
        const { error } = await supabase
          .from("gastos")
          .delete()
          .eq("id", id)
          .eq("empresa_id", empresaId);
        if (error) throw error;
      });
      return { ok: true };
    } catch (e) {
      console.warn("fallback deleteGasto:", e.message);
      if (!isSupabaseUUID(empresaId)) {
        setLocal(getLocal(empresaId).filter(g => g.id !== id), empresaId);
        return { ok: true, local: true };
      }
      return { ok: false, error: e.message };
    }
  },
};
