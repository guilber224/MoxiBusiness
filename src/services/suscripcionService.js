import { supabase } from "../lib/supabaseClient.js";

function diasDesdeHoy(fecha) {
  return Math.ceil((new Date(fecha + "T23:59:59") - new Date()) / (1000 * 60 * 60 * 24));
}

export const suscripcionService = {
  async getOCrearTrial(empresa_id, nombreEmpresa = "") {
    const { data, error } = await supabase
      .from("suscripciones")
      .select("*")
      .eq("empresa_id", empresa_id)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;

    const vence_el = new Date();
    vence_el.setDate(vence_el.getDate() + 30);
    const { data: created, error: ce } = await supabase
      .from("suscripciones")
      .insert({ empresa_id, nombre_empresa: nombreEmpresa, plan: "trial", vence_el: vence_el.toISOString().split("T")[0], activa: true })
      .select()
      .single();
    if (ce) {
      if (ce.code === "23505") {
        const { data: existing } = await supabase.from("suscripciones").select("*").eq("empresa_id", empresa_id).maybeSingle();
        return existing;
      }
      throw ce;
    }
    return created;
  },

  estaVencida(sus) {
    if (!sus) return false;
    if (!sus.activa) return true;
    return diasDesdeHoy(sus.vence_el) < 0;
  },

  diasRestantes(sus) {
    if (!sus) return 0;
    return diasDesdeHoy(sus.vence_el);
  },

  async getTodasLasSuscripciones() {
    const { data, error } = await supabase
      .from("suscripciones")
      .select("*")
      .order("vence_el", { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async extenderSuscripcion(empresa_id, dias, plan = "activo") {
    const vence_el = new Date();
    vence_el.setDate(vence_el.getDate() + dias);
    const { error } = await supabase
      .from("suscripciones")
      .update({ plan, vence_el: vence_el.toISOString().split("T")[0], activa: true, updated_at: new Date().toISOString() })
      .eq("empresa_id", empresa_id);
    if (error) throw error;
  },

  async toggleActiva(empresa_id, activa) {
    const { error } = await supabase
      .from("suscripciones")
      .update({ activa, updated_at: new Date().toISOString() })
      .eq("empresa_id", empresa_id);
    if (error) throw error;
  },

  async getConfig() {
    const { data } = await supabase.from("sistema_config").select("*").eq("id", 1).maybeSingle();
    return data || { whatsapp_soporte: "+59163506018" };
  },

  async updateWhatsapp(numero) {
    const { error } = await supabase
      .from("sistema_config")
      .update({ whatsapp_soporte: numero, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) throw error;
  },
};
