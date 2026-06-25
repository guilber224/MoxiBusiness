import { supabase } from "../lib/supabaseClient";

export const userService = {
  // Último error de getProfile — útil para mostrar diagnósticos en la UI
  _lastError: null,

  // Carga el perfil del usuario autenticado.
  // Intento 1: RPC get_my_profile() (SECURITY DEFINER — bypasea toda RLS).
  // Intento 2: SELECT directo en tabla usuarios (requiere policy auth.uid() = id).
  async getProfile(authId) {
    this._lastError = null;

    // ── Intento 1: RPC ────────────────────────────────────────────────────────
    try {
      const { data, error } = await supabase.rpc("get_my_profile");
      if (error) {
        this._lastError = `RPC: ${error.message} (${error.code ?? "?"})`;
        console.warn("[userService] get_my_profile RPC error:", error.message, "| code:", error.code);
      } else if (data) {
        const profile = Array.isArray(data) ? data[0] : data;
        if (profile) return profile;
        this._lastError = "RPC: respuesta vacía";
        console.warn("[userService] get_my_profile RPC OK pero data vacía para id:", authId);
      }
    } catch (e) {
      this._lastError = `RPC exception: ${e.message}`;
      console.warn("[userService] get_my_profile RPC exception:", e.message);
    }

    // ── Intento 2: SELECT directo ─────────────────────────────────────────────
    try {
      const { data, error } = await supabase
        .from("usuarios")
        .select("*")
        .eq("id", authId)
        .maybeSingle();
      if (error) {
        this._lastError = `SELECT: ${error.message} (${error.code ?? "?"})`;
        console.warn("[userService] usuarios SELECT error:", error.message, "| code:", error.code);
        return null;
      }
      if (!data) {
        this._lastError = `Sin perfil en tabla usuarios para id: ${authId}`;
        console.warn("[userService] Sin perfil para authId:", authId);
      }
      return data;
    } catch (e) {
      this._lastError = `SELECT exception: ${e.message}`;
      console.warn("[userService] usuarios SELECT exception:", e.message);
      return null;
    }
  },

  async updateProfileName(authId, nombre) {
    try {
      const { data, error } = await supabase
        .from("usuarios")
        .update({ nombre })
        .eq("id", authId)
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (e) {
      console.warn("userService.updateProfileName error:", e.message);
      return null;
    }
  },

  // Carga todos los usuarios de la empresa — usado por UsuariosAdmin y hydration
  async getEmpresaUsuarios(empresaId) {
    try {
      if (!empresaId) return [];
      const { data, error } = await supabase
        .from("usuarios")
        .select("id, nombre, role, email, empresa_id")
        .eq("empresa_id", empresaId);
      if (error) {
        console.warn("[userService] getEmpresaUsuarios error:", error.message);
        return [];
      }
      return (data || []).map(u => ({
        id: u.id,
        name: u.nombre,
        email: u.email,
        role: u.role,
        empresa_id: u.empresa_id,
      }));
    } catch (e) {
      console.warn("[userService] getEmpresaUsuarios exception:", e.message);
      return [];
    }
  },

  async createProfile({ id, email, nombre, role, empresa_id }) {
    try {
      const { data, error } = await supabase
        .from("usuarios")
        .insert([{ id, email: email || "", nombre, role, empresa_id }])
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (e) {
      console.warn("userService.createProfile error:", e.message);
      return null;
    }
  },

  // Crea perfil de trabajador via RPC SECURITY DEFINER — bypasea RLS de INSERT
  // El admin no puede insertar una fila con id != auth.uid() vía INSERT directo.
  async createWorkerProfile({ id, email, nombre, role, empresa_id }) {
    try {
      const { error } = await supabase.rpc("create_worker_profile", {
        p_worker_id: id,
        p_email: email || "",
        p_nombre: nombre,
        p_role: role,
        p_empresa_id: empresa_id,
      });
      if (error) throw error;
      return { id, email, nombre, role, empresa_id };
    } catch (e) {
      console.warn("[userService] createWorkerProfile RPC error:", e.message);
      return null;
    }
  },
};
