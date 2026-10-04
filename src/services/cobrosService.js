import { supabase } from "../lib/supabaseClient.js";
import { comprimirImagen, mensajeError } from "../data/api.js";

// Cobro de suscripciones: planes, datos de cobro de la plataforma y pagos con comprobante.
// Las reglas viven en el servidor (migración 09): aquí solo se llaman.

const ok = ({ data, error }) => { if (error) throw new Error(mensajeError(error)); return data; };
const PLAN_COLS = "id,codigo,nombre,descripcion,precio_mensual,precio_anual,max_usuarios,modulos,caracteristicas,destacado,activo,orden";
const COBRO_COLS = "pago_qr_url,pago_banco,pago_titular,pago_cuenta,pago_instrucciones,whatsapp_soporte,trial_dias";

export const MESES_OPCIONES = [1, 3, 6, 12];
// Mismo cálculo que public.plan_monto (el servidor es quien decide el monto final)
export const montoPlan = (plan, meses) =>
  meses === 12 && plan?.precio_anual != null ? Number(plan.precio_anual) : Number(plan?.precio_mensual || 0) * meses;

export const cobrosService = {
  // ── Mi plan: módulos, límite de usuarios y vigencia (calculado en el servidor) ──
  async miPlan() { return ok(await supabase.rpc("mi_plan")); },

  // ── Planes ──
  async planes() {
    return ok(await supabase.from("planes").select(PLAN_COLS).order("orden").order("precio_mensual"));
  },
  async guardarPlan(plan) {
    const fila = {
      codigo: plan.codigo.trim().toLowerCase(), nombre: plan.nombre.trim(), descripcion: plan.descripcion?.trim() || null,
      precio_mensual: Number(plan.precio_mensual) || 0,
      precio_anual: plan.precio_anual === "" || plan.precio_anual == null ? null : Number(plan.precio_anual),
      max_usuarios: plan.max_usuarios === "" || plan.max_usuarios == null ? null : Number(plan.max_usuarios),
      caracteristicas: (plan.caracteristicas || []).map(s => s.trim()).filter(Boolean),
      modulos: Array.isArray(plan.modulos) ? plan.modulos : null,
      destacado: !!plan.destacado, activo: !!plan.activo, orden: Number(plan.orden) || 0, updated_at: new Date().toISOString(),
    };
    const q = plan.id ? supabase.from("planes").update(fila).eq("id", plan.id) : supabase.from("planes").insert(fila);
    return ok(await q.select(PLAN_COLS).single());
  },
  async eliminarPlan(id) { ok(await supabase.from("planes").delete().eq("id", id)); },

  // ── Datos de cobro (QR, banco) ──
  async datosCobro() {
    return ok(await supabase.from("sistema_config").select(COBRO_COLS).eq("id", 1).maybeSingle()) || {};
  },
  async guardarDatosCobro(d) {
    ok(await supabase.from("sistema_config").update({
      pago_banco: d.pago_banco?.trim() || null, pago_titular: d.pago_titular?.trim() || null,
      pago_cuenta: d.pago_cuenta?.trim() || null, pago_instrucciones: d.pago_instrucciones?.trim() || null,
      pago_qr_url: d.pago_qr_url || null, updated_at: new Date().toISOString(),
    }).eq("id", 1));
  },
  async subirQrCobro(file) {
    const blob = await comprimirImagen(file, 900, "image/png");
    const path = `plataforma/qr-cobro-${Date.now()}.png`;
    ok(await supabase.storage.from("empresa").upload(path, blob, { contentType: "image/png", cacheControl: "31536000" }));
    return supabase.storage.from("empresa").getPublicUrl(path).data.publicUrl;
  },

  // ── Pagos de la empresa ──
  async misSolicitudes(empresaId) {
    return ok(await supabase.from("solicitudes_pago").select("*").eq("empresa_id", empresaId).order("created_at", { ascending: false }).limit(20));
  },
  async solicitarPago({ empresaId, planId, meses, archivo, referencia }) {
    if (!archivo) throw new Error("Adjunta la foto o PDF del comprobante");
    if (archivo.size > 8 * 1024 * 1024) throw new Error("El archivo es muy pesado (máximo 8 MB)");
    const esPdf = archivo.type === "application/pdf";
    if (!esPdf && !archivo.type.startsWith("image/")) throw new Error("El comprobante debe ser una imagen o un PDF");
    const cuerpo = esPdf ? archivo : await comprimirImagen(archivo, 1600, "image/jpeg", 0.85);
    if (cuerpo.size > 5 * 1024 * 1024) throw new Error("El comprobante supera 5 MB. Envía una captura más liviana.");
    const path = `${empresaId}/suscripcion/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${esPdf ? "pdf" : "jpg"}`;
    ok(await supabase.storage.from("comprobantes").upload(path, cuerpo, { contentType: esPdf ? "application/pdf" : "image/jpeg" }));
    return ok(await supabase.rpc("suscripcion_solicitar_pago", { p_plan: planId, p_meses: meses, p_comprobante: path, p_referencia: referencia || null }));
  },

  // ── Superadmin ──
  async solicitudes() {
    return ok(await supabase.from("solicitudes_pago").select("*").order("created_at", { ascending: false }).limit(100));
  },
  async revisarPago(id, aprobar, motivo) {
    return ok(await supabase.rpc("suscripcion_revisar_pago", { p_id: id, p_aprobar: aprobar, p_motivo: motivo || null }));
  },
  async urlComprobante(path) {
    return ok(await supabase.storage.from("comprobantes").createSignedUrl(path, 600)).signedUrl;
  },
};

export { MODULOS_PLAN, SIEMPRE_INCLUIDOS, planIncluye } from "../utils/planes.js";
