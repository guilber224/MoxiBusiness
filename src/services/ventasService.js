import { supabase } from "../lib/supabaseClient";
import { getScopedStorageKey, isSupabaseUUID } from "../utils/storageScope";
import { withRetry } from "../utils/retry";

const _key = (empresaId) => getScopedStorageKey("sales", empresaId) || "moxi_sales";
const getLocal = (empresaId) => { try { return JSON.parse(localStorage.getItem(_key(empresaId))) || []; } catch { return []; } };
const setLocal = (v, empresaId) => localStorage.setItem(_key(empresaId), JSON.stringify(v));

export const ventasService = {
  async getVentas(empresaId) {
    if (!empresaId) return null;

    // Intento 1: select(*) — igual que productosService y gastosService.
    // PostgREST devuelve todas las columnas existentes; columnas adicionales
    // (ej: payment_method añadida por ALTER TABLE) llegan como claves JSON extra,
    // lo cual es válido y normalizeSales las ignora sin problema.
    const { data, error } = await supabase
      .from("ventas")
      .select("*")
      .eq("empresa_id", empresaId);

    if (!error) return data || [];

    console.warn("[getVentas] select(*) falló:", error.code, error.message);

    // Intento 2: solo columnas que analyticsService confirma existen
    const { data: d2, error: e2 } = await supabase
      .from("ventas")
      .select("id,empresa_id,total,paid,debt,items,date,createdAt")
      .eq("empresa_id", empresaId);

    if (!e2) return d2 || [];

    console.error("[getVentas] fallback también falló:", e2.code, e2.message);
    return isSupabaseUUID(empresaId) ? null : getLocal(empresaId);
  },

  async createVenta(venta, user) {
    try {
      if (!venta.empresa_id) throw new Error("empresa_id requerido en venta");
      if (!user?.id) throw new Error("usuario requerido");
      const payload = { ...venta, usuario_id: user.id };
      const data = await withRetry(async () => {
        const { data, error } = await supabase
          .from("ventas")
          .insert([payload])
          .select();
        if (error) {
          console.error("ERROR INSERT venta:", error.message, "| code:", error.code, "| payload keys:", Object.keys(payload).join(","));
          throw error;
        }
        return data;
      });
      return data[0];
    } catch (e) {
      console.error("[ventasService] createVenta FALLBACK:", e.message);
      const nueva = { ...venta, id: venta.id || "v" + Date.now(), _localOnly: true };
      const eid = venta.empresa_id;
      if (!isSupabaseUUID(eid)) setLocal([nueva, ...getLocal(eid)], eid);
      return nueva;
    }
  },

  // Solo actualiza los campos de pago — no re-envía items ni campos pesados
  async updateVenta(id, updates, empresaId) {
    try {
      if (!empresaId) throw new Error("empresaId requerido");
      const { id: _id, empresa_id: _eid, usuario_id: _uid, ...safeFields } = updates;
      const data = await withRetry(async () => {
        const { data, error } = await supabase
          .from("ventas")
          .update(safeFields)
          .eq("id", id)
          .eq("empresa_id", empresaId)
          .select();
        if (error) throw error;
        return data;
      });
      return data[0];
    } catch (e) {
      console.warn("fallback updateVenta:", e.message);
      if (!isSupabaseUUID(empresaId)) {
        setLocal(getLocal(empresaId).map(v => v.id === id ? { ...v, ...updates } : v), empresaId);
        return { id, ...updates };
      }
      return { id, ...updates, _localOnly: true };
    }
  },

  async deleteVenta(id, empresaId) {
    try {
      if (!empresaId) throw new Error("empresaId requerido");
      await withRetry(async () => {
        const { error } = await supabase
          .from("ventas")
          .delete()
          .eq("id", id)
          .eq("empresa_id", empresaId);
        if (error) throw error;
      });
      return { ok: true };
    } catch (e) {
      console.warn("fallback deleteVenta:", e.message);
      if (!isSupabaseUUID(empresaId)) {
        setLocal(getLocal(empresaId).filter(v => v.id !== id), empresaId);
        return { ok: true, local: true };
      }
      return { ok: false, error: e.message };
    }
  },
};
