import { supabase } from "../lib/supabaseClient";
import { getScopedStorageKey, isSupabaseUUID } from "../utils/storageScope";
import { withRetry } from "../utils/retry";

const _key = (empresaId) => getScopedStorageKey("customers", empresaId) || "moxi_customers";
const getLocal = (empresaId) => { try { return JSON.parse(localStorage.getItem(_key(empresaId))) || []; } catch { return []; } };
const setLocal = (v, empresaId) => localStorage.setItem(_key(empresaId), JSON.stringify(v));

// La tabla puede tener 'nombre' (NOT NULL) y/o 'name'. Normaliza siempre a 'name'.
const normalizeCliente = (c) => ({ ...c, name: c.name || c.nombre || "" });

export const clientesService = {
  async getClientes(empresaId) {
    try {
      if (!empresaId) throw new Error("empresaId requerido");
      const { data, error } = await supabase
        .from("clientes")
        .select("*")
        .eq("empresa_id", empresaId);
      if (error) throw error;
      return (data || []).map(normalizeCliente);
    } catch (e) {
      console.warn("fallback getClientes:", e.message);
      if (isSupabaseUUID(empresaId)) return [];
      return getLocal(empresaId);
    }
  },

  async createCliente(cliente, empresaId) {
    try {
      if (!empresaId) throw new Error("empresaId requerido");
      // Enviar 'nombre' además de 'name' para satisfacer NOT NULL si existe en la tabla
      const payload = { ...cliente, nombre: cliente.name || "", empresa_id: empresaId };
      const data = await withRetry(async () => {
        const { data, error } = await supabase
          .from("clientes")
          .insert([payload])
          .select();
        if (error) {
          console.error("[clientesService] INSERT error:", error.message, "| code:", error.code);
          throw error;
        }
        return data;
      });
      return normalizeCliente(data[0]);
    } catch (e) {
      console.error("[clientesService] createCliente FALLBACK:", e.message);
      const fallback = { ...cliente, _localOnly: true };
      if (!isSupabaseUUID(empresaId)) setLocal([...getLocal(empresaId), cliente], empresaId);
      return fallback;
    }
  },

  async updateCliente(cliente, empresaId) {
    try {
      if (!empresaId) throw new Error("empresaId requerido");
      const { id, empresa_id: _eid, ...fields } = cliente;
      const payload = { ...fields, nombre: fields.name || "" };
      const data = await withRetry(async () => {
        const { data, error } = await supabase
          .from("clientes")
          .update(payload)
          .eq("id", id)
          .eq("empresa_id", empresaId)
          .select();
        if (error) throw error;
        return data;
      });
      return normalizeCliente(data[0]);
    } catch (e) {
      console.warn("fallback updateCliente:", e.message);
      if (!isSupabaseUUID(empresaId)) {
        setLocal(getLocal(empresaId).map(c => c.id === cliente.id ? { ...c, ...cliente } : c), empresaId);
        return cliente;
      }
      return { ...cliente, _localOnly: true };
    }
  },

  async deleteCliente(id, empresaId) {
    try {
      if (!empresaId) throw new Error("empresaId requerido");
      await withRetry(async () => {
        const { error } = await supabase
          .from("clientes")
          .delete()
          .eq("id", id)
          .eq("empresa_id", empresaId);
        if (error) throw error;
      });
      return { ok: true };
    } catch (e) {
      console.warn("fallback deleteCliente:", e.message);
      if (!isSupabaseUUID(empresaId)) {
        setLocal(getLocal(empresaId).filter(c => c.id !== id), empresaId);
        return { ok: true, local: true };
      }
      return { ok: false, error: e.message };
    }
  },
};
