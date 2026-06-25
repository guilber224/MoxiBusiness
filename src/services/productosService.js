import { supabase } from "../lib/supabaseClient";
import { getScopedStorageKey, isSupabaseUUID } from "../utils/storageScope";
import { withRetry } from "../utils/retry";

const _key = (empresaId) => getScopedStorageKey("products", empresaId) || "moxi_products";
const getLocal = (empresaId) => { try { return JSON.parse(localStorage.getItem(_key(empresaId))) || []; } catch { return []; } };
const setLocal = (v, empresaId) => localStorage.setItem(_key(empresaId), JSON.stringify(v));

// La tabla puede tener 'nombre' (NOT NULL) y/o 'name'. Normaliza siempre a 'name'.
const normalizeProducto = (p) => ({ ...p, name: p.name || p.nombre || "" });

export const productosService = {
  async getProductos(empresaId) {
    try {
      if (!empresaId) throw new Error("empresaId requerido");
      const { data, error } = await supabase
        .from("productos")
        .select("*")
        .eq("empresa_id", empresaId);
      if (error) throw error;
      return (data || []).map(normalizeProducto);
    } catch (e) {
      console.warn("fallback getProductos:", e.message);
      if (isSupabaseUUID(empresaId)) return [];
      return getLocal(empresaId);
    }
  },

  async upsertProducto(producto) {
    try {
      if (!producto.empresa_id) throw new Error("empresa_id requerido");
      const { id, empresa_id, ...fields } = producto;
      // Incluir 'nombre' para satisfacer NOT NULL si la columna existe en la tabla
      const baseFields = { ...fields, nombre: fields.name || "" };
      const payload = id
        ? { id, empresa_id, ...baseFields }
        : { empresa_id, ...baseFields };
      const data = await withRetry(async () => {
        const { data, error } = await supabase
          .from("productos")
          .upsert([payload], { onConflict: "id" })
          .select();
        if (error) {
          console.error("[productosService] UPSERT error:", error.message, "| code:", error.code);
          throw error;
        }
        return data;
      });
      return normalizeProducto(data[0]);
    } catch (e) {
      console.error("[productosService] upsertProducto FALLBACK:", e.message);
      const eid = producto.empresa_id;
      if (!isSupabaseUUID(eid)) {
        const local = getLocal(eid);
        const idx = local.findIndex(p => p.id === producto.id);
        setLocal(idx >= 0 ? local.map((p, i) => i === idx ? producto : p) : [...local, producto], eid);
      }
      return { ...producto, _localOnly: true };
    }
  },

  async deleteProducto(id, empresaId) {
    try {
      if (!id) throw new Error("id requerido");
      await withRetry(async () => {
        let q = supabase.from("productos").delete().eq("id", id);
        if (empresaId) q = q.eq("empresa_id", empresaId);
        const { error } = await q;
        if (error) throw error;
      });
      return { ok: true };
    } catch (e) {
      console.warn("fallback deleteProducto:", e.message);
      if (!isSupabaseUUID(empresaId)) {
        setLocal(getLocal(empresaId).filter(p => p.id !== id), empresaId);
        return { ok: true, local: true };
      }
      return { ok: false, error: e.message };
    }
  },
};
