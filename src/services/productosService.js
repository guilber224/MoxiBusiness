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
      if (isSupabaseUUID(empresaId)) return null;
      return getLocal(empresaId);
    }
  },

  async upsertProducto(producto) {
    const eid = producto.empresa_id;
    if (!eid) throw new Error("empresa_id requerido");

    // Intenta el upsert; si Supabase devuelve error 42703 (columna inexistente),
    // elimina esa columna y reintenta — repite hasta que todas las columnas válidas pasen.
    let payload = (() => {
      const { id, empresa_id, ...fields } = producto;
      const baseFields = { ...fields, nombre: fields.name || "" };
      return id ? { id, empresa_id, ...baseFields } : { empresa_id, ...baseFields };
    })();

    for (let attempt = 0; attempt < 15; attempt++) {
      const { data, error } = await supabase
        .from("productos")
        .upsert([payload], { onConflict: "id" })
        .select();

      if (!error) return normalizeProducto(data[0]);

      if (error.code === "42703") {
        const match = (error.message || "").match(/column ["']?([^"'\s,]+)["']?/i);
        if (match) {
          const badCol = match[1];
          console.warn(`[productosService] columna "${badCol}" no existe, reintentando sin ella`);
          const { [badCol]: _dropped, ...rest } = payload;
          payload = rest;
          continue;
        }
      }

      // Error no recuperable — loguear y salir del loop
      console.error("[productosService] UPSERT error:", error.code, error.message);
      break;
    }

    // Fallback: guardar en localStorage scoped (persiste aunque Supabase rechace)
    const local = getLocal(eid);
    const idx = local.findIndex(p => p.id === producto.id);
    setLocal(idx >= 0 ? local.map((p, i) => i === idx ? producto : p) : [...local, producto], eid);
    return { ...producto, _localOnly: true };
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
