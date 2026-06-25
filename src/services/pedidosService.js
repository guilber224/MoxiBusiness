import { supabase } from "../lib/supabaseClient";
import { getScopedStorageKey, isSupabaseUUID } from "../utils/storageScope";
import { withRetry } from "../utils/retry";

// Servicio de Cotizaciones y Pedidos.
// Patrón idéntico a ventasService: Supabase con fallback a localStorage.
// DIFERENCIA CLAVE: getPedidos devuelve `null` (no []) ante error/tabla
// inexistente, para que la hidratación NO sobrescriba los pedidos locales
// si la tabla `pedidos` aún no se creó en Supabase.

const _key = (empresaId) => getScopedStorageKey("pedidos", empresaId) || "moxi_pedidos";
const getLocal = (empresaId) => { try { return JSON.parse(localStorage.getItem(_key(empresaId))) || []; } catch { return []; } };
const setLocal = (v, empresaId) => localStorage.setItem(_key(empresaId), JSON.stringify(v));

export const pedidosService = {
  async getPedidos(empresaId) {
    try {
      if (!empresaId) throw new Error("empresaId requerido");
      const { data, error } = await supabase
        .from("pedidos")
        .select("*")
        .eq("empresa_id", empresaId);
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.warn("fallback getPedidos:", e.message);
      // null → la hidratación conserva los datos locales (no los pisa con [])
      if (isSupabaseUUID(empresaId)) return null;
      return getLocal(empresaId);
    }
  },

  async createPedido(pedido, user) {
    try {
      if (!pedido.empresa_id) throw new Error("empresa_id requerido en pedido");
      if (!user?.id) throw new Error("usuario requerido");
      const payload = { ...pedido, usuario_id: user.id };
      const data = await withRetry(async () => {
        const { data, error } = await supabase
          .from("pedidos")
          .insert([payload])
          .select();
        if (error) throw error;
        return data;
      });
      return data[0];
    } catch (e) {
      console.warn("[pedidosService] createPedido FALLBACK:", e.message);
      const nuevo = { ...pedido, id: pedido.id || "p" + Date.now(), _localOnly: true };
      const eid = pedido.empresa_id;
      if (!isSupabaseUUID(eid)) setLocal([nuevo, ...getLocal(eid)], eid);
      return nuevo;
    }
  },

  async updatePedido(id, updates, empresaId) {
    try {
      if (!empresaId) throw new Error("empresaId requerido");
      const { id: _id, empresa_id: _eid, usuario_id: _uid, _localOnly, ...safeFields } = updates;
      const data = await withRetry(async () => {
        const { data, error } = await supabase
          .from("pedidos")
          .update(safeFields)
          .eq("id", id)
          .eq("empresa_id", empresaId)
          .select();
        if (error) throw error;
        return data;
      });
      return data[0];
    } catch (e) {
      console.warn("fallback updatePedido:", e.message);
      if (!isSupabaseUUID(empresaId)) {
        setLocal(getLocal(empresaId).map(p => p.id === id ? { ...p, ...updates } : p), empresaId);
        return { id, ...updates };
      }
      return { id, ...updates, _localOnly: true };
    }
  },

  async deletePedido(id, empresaId) {
    try {
      if (!empresaId) throw new Error("empresaId requerido");
      await withRetry(async () => {
        const { error } = await supabase
          .from("pedidos")
          .delete()
          .eq("id", id)
          .eq("empresa_id", empresaId);
        if (error) throw error;
      });
      return { ok: true };
    } catch (e) {
      console.warn("fallback deletePedido:", e.message);
      if (!isSupabaseUUID(empresaId)) {
        setLocal(getLocal(empresaId).filter(p => p.id !== id), empresaId);
        return { ok: true, local: true };
      }
      return { ok: false, error: e.message };
    }
  },
};
